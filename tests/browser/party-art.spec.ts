import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0019 S1.5d: the party drawn from its baked LPC art. In battle each member stands facing the enemies, steps in
 * and strikes with its weapon's animation, and lies down when it falls; the turn timeline and the menus show its
 * head-and-shoulders portrait. Without the art, every member keeps its placeholder frame.
 */
const PRACTICE = 'demo:encounter.practice-sigil';
async function startPractice(page: Page): Promise<void> {
  await openRoom(page, '?map=demo:map.supply-room');
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // Face the sigil.
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(PRACTICE);
}
const settled = async (page: Page) => expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 15_000 }).toBe(false);
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const art = async (page: Page) => (await snapshot(page)).battle!.art;

test('the party stands, strikes and is portrayed in its LPC art', { tag: ['@battle', '@inventory'] }, async ({ page }, info) => {
  await openRoom(page, '?map=demo:map.supply-room');
  await page.keyboard.press('KeyI');
  // Hub cards: each portrait is the 20-pixel head and shoulders drawn at 2×.
  const portraits = page.locator('#game-menu .menu-card-portrait canvas');
  await expect(portraits).toHaveCount(4);
  expect(await portraits.evaluateAll(list => list.map(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]))).toEqual([[40, 40], [40, 40], [40, 40], [40, 40]]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();
  await page.goto('about:blank');

  await startPractice(page);
  await settled(page);
  const standing = await art(page);
  for (const id of ['hero', 'archer', 'lancer', 'mage']) expect(standing[id]!.source, id).toBe('lpc');
  expect([standing.hero!.frame, standing.archer!.frame, standing.mage!.frame]).toEqual(['hero/stand/left', 'archer/stand/left', 'mage/stand/left']);
  await page.screenshot({ path: info.outputPath('standing.png') });
  // The archer acts first: it shoots, frame by frame, then stands again.
  expect((await snapshot(page)).battle!.active).toBe('archer');
  await button(page, 'Attack').click();
  await button(page, 'Bat').click();
  const seen = new Set<string>();
  await expect.poll(async () => { seen.add((await art(page)).archer!.frame); return [...seen].filter(f => f.startsWith('archer/shoot/left/')).length; }, { timeout: 3000, intervals: [30] }).toBeGreaterThan(2);
  await settled(page);
  expect((await art(page)).archer!.frame).toBe('archer/stand/left');
});

test('the map hero keeps its LPC art after a battle removes its own texture', { tag: ['@battle', '@world'] }, async ({ page }) => {
  await openRoom(page, '?map=demo:map.supply-room');
  await expect.poll(async () => (await snapshot(page)).heroArt).toBe('lpc');
  const before = (await snapshot(page)).textureCount;
  await page.goto('about:blank');
  await startPractice(page);
  await settled(page);
  await button(page, 'Run').click();
  await settled(page);
  await button(page, 'Leave').click();
  await expect(page.locator('#stage')).toBeFocused();
  const state = await snapshot(page);
  expect(state.battle).toBeNull();
  expect(state.heroArt).toBe('lpc'); // Decision 0019 S1.5f: the map owns its own party texture.
  expect(state.heroFrame).toBe('hero/stand/left');
  expect(state.textureCount).toBe(before); // The battle's party and creature textures are gone; the map's remains.
});

test('a fallen member lies down, dimmed', { tag: ['@battle'] }, async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', async route => {
    const response = await route.fetch();
    const catalog = await response.json() as { encounters: { id: string; enemies: { attack: number }[] }[] };
    for (const enemy of catalog.encounters.find(e => e.id === PRACTICE)!.enemies) enemy.attack = 20;
    await route.fulfill({ json: catalog });
  });
  await startPractice(page);
  await settled(page);
  for (let turn = 0; turn < 24 && (await snapshot(page)).battle?.phase === 'command'; turn++) { await button(page, 'Guard').click(); await settled(page); }
  const battle = (await snapshot(page)).battle!;
  const fallen = Object.entries(battle.hp).filter(([id, hp]) => ['hero', 'archer', 'lancer', 'mage'].includes(id) && hp === 0).map(([id]) => id);
  expect(fallen.length).toBeGreaterThan(0);
  for (const id of fallen) expect(battle.art[id], id).toMatchObject({ source: 'lpc', frame: `${id}/hurt/front/5`, alpha: 0.25 });
});

test('without the party art, every member keeps its placeholder frame and portrait', { tag: ['@battle', '@inventory'] }, async ({ page }) => {
  await page.route('**/generated/content/party-art.*.png', route => route.abort());
  await startPractice(page);
  await settled(page);
  expect(await art(page)).toMatchObject({ hero: { source: 'frame', frame: 'hero-left' }, archer: { source: 'frame', frame: 'archer-left' } });
  await button(page, 'Attack').click();
  await button(page, 'Bat').click();
  await expect.poll(async () => (await snapshot(page)).battle?.turn).toBeGreaterThan(1);
  await expect(page.locator('#error')).toBeHidden();
});
