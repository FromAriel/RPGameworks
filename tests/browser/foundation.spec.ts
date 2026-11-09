import { openTools, setEffects, enableTouch } from './helpers';
import { test, expect, snapshot, openRoom } from './helpers';

 test('production build boots under /RPGameworks/ with an atlas and crisp logical canvas', { tag: ['@boot', '@smoke'] }, async ({ page }, info) => {
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.phaser).toBe('4.2.1');
  expect(state.renderer).toBe('WebGL');
  expect(state.activeScenes).toBe(1);
  expect(state.displayObjects).toBeGreaterThan(240);
  expect(state.displayObjects).toBeLessThanOrEqual(250); // One room and its owned visuals, with no preallocated effect emitters.
  expect(state.view).toEqual({ width: 640, height: 360, tileSize: 32 });
  await expect(page.locator('canvas')).toHaveAttribute('width', '640');
  await expect(page.locator('canvas')).toHaveAttribute('height', '360');
  const size = await page.locator('canvas').boundingBox();
  expect(size!.width / 640).toBe(1); // 1100 x 850 fits 640 x 360 once; 1280 x 720 and larger enlarge by whole numbers.
  expect(await page.locator('canvas').evaluate((canvas) => getComputedStyle(canvas).imageRendering)).toBe('pixelated');
  await page.screenshot({ path: info.outputPath('foundation-desktop.png'), fullPage: true });
});

 test('keyboard movement, wall collision, release, and blur are bounded', { tag: ['@boot', '@world', '@input'] }, async ({ page }) => {
  await openRoom(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBe(2); // Locked west door blocks tile 1.
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  const stopped = (await snapshot(page)).actorTile;
  await page.waitForTimeout(250);
  expect((await snapshot(page)).actorTile).toEqual(stopped);
  await page.keyboard.up('ArrowDown');
});

 test('cosmetic bursts are capped, expire, and can be disabled without changing the actor', { tag: ['@boot'] }, async ({ page }) => {
  await openRoom(page);
  await setEffects(page, true);
  await enableTouch(page);
  const initial = (await snapshot(page)).actorTile;
  const initialSession = (await snapshot(page)).session;
  const peak = await page.evaluate(async () => {
    let highest = 0;
    for (let i = 0; i < 30; i += 1) {
      document.querySelector<HTMLButtonElement>('#burst')!.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      highest = Math.max(highest, window.__RPGAMEWORKS__!.snapshot().aliveParticles);
    }
    return highest;
  });
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(64);
  expect((await snapshot(page)).pooledParticles).toBeLessThanOrEqual(64);
  await expect.poll(async () => (await snapshot(page)).aliveParticles).toBe(0);
  expect((await snapshot(page)).actorTile).toEqual(initial);
  expect((await snapshot(page)).session).toEqual(initialSession);
  await setEffects(page, false);
  await page.locator('#burst').click();
  await page.waitForTimeout(100);
  expect((await snapshot(page)).aliveParticles).toBe(0);
  expect((await snapshot(page)).session).toEqual(initialSession);
  await page.getByTestId('viewport').focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(initial.x);
  await page.keyboard.up('ArrowRight');
});

 test('twelve restarts keep scene, texture, object, and burst ownership bounded', { tag: ['@boot', '@perf'] }, async ({ page }) => {
  await openRoom(page);
  const baseline = await snapshot(page);
  for (let i = 1; i <= 12; i += 1) {
    await openTools(page, 'debug'); await page.locator('#restart').click();
    await expect.poll(async () => (await snapshot(page)).starts).toBe(baseline.starts + i);
    const state = await snapshot(page);
    expect(state.stops).toBe(i);
    expect(state.activeScenes).toBe(1);
    expect(state.displayObjects).toBe(baseline.displayObjects);
    expect(state.textureCount).toBe(baseline.textureCount);
  }
  await page.getByTestId('viewport').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
  await page.waitForTimeout(100);
  expect((await snapshot(page)).burstRequests).toBe(1);
});

 test('narrow portrait viewport fits 640 x 360 proportionally and keeps pointer controls', { tag: ['@boot', '@shell'] }, async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoom(page);
  expect((await page.locator('canvas').boundingBox())!.width).toBeCloseTo(390, 0); // Below 1x, the documented proportional fallback applies.
  await enableTouch(page);
  const left = page.getByRole('button', { name: 'Move left', exact: true });
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeLessThan(10);
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.screenshot({ path: info.outputPath('foundation-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 280, height: 600 });
  await expect.poll(async () => (await page.locator('canvas').boundingBox())!.width).toBe(280);
  expect(await page.locator('#stage').evaluate((stage) => stage.scrollWidth > stage.clientWidth)).toBe(false);
});

 test('reduced-motion preference disables initial particles; explicit opt-in still works', { tag: ['@boot'] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page);
  await enableTouch(page);
  await expect(page.locator('#effects')).not.toBeChecked();
  await page.locator('#burst').click();
  await page.waitForTimeout(100);
  expect((await snapshot(page)).aliveParticles).toBe(0);
  await setEffects(page, true);
  await page.locator('#burst').click();
  await expect.poll(async () => (await snapshot(page)).aliveParticles).toBeGreaterThan(0);
});

test('authored impact is visible in both rooms and reduced mode, then releases its objects', { tag: ['@boot'] }, async ({ page }, info) => {
  for (const [name, suffix] of [['workshop', ''], ['gallery', '?map=demo:map.gallery']] as const) {
    await page.setViewportSize(name === 'gallery' ? { width: 390, height: 700 } : { width: 960, height: 720 });
    await openRoom(page, suffix);
    await enableTouch(page);
    await page.locator('#burst').click();
    await expect.poll(async () => (await snapshot(page)).activeEffects).toBeGreaterThan(0);
    expect((await snapshot(page)).fallbackEffects).toBe(0);
    await page.screenshot({ path: info.outputPath(`impact-${name}.png`), fullPage: true });
    await expect.poll(async () => (await snapshot(page)).activeEffects).toBe(0);
    expect((await snapshot(page)).aliveParticles).toBe(0);
  }
  await setEffects(page, false);
  await page.locator('#burst').click();
  await expect.poll(async () => (await snapshot(page)).activeEffects).toBeGreaterThan(0);
  expect((await snapshot(page)).aliveParticles).toBe(0);
  await expect.poll(async () => (await snapshot(page)).activeEffects).toBe(0);
});

 test('Canvas renderer fallback boots and moves', { tag: ['@boot'] }, async ({ page }) => {
  await openRoom(page, '?renderer=canvas');
  expect((await snapshot(page)).renderer).toBe('Canvas');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await snapshot(page)).actorTile.y).toBeLessThan(6);
  await page.keyboard.up('ArrowUp');
});

 test('missing atlas shows a visible error rather than a false ready state', { tag: ['@boot'] }, async ({ page }) => {
  await page.route('**/generated/foundation.png', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#error')).toContainText('atlas failed to load');
  expect((await snapshot(page)).phase).toBe('error');
  await expect(page.locator('#restart')).toBeDisabled();
});
