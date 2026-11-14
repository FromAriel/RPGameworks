import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test, type DirectionKey } from './helpers';

/**
 * Decision 0014 M5.4e: a back attack and a pincer on the battle screen (Ariel's answers): in a back attack the party
 * turns around, so its back column stands nearest the enemies; in a pincer the party stands in the middle and each
 * member faces the flank it last fought.
 */
const SUPPLY = 'demo:map.supply-room';
async function walk(page: Page, ...keys: DirectionKey[]): Promise<void> { for (const key of keys) expect(await tapDirection(page, key)).toBe('walked'); }
async function enter(page: Page, encounter: string): Promise<void> {
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(`demo:encounter.${encounter}`);
}
async function settle(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(() => undefined);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
/** Attack the first living enemy in `order` that is offered as a target (unreachable ones are not). */
async function attackFirst(page: Page, order: readonly [string, string][]): Promise<void> {
  const hp = (await snapshot(page)).battle!.hp;
  await button(page, 'Attack').click();
  for (const [id, name] of order) {
    if ((hp[id] ?? 0) > 0 && await button(page, name).count()) { await button(page, name).click(); await settle(page); return; }
  }
  throw new Error('No target offered');
}

test('back attack: the party turns around, its back line now faces the enemies, and the fight plays to victory', { tag: ['@battle'] }, async ({ page }, info) => {
  await openRoom(page, `?map=${SUPPLY}`);
  await walk(page, 'ArrowUp', 'ArrowRight', 'ArrowRight'); // (4,3) → (6,2)
  expect(await tapDirection(page, 'ArrowUp')).toBe('turned'); // The sigil at (6,1) is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.ambush-sigil');
  await enter(page, 'ambush-drill');
  const opening = (await snapshot(page)).battle!;
  expect(opening).toMatchObject({ opening: 'back-attack', active: 'archer', hp: { archer: 18 } }); // Both Bats struck the Archer.
  const art = opening.art;
  // The Mage (back column) stands nearest the enemies and the Hero (front column) furthest; everyone faces left.
  expect(art.mage!.x).toBeLessThan(art.hero!.x);
  expect(art.archer!.x).toBeLessThan(art.hero!.x);
  expect(Math.max(art.golem!.x, art['bat-a']!.x, art['bat-b']!.x)).toBeLessThan(art.mage!.x);
  for (const id of ['hero', 'archer', 'lancer', 'mage']) expect(art[id]!.faces).toBe('left');
  // Shields are measured from behind: the Archer covers the Hero; the Archer and the Mage are exposed.
  expect([art.hero!.shields, art.archer!.shields, art.mage!.shields]).toEqual([1, 0, 0]);
  await settle(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Bat A hits Archer for 1. Bat B hits Archer for 3.');
  await page.screenshot({ path: info.outputPath('back-attack.png') });
  const order: [string, string][] = [['bat-a', 'Bat A'], ['bat-b', 'Bat B'], ['golem', 'Clay Golem']];
  for (let turns = 0; turns < 12 && (await snapshot(page)).battle?.phase === 'command'; turns++) await attackFirst(page, order);
  expect((await snapshot(page)).battle).toMatchObject({ phase: 'victory', turn: 11 }); // The kernel's trace for these choices.
  await button(page, 'Finish').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
});

test('pincer: the party stands between two flanks and each member faces the flank it last fought', { tag: ['@battle'] }, async ({ page }, info) => {
  await openRoom(page, `?map=${SUPPLY}`);
  await walk(page, 'ArrowDown', 'ArrowRight'); // (4,3) → (5,4)
  expect(await tapDirection(page, 'ArrowRight')).toBe('turned'); // The sigil at (6,4) is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.pincer-sigil');
  await enter(page, 'pincer-drill');
  await settle(page);
  let battle = (await snapshot(page)).battle!;
  expect(battle.opening).toBe('pincer');
  const { art } = battle;
  const party = ['hero', 'archer', 'lancer', 'mage'].map(id => art[id]!.x);
  expect(Math.max(art['golem-a']!.x, art['bat-a']!.x)).toBeLessThan(Math.min(...party));
  expect(Math.min(art['golem-b']!.x, art['bat-b']!.x)).toBeGreaterThan(Math.max(...party));
  expect([art['golem-a']!.faces, art['bat-a']!.faces, art['bat-b']!.faces, art['golem-b']!.faces]).toEqual(['right', 'right', 'left', 'left']);
  // The opening: Bat A (front) hit the Hero, Bat B (rear) hit the Archer, so the Archer has turned to the rear.
  expect([art.hero!.faces, art.archer!.faces, art.lancer!.faces]).toEqual(['left', 'right', 'left']);
  await expect(page.locator('#interaction-dialog')).toContainText('Bat A hits Hero for 1. Bat B hits Archer for 1.');
  await page.screenshot({ path: info.outputPath('pincer.png') });
  const order: [string, string][] = [['bat-b', 'Bat B'], ['golem-b', 'Clay Golem B'], ['bat-a', 'Bat A'], ['golem-a', 'Clay Golem A']];
  await attackFirst(page, order); // The Archer hits Bat B.
  await attackFirst(page, order); // The Hero hits Bat B and turns to the rear, where the Archer now stands in front of him.
  battle = (await snapshot(page)).battle!;
  expect(battle.art.hero!.faces).toBe('right');
  expect(battle.art.hero!.shields).toBe(1);
  await page.screenshot({ path: info.outputPath('pincer-turned.png') });
  for (let turns = 0; turns < 16 && (await snapshot(page)).battle?.phase === 'command'; turns++) await attackFirst(page, order);
  expect((await snapshot(page)).battle).toMatchObject({ phase: 'victory', turn: 19 }); // The kernel's trace for these choices.
});
