import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0014 M5.4f: area attacks you can see. In the Formation Drill the Clay Golem alternates attacks with Shard
 * Burst (radius) and the Two-Headed Ogre sweeps a lane every third action. Playback lights the struck cells and shows
 * every number at once; the screen-reader text lists each member hit with its share of full damage.
 */
const DRILL = 'demo:encounter.formation-drill';
async function startDrill(page: Page): Promise<void> {
  await openRoom(page, '?map=demo:map.supply-room');
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft'] as const) expect(await tapDirection(page, key)).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // Turns to face the solid sigil.
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(DRILL);
}
async function settle(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(() => undefined);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const ORDER: [string, string][] = [['bat', 'Bat'], ['golem', 'Clay Golem'], ['ogre', 'Two-Headed Ogre']];
/** Attack the first living enemy in ORDER that is offered (the kernel test's choices). Watch instead of skipping when asked. */
async function attack(page: Page, watch = false): Promise<void> {
  const hp = (await snapshot(page)).battle!.hp;
  await button(page, 'Attack').click();
  for (const [id, name] of ORDER) if ((hp[id] ?? 0) > 0 && await button(page, name).count()) { await button(page, name).click(); break; }
  if (!watch) await settle(page);
}

test('Shard Burst lights the party grid and hits everyone with falloff; Ogre Sweep hits one lane', { tag: ['@battle'] }, async ({ page }, info) => {
  test.setTimeout(60_000);
  await startDrill(page);
  await settle(page);
  // Up to turn 10 every action is an ordinary attack; the Mage's attack then is followed by the Golem's Shard Burst.
  while ((await snapshot(page)).battle!.turn < 10) await attack(page);
  expect((await snapshot(page)).battle).toMatchObject({ turn: 10, active: 'mage' });
  await attack(page, true);
  // The Mage's hit plays first (560 ms), then the burst lights the cells before its numbers rise.
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('shard-burst.png') });
  await settle(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Clay Golem uses Shard Burst: Hero 3, Archer 3 (80%), Lancer 4 (80%), Mage 2 (50%).');
  expect((await snapshot(page)).battle).toMatchObject({ turn: 12, hp: { hero: 15, archer: 19, lancer: 22, mage: 18 } });
  while ((await snapshot(page)).battle!.turn < 24 && (await snapshot(page)).battle!.phase === 'command') await attack(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Two-Headed Ogre uses Ogre Sweep: Hero 6, Archer 6.');
  expect((await snapshot(page)).battle).toMatchObject({ turn: 24, hp: { hero: 1, archer: 13, lancer: 22, mage: 18 } });
  for (let i = 0; i < 10 && (await snapshot(page)).battle!.phase === 'command'; i++) await attack(page);
  expect((await snapshot(page)).battle).toMatchObject({ phase: 'victory', turn: 29 }); // The kernel's pinned trace (29 since M5.5c's weaknesses).
  // Every lit cell and number was released.
  await button(page, 'Finish').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
});
