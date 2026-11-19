import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0017 M5.5d: what a fight shows is remembered. The Mage finds the Clay Golem's weakness and breaks it; the
 * party runs. The Codex then shows "Weak: blunt." and "Broken in battle.", and in the next fight the help line names the
 * weakness before anyone has hit the Golem.
 */
const DRILL = 'demo:encounter.formation-drill';
async function startDrill(page: Page, open = true): Promise<void> {
  if (open) {
    await openRoom(page, '?map=demo:map.supply-room');
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft'] as const) expect(await tapDirection(page, key)).toBe('walked');
    expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none');
  }
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(DRILL);
  await settle(page);
}
async function settle(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(() => undefined);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const codex = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:catalog"]');

test('a break and a weakness found in one fight show in the Codex and in the next fight\'s help line', { tag: ['@battle', '@inventory'] }, async ({ page }, info) => {
  test.setTimeout(90_000);
  await startDrill(page);
  for (let turn = 0; turn < 30 && !(await snapshot(page)).battle!.art.golem!.broken; turn++) {
    if ((await snapshot(page)).battle!.active === 'mage') { await button(page, 'Attack').click(); await button(page, 'Clay Golem').click(); }
    else await button(page, 'Guard').click();
    await settle(page);
  }
  expect((await snapshot(page)).battle!.art.golem!.broken).toBe(true);
  // Running ends the attempt; what it showed is recorded.
  await button(page, 'Run').click();
  await settle(page);
  await button(page, 'Leave').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');

  await page.keyboard.press('KeyI');
  await page.locator('#game-menu .menu-row[data-id="codex"]').click();
  await expect(codex(page)).toBeVisible();
  await expect(codex(page).locator('.menu-detail')).toContainText('Weak: blunt.'); // The Clay Golem is the first creature.
  await expect(codex(page).locator('.menu-detail')).toContainText('Broken in battle.');
  await page.keyboard.press('ArrowDown');
  await expect(codex(page).locator('.menu-detail')).toContainText('Affinities: none found yet.'); // The Bat: nothing learned.
  await page.screenshot({ path: info.outputPath('codex-golem.png') });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();

  // The next fight: the help line knows the weakness before the first hit.
  await startDrill(page, false);
  for (let turn = 0; turn < 8 && (await snapshot(page)).battle!.active !== 'mage'; turn++) { await button(page, 'Guard').click(); await settle(page); }
  await button(page, 'Attack').click();
  expect(await button(page, 'Clay Golem').getAttribute('aria-description')).toMatch(/Weak: blunt {2}Weak!/);
});
