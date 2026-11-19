import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0018 M5.5b-2: the Special menu. Each member's skill is listed with its MP cost; choosing one aims it like an
 * Attack, an area skill lighting the cells it would hit; using it spends MP, which the party window shows beside HP.
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
const ENEMIES = ['Bat', 'Clay Golem', 'Two-Headed Ogre'];
/** Guard through other members' turns until `id` is active. */
async function until(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 12 && (await snapshot(page)).battle!.active !== id; i++) { await button(page, 'Guard').click(); await settle(page); }
  expect((await snapshot(page)).battle!.active).toBe(id);
}
/** Aim at the first enemy offered. */
async function aim(page: Page): Promise<void> {
  for (const name of ENEMIES) if (await button(page, name).count()) { await button(page, name).click(); return; }
  throw new Error('No enemy offered');
}

test('Special lists each member\'s skill with its MP cost, aims it, and spends MP', { tag: ['@battle'] }, async ({ page }, info) => {
  test.setTimeout(60_000);
  await startDrill(page);
  await settle(page);
  expect((await snapshot(page)).battle!.mp).toMatchObject({ hero: 12, archer: 14, lancer: 10, mage: 20 });
  await page.screenshot({ path: info.outputPath('party-mp.png') });

  await until(page, 'hero');
  await button(page, 'Special').click();
  await expect(button(page, 'Cleave (4 MP)')).toBeVisible();
  await button(page, 'Cleave (4 MP)').click();
  expect((await snapshot(page)).battle!.menu).toMatchObject({ level: 'target', area: 'lane' });
  await aim(page);
  await settle(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Hero uses Cleave:');
  expect((await snapshot(page)).battle!.mp.hero).toBe(8);

  await until(page, 'archer');
  await button(page, 'Special').click();
  await button(page, 'Volley (5 MP)').click();
  expect((await snapshot(page)).battle!.menu).toMatchObject({ level: 'target', area: 'radius' });
  await page.screenshot({ path: info.outputPath('volley-aim.png') }); // The enemy cells it would hit are lit.
  // Cancel backs out to the skill list, then to the command column with Special marked.
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).battle!.menu).toMatchObject({ level: 'skill', area: null });
  await page.keyboard.press('Enter');
  await aim(page);
  await page.waitForTimeout(450);
  await page.screenshot({ path: info.outputPath('volley-hit.png') }); // Lit on the enemy grid, not the party's.
  await settle(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Archer uses Volley:');
  expect((await snapshot(page)).battle!.mp.archer).toBe(9);

  await until(page, 'mage');
  await button(page, 'Special').click();
  await button(page, 'Fire Bolt (4 MP)').click();
  expect((await snapshot(page)).battle!.menu).toMatchObject({ level: 'target', area: null });
  await aim(page);
  await settle(page);
  await expect(page.locator('#interaction-dialog')).toContainText('Mage uses Fire Bolt on');
  expect((await snapshot(page)).battle!.mp.mage).toBe(16);
});
