import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0017 M5.5c-2: weakness, break and momentum on the screen. In the Formation Drill the Mage's staff (blunt) is
 * the Clay Golem's weakness: three hits empty its three shield pips and break it. Broken, it is dimmed and loses its
 * next turn; on the turn after, its shield comes back and it brightens again.
 */
const DRILL = 'demo:encounter.formation-drill';
async function startDrill(page: Page): Promise<void> {
  await openRoom(page, '?map=demo:map.supply-room');
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft'] as const) expect(await tapDirection(page, key)).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(DRILL);
}
async function settle(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(() => undefined);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const golem = async (page: Page) => (await snapshot(page)).battle!.art.golem!;

test('weakness hits empty the Golem\'s shield pips and break it; broken it dims, loses a turn, then recovers', { tag: ['@battle'] }, async ({ page }, info) => {
  test.setTimeout(90_000);
  await startDrill(page);
  await settle(page);
  expect(await golem(page)).toMatchObject({ points: 3, broken: false, alpha: 1 });
  expect((await snapshot(page)).battle!.momentum).toBe(0);
  let hits = 0;
  for (let turn = 0; turn < 30 && hits < 3; turn++) {
    const battle = (await snapshot(page)).battle!;
    if (battle.active !== 'mage') { await button(page, 'Guard').click(); await settle(page); continue; }
    await button(page, 'Attack').click();
    // Nothing is known before the first hit; afterwards the help line names the weakness and warns before each hit.
    const help = await button(page, 'Clay Golem').getAttribute('aria-description');
    if (hits === 0) expect(help).not.toContain('Weak');
    else expect(help).toMatch(/Weak: blunt {2}Weak!/);
    await button(page, 'Clay Golem').click();
    hits += 1;
    if (hits === 3) {
      // The third hit plays (560 ms), then the break: a flash, BREAK! in gold, and the Golem dims.
      await page.waitForTimeout(820);
      await page.screenshot({ path: info.outputPath('break.png') });
    }
    await settle(page);
    expect((await golem(page)).points).toBe(3 - hits);
  }
  expect(hits).toBe(3);
  await expect(page.locator('#interaction-dialog')).toContainText('Clay Golem is broken by Mage!');
  expect(await golem(page)).toMatchObject({ points: 0, broken: true, alpha: 0.55 });
  expect((await snapshot(page)).battle!.momentum).toBeGreaterThanOrEqual(3 * 25 + 100);
  await page.screenshot({ path: info.outputPath('broken.png') }); // Hollow pips, the dimmed Golem, a momentum pip.
  // Everyone guards until the Golem has lost its turn and recovered.
  let recovered = false;
  for (let turn = 0; turn < 20 && !recovered; turn++) {
    await button(page, 'Guard').click();
    await settle(page);
    recovered = (await page.locator('#interaction-dialog').textContent())!.includes('Clay Golem recovers');
  }
  expect(recovered).toBe(true);
  expect(await golem(page)).toMatchObject({ points: 3, broken: false, alpha: 1 });
});
