import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Enemy HP (Ariel, after M5.4): every enemy's HP is a thin gauge under its name in the enemy window, always visible;
 * the stage bar shows only while the enemy is targeted and for a moment after it is hit, so it does not cover the art.
 */
async function enterPractice(page: Page): Promise<void> {
  await openRoom(page, '?map=demo:map.supply-room');
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // Faces the solid sigil.
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe('demo:encounter.practice-sigil');
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false);
}
const bars = async (page: Page) => { const art = (await snapshot(page)).battle!.art; return { golem: art.sigil!.bar, bat: art.shard!.bar }; };

test('stage HP bars show only for the targeted enemy and just after a hit; the enemy window shows them all', { tag: ['@battle'] }, async ({ page }, info) => {
  await enterPractice(page);
  expect(await bars(page)).toEqual({ golem: false, bat: false }); // Choosing a command: the art is clear.
  await page.screenshot({ path: info.outputPath('enemy-hp-command.png') }); // The underline gauges in the enemy window.
  await page.getByRole('button', { name: 'Attack', exact: true }).click();
  expect((await snapshot(page)).battle?.menu?.target).toBe('sigil');
  expect(await bars(page)).toEqual({ golem: true, bat: false }); // The targeted enemy's bar.
  await page.keyboard.press('ArrowDown');
  expect(await bars(page)).toEqual({ golem: false, bat: true }); // It follows the target.
  await page.screenshot({ path: info.outputPath('enemy-hp-target.png') });
  await page.keyboard.press('Enter'); // The Archer hits the Bat; watch the hit instead of skipping.
  await expect.poll(async () => (await bars(page)).bat, { timeout: 3000 }).toBe(true);
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false);
  await expect.poll(async () => bars(page), { timeout: 3000 }).toEqual({ golem: false, bat: false }); // Then it fades away.
});
