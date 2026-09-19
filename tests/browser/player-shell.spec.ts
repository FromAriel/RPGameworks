import { test, expect, openRoom, snapshot, openTools, closeTools } from './helpers';

test('launch is only the centered game, black letterboxing, and a compact menu', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await expect(page.locator('#stage')).toBeFocused();
  await expect(page.locator('#loading-notice')).toBeHidden();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(page.locator('#touch-controls')).toBeHidden();
  await expect(page.locator('#status')).toBeHidden();
  await expect(page.locator('#build-label')).toBeHidden();
  await expect(page.locator('#controller-activate')).toBeHidden();
  await expect(page.locator('#diagnostics div')).toHaveCount(0);
  await expect(page.locator('#tools-toggle')).toBeVisible();
  await expect(page).toHaveTitle('RPGameworks');
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBe(1280);
  const canvas = (await page.locator('canvas').boundingBox())!;
  expect(canvas).toMatchObject({ x: 80, y: 66, width: 1280, height: 768 });
  expect(await page.locator('#stage').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
  await page.screenshot({ path: info.outputPath('player-clean.png') });
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await page.keyboard.up('ArrowRight');
});

test('Debug docks beside play, stays live, and stops rebuilding rows when closed', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoom(page);
  await page.keyboard.press('F2');
  await expect(page.locator('#debug-panel')).toBeVisible();
  await expect(page.locator('#debug-tab')).toBeFocused();
  await expect(page.locator('#diagnostics div')).toHaveCount(14);
  await expect.poll(async () => (await page.locator('#stage').boundingBox())?.width).toBe(1080);
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBe(960);
  await page.locator('#stage').click({ position: { x: 50, y: 50 } });
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeLessThan(10);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  const tile = (await snapshot(page)).actorTile;
  await expect(page.locator('#diagnostics div').filter({ has: page.locator('dt', { hasText: /^Player tile$/ }) })).toContainText(`${tile.x}, ${tile.y}`);
  await page.screenshot({ path: info.outputPath('player-debug-docked.png') });
  await page.keyboard.press('F2');
  await expect(page.locator('#tools-panel')).toBeHidden();
  const mutations = await page.locator('#diagnostics').evaluate(async root => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    await new Promise(resolve => setTimeout(resolve, 650));
    observer.disconnect(); return count;
  });
  expect(mutations).toBe(0);
  await expect.poll(async () => (await page.locator('canvas').boundingBox())?.width).toBe(1280);
});

test('menu tabs support keyboard navigation and repeated opening does not recreate the game', async ({ page }) => {
  await openRoom(page); const initial = await snapshot(page);
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Escape');
    await expect(page.locator('#inventory-dialog')).toBeVisible();
    await page.locator('#inventory-settings').click();
    await expect(page.locator('#options-tab')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#debug-tab')).toBeFocused();
    await expect(page.locator('#options-panel')).toBeHidden();
    await page.keyboard.press('Home');
    await expect(page.locator('#options-tab')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#tools-panel')).toBeHidden();
    await expect(page.locator('#stage')).toBeFocused();
  }
  const final = await snapshot(page);
  expect(final.starts).toBe(initial.starts); expect(final.stops).toBe(initial.stops);
  expect(final.displayObjects).toBe(initial.displayObjects); expect(final.textureCount).toBe(initial.textureCount);
  expect(final.actorTile).toEqual(initial.actorTile); expect(final.burstRequests).toBe(0);
});

test('dialogue keeps Escape and F2 cannot cover an active conversation', async ({ page }, info) => {
  await openRoom(page);
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(true);
  await page.keyboard.up('ArrowDown');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  expect((await snapshot(page)).actorTile).toEqual({ x: 10, y: 7 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toBeVisible();
  await page.keyboard.press('F2');
  await expect(page.locator('#tools-panel')).toBeHidden();
  const box = (await page.locator('#interaction-dialog').boundingBox())!;
  expect(box.y).toBeGreaterThan(400); expect(box.y + box.height).toBeLessThanOrEqual(850);
  await page.screenshot({ path: info.outputPath('player-conversation.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#interaction-dialog')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
  await expect(page.locator('#tools-panel')).toBeHidden();
});

test('controller input pauses in the menu and does not replay a held action when closed', async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { id: 'shell-test', index: 0, connected: true, mapping: 'standard', axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  await openRoom(page);
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await openTools(page);
  await page.evaluate(() => {
    const pad = navigator.getGamepads()[0]!;
    (pad.axes as number[])[0] = .9;
    Object.assign(pad.buttons[0]!, { pressed: true, value: 1 });
  });
  await page.waitForTimeout(250);
  expect((await snapshot(page)).actorTile.x).toBe(10);
  expect((await snapshot(page)).burstRequests).toBe(0);
  await closeTools(page); await page.waitForTimeout(200);
  expect((await snapshot(page)).actorTile.x).toBe(10);
  expect((await snapshot(page)).burstRequests).toBe(0);
  await page.evaluate(() => {
    const pad = navigator.getGamepads()[0]!;
    (pad.axes as number[])[0] = 0; Object.assign(pad.buttons[0]!, { pressed: false, value: 0 });
  });
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await page.evaluate(() => { (navigator.getGamepads()[0]!.axes as number[])[0] = .9; });
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
});

test('fatal loading errors stay visible outside the hidden debug interface', async ({ page }) => {
  await page.route('**/generated/content/game.json', route => route.abort());
  await page.goto('./');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#loading-notice')).toBeHidden();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await openTools(page, 'debug');
  await expect(page.locator('#status')).toContainText('could not continue');
});

test('small, wide, and large viewports fit without cropping or scrollbars', async ({ page }, info) => {
  await openRoom(page);
  for (const [width, height, zoom] of [[280,160,160/192], [390,844,1], [844,390,2], [3840,2160,11]]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect.poll(async () => (await page.locator('canvas').boundingBox())!.width).toBeCloseTo(320*zoom!, 1);
    const box = (await page.locator('canvas').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(width!+.1); expect(box.y+box.height).toBeLessThanOrEqual(height!+.1);
    await expect(page.locator('canvas')).toHaveAttribute('width','320');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openTools(page, 'debug');
  expect((await page.locator('#stage').boundingBox())!.width).toBe(390);
  await page.screenshot({ path: info.outputPath('player-debug-narrow.png') });
  await closeTools(page);
  await page.screenshot({ path: info.outputPath('player-clean-narrow.png') });
});

test('open tools are not restored on reload and closing nested settings cannot leave input blocked', async ({ page }) => {
  await openRoom(page); await openTools(page);
  await page.locator('#controller-settings summary').click();
  await closeTools(page);
  await expect(page.locator('#controller-settings')).not.toHaveAttribute('open','');
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeLessThan(10);
  await page.keyboard.up('ArrowLeft');
  await openTools(page,'debug'); await page.reload();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
});

test.describe('touch-first player layout', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('touch controls appear automatically but diagnostics stay hidden', async ({ page }, info) => {
    await openRoom(page);
    await expect(page.locator('#touch-controls')).toBeVisible();
    await expect(page.locator('#tools-panel')).toBeHidden();
    await page.screenshot({ path: info.outputPath('player-touch.png') });
    await openTools(page); await page.locator('#touch-enabled').uncheck(); await closeTools(page);
    await expect(page.locator('#touch-controls')).toBeHidden();
  });
});
