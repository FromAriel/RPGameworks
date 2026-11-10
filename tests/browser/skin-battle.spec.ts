import type { Page, TestInfo } from '@playwright/test';
import { test, expect, openRoom, snapshot, tapDirection } from './helpers';
import { SKIN_SPECS, atlasDataUrl, buildSkin } from '../fixtures/skin-fixtures';

/**
 * Decision 0011 W3.5: battle windows are composed by the theme's battle skin, with one texture per window size
 * released when the battle ends; a battle skin that cannot load falls back to M5.3c's panels and stays playable.
 */
const SUPPLY = 'demo:map.supply-room', ENCOUNTER = 'demo:encounter.practice-sigil', FIXTURE = 'demo:skin.fixture';

/** Point the theme's battle surface at a fixture skin, served through routes (content only, no code change). */
async function battleSkin(page: Page, index: number, atlas: 'ok' | 'missing' = 'ok'): Promise<void> {
  const built = buildSkin(SKIN_SPECS[index]!);
  const png = Buffer.from(atlasDataUrl(built).split(',')[1]!, 'base64');
  await page.route('**/generated/content/skins/fixture.json', (route) => route.fulfill({ json: { ...built.skin, image: 'fixture.png' } }));
  await page.route('**/generated/content/skins/fixture.png', (route) => atlas === 'ok'
    ? route.fulfill({ contentType: 'image/png', body: png }) : route.fulfill({ status: 404, body: 'missing' }));
  await page.route('**/generated/content/ui-theme.*.json', async (route) => {
    const theme = await (await route.fetch()).json() as { skins: { id: string; manifest: string; atlas: string }[]; surfaces: Record<string, string> };
    theme.skins.push({ id: FIXTURE, manifest: 'skins/fixture.json', atlas: 'skins/fixture.png' });
    theme.surfaces.battle = FIXTURE;
    await route.fulfill({ json: theme });
  });
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/** Walk to the Practice Sigil, start the battle, let the opening play, capture it, then Run and Leave. */
async function runBattle(page: Page, info: TestInfo, capture: string): Promise<'skin' | 'fallback'> {
  await openRoom(page, `?map=${SUPPLY}`);
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none');
  const before = await snapshot(page);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(ENCOUNTER);
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 8000 }).toBe(false);
  await expect(button(page, 'Attack')).toBeFocused();
  const source = (await snapshot(page)).battle!.windows;
  await page.screenshot({ path: info.outputPath(capture) });
  await button(page, 'Run').click();
  await expect.poll(async () => (await snapshot(page)).battle?.phase, { timeout: 8000 }).toBe('escaped');
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 8000 }).toBe(false);
  await button(page, 'Leave').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  const after = await snapshot(page);
  expect(after.displayObjects, 'display objects back to their pre-battle count').toBe(before.displayObjects);
  expect(after.textureCount, 'every battle window texture released').toBe(before.textureCount);
  return source;
}

test('battle windows use Ariel’s skin from the theme and release their textures', { tag: ['@battle', '@windows'] }, async ({ page }, info) => {
  expect(await runBattle(page, info, 'battle-ariel-skin.png')).toBe('skin');
});

test('a thick fixture battle skin grows the help window and bottom band, and stays playable', { tag: ['@battle', '@windows'] }, async ({ page }, info) => {
  await battleSkin(page, SKIN_SPECS.findIndex((s) => s.name.startsWith('thick')));
  expect(await runBattle(page, info, 'battle-thick-skin.png')).toBe('skin');
});

test('a battle skin that cannot load falls back to the original panels and stays playable', { tag: ['@battle', '@windows'] }, async ({ page }, info) => {
  await battleSkin(page, 0, 'missing');
  expect(await runBattle(page, info, 'battle-fallback.png')).toBe('fallback');
});
