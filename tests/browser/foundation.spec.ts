import { test, expect, snapshot, openRoom } from './helpers';

 test('production build boots under /RPGameworks/ with an atlas and crisp logical canvas', async ({ page }, info) => {
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.phaser).toBe('4.2.1');
  expect(state.renderer).toBe('WebGL');
  expect(state.activeScenes).toBe(1);
  expect(state.displayObjects).toBe(243);
  await expect(page.locator('canvas')).toHaveAttribute('width', '320');
  await expect(page.locator('canvas')).toHaveAttribute('height', '192');
  const size = await page.locator('canvas').boundingBox();
  expect(size!.width / 320).toBe(2);
  expect(await page.locator('canvas').evaluate((canvas) => getComputedStyle(canvas).imageRendering)).toBe('pixelated');
  await page.screenshot({ path: info.outputPath('foundation-desktop.png'), fullPage: true });
});

 test('keyboard movement, wall collision, release, and blur are bounded', async ({ page }) => {
  await openRoom(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await page.keyboard.up('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBe(1);
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

 test('cosmetic bursts are capped, expire, and can be disabled without changing the actor', async ({ page }) => {
  await openRoom(page);
  await page.locator('#effects').check();
  const initial = (await snapshot(page)).actorTile;
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
  await page.locator('#effects').uncheck();
  await page.locator('#burst').click();
  await page.waitForTimeout(100);
  expect((await snapshot(page)).aliveParticles).toBe(0);
  await page.getByTestId('viewport').focus();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(initial.x);
  await page.keyboard.up('ArrowRight');
});

 test('twelve restarts keep scene, texture, object, and burst ownership bounded', async ({ page }) => {
  await openRoom(page);
  const baseline = await snapshot(page);
  for (let i = 1; i <= 12; i += 1) {
    await page.locator('#restart').click();
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

 test('small viewport uses 1x pixels and pointer controls, not fractional stretching', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoom(page);
  expect((await page.locator('canvas').boundingBox())!.width).toBe(320);
  const left = page.getByRole('button', { name: 'Move left', exact: true });
  const box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeLessThan(10);
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.screenshot({ path: info.outputPath('foundation-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 280, height: 600 });
  await expect.poll(async () => (await page.locator('canvas').boundingBox())!.width).toBe(320);
  expect(await page.locator('#stage').evaluate((stage) => stage.scrollWidth > stage.clientWidth)).toBe(true);
});

 test('reduced-motion preference disables initial particles; explicit opt-in still works', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page);
  await expect(page.locator('#effects')).not.toBeChecked();
  await page.locator('#burst').click();
  await page.waitForTimeout(100);
  expect((await snapshot(page)).aliveParticles).toBe(0);
  await page.locator('#effects').check();
  await page.locator('#burst').click();
  await expect.poll(async () => (await snapshot(page)).aliveParticles).toBeGreaterThan(0);
});

 test('Canvas renderer fallback boots and moves', async ({ page }) => {
  await openRoom(page, '?renderer=canvas');
  expect((await snapshot(page)).renderer).toBe('Canvas');
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await snapshot(page)).actorTile.y).toBeLessThan(6);
  await page.keyboard.up('ArrowUp');
});

 test('missing atlas shows a visible error rather than a false ready state', async ({ page }) => {
  await page.route('**/generated/foundation.png', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#error')).toContainText('atlas failed to load');
  expect((await snapshot(page)).phase).toBe('error');
  await expect(page.locator('#restart')).toBeDisabled();
});
