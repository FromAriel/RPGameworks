import { test, expect, openRoom, openTools, snapshot } from './helpers';

test('selected layered hero idles, walks, mirrors left, and keeps its feet on the tile', async ({ page }) => {
  await openRoom(page);
  let state = await snapshot(page);
  expect(state.characterArtStatus).toBe('ready');
  expect(state.heroArt).toBe('layered');
  expect(state.heroFrame).toMatch(/^idle\|down\|[0-5]$/);
  expect(state.heroFeet).toEqual({ x: state.actorPixel.x, y: state.actorPixel.y + 8 });
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).heroFrame).toMatch(/^walk\|side\|[0-5]$/);
  state = await snapshot(page);
  expect(state.heroMirrored).toBe(true);
  expect(state.heroFeet).toEqual({ x: state.actorPixel.x, y: state.actorPixel.y + 8 });
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).heroMirrored).toBe(false);
  await page.keyboard.up('ArrowRight');
});

test('a failed pack request leaves the static hero visible and gameplay usable', async ({ page }) => {
  await page.route('**/character/starter-hero.rpgpack', route => route.abort());
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.characterArtStatus).toBe('fallback');
  expect(state.heroArt).toBe('static');
  await expect(page.locator('#status')).toContainText('original hero remains playable');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(state.actorTile.x);
  await page.keyboard.up('ArrowRight');
});

test('a corrupt pack leaves the static hero visible with a clear error', async ({ page }) => {
  await page.route('**/character/starter-hero.rpgpack', route => route.fulfill({ body: 'invalid character pack' }));
  await openRoom(page);
  const state = await snapshot(page);
  expect(state.characterArtStatus).toBe('fallback');
  expect(state.heroArt).toBe('static');
  await expect(page.locator('#status')).toContainText('Character art could not load');
});

test('narrow viewport and repeated restarts retain one layered hero and bounded textures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoom(page, '?map=demo:map.gallery');
  const baseline = await snapshot(page);
  expect(baseline.heroArt).toBe('layered');
  for (let index = 1; index <= 3; index += 1) {
    await openTools(page, 'debug');
    await page.locator('#restart').click();
    await expect.poll(async () => (await snapshot(page)).starts).toBe(baseline.starts + index);
    const state = await snapshot(page);
    expect(state.heroArt).toBe('layered');
    expect(state.textureCount).toBe(baseline.textureCount);
    expect(state.displayObjects).toBe(baseline.displayObjects);
  }
});
