import { test, expect, openRoom, openTools, snapshot } from './helpers';

/**
 * Decision 0019 S1.5f: the map hero is the party leader drawn from the party's baked LPC art. It stands on LPC's
 * at-rest frame, walks each way with that way's own row, and keeps its feet on the bottom edge of its tile. Without the
 * art it keeps the placeholder frame and the game stays playable.
 */
test('the LPC hero stands, walks each way with its own row, and keeps its feet on the tile', { tag: ['@world'] }, async ({ page }) => {
  await openRoom(page);
  let state = await snapshot(page);
  expect(state.characterArtStatus).toBe('ready');
  expect(state.heroArt).toBe('lpc');
  expect(state.heroFrame).toBe(`hero/stand/${state.facing}`);
  expect(state.heroFeet).toEqual({ x: state.actorPixel.x, y: state.actorPixel.y + state.view.tileSize / 2 });
  for (const [key, side] of [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowDown', 'down'], ['ArrowUp', 'up']] as const) {
    await page.keyboard.down(key);
    await expect.poll(async () => (await snapshot(page)).heroFrame).toMatch(new RegExp(`^hero/walk/${side}/[0-7]$`));
    state = await snapshot(page);
    expect(state.heroFeet).toEqual({ x: Math.round(state.actorPixel.x), y: Math.round(state.actorPixel.y + state.view.tileSize / 2) });
    await page.keyboard.up(key);
    await expect.poll(async () => (await snapshot(page)).heroFrame).toBe(`hero/stand/${side}`);
  }
});

test('a failed art request leaves the placeholder hero visible and gameplay usable', { tag: ['@world', '@smoke'] }, async ({ page }) => {
  await page.route('**/generated/content/party-art.*.png', route => route.abort());
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.characterArtStatus).toBe('fallback');
  expect(state.heroArt).toBe('static');
  expect(state.heroFrame).toBeNull();
  await expect(page.locator('#status')).toContainText('original hero remains playable');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(state.actorTile.x);
  await page.keyboard.up('ArrowRight');
});

test('a corrupt frame table leaves the placeholder hero visible with a clear error', { tag: ['@world'] }, async ({ page }) => {
  await page.route('**/generated/content/party-art.*.json', route => route.fulfill({ json: { format: 'not a party atlas' } }));
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.characterArtStatus).toBe('fallback');
  expect(state.heroArt).toBe('static');
  await expect(page.locator('#status')).toContainText('Character art could not load');
});

test('narrow viewport and repeated restarts retain one LPC hero and bounded textures', { tag: ['@world'] }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoom(page, '?map=demo:map.gallery');
  const baseline = await snapshot(page);
  expect(baseline.heroArt).toBe('lpc');
  for (let index = 1; index <= 3; index += 1) {
    await openTools(page, 'debug');
    await page.locator('#restart').click();
    await expect.poll(async () => (await snapshot(page)).starts).toBe(baseline.starts + index);
    await expect.poll(async () => (await snapshot(page)).heroArt).toBe('lpc');
    const state = await snapshot(page);
    expect(state.textureCount).toBe(baseline.textureCount);
    expect(state.displayObjects).toBe(baseline.displayObjects);
  }
});
