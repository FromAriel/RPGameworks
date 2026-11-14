import type { Page } from '@playwright/test';
import { expect, openRoom, openSaves, slotAction, snapshot, tapDirection, test } from './helpers';

/** Decision 0014 M5.4d-2: the Formation and Status screens, and the formation the next battle uses. */
const screen = (page: Page, id: 'formation' | 'status') => page.locator(`#game-menu .menu-screen[data-screen="builtin:${id}"]`);
const cell = (page: Page, lane: number, depth: number) => screen(page, 'formation').locator(`[data-grid-cell][data-lane="${lane}"][data-depth="${depth}"]`);
const row = (page: Page, id: string) => page.locator(`#game-menu .menu-screen:not([hidden]) .menu-row[data-id="${id}"]`);

async function openFormation(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await page.locator('#game-menu .menu-row[data-id="formation"]').click();
  await expect(screen(page, 'formation')).toBeVisible();
  await expect(row(page, 'hero')).toBeFocused();
}
async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();
}

test('a formation set by keyboard is the one the next battle uses, and it survives save and load', { tag: ['@inventory', '@battle', '@saves'] }, async ({ page }, info) => {
  await openRoom(page, '?map=demo:map.supply-room');
  await openFormation(page);
  await expect(screen(page, 'formation').locator('[data-skin-state="ready"]')).toHaveCount(4); // Help, party, grid and detail; the question is painted when it opens.
  await page.screenshot({ path: info.outputPath('formation.png') });
  // The Hero from the front of the middle lane to the back of the top lane.
  await page.keyboard.press('Enter');
  await expect(cell(page, 2, 1)).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(cell(page, 1, 3)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row(page, 'hero')).toBeFocused();
  await expect(row(page, 'hero')).toContainText('Back');
  await page.keyboard.press('KeyE'); // The back-attack preview: the Hero now faces an attack from behind.
  await expect(screen(page, 'formation').locator('.menu-detail')).toContainText('In a back attack: front-facing.');
  await page.screenshot({ path: info.outputPath('formation-back-attack.png') });
  expect((await snapshot(page)).session.party?.cells.hero).toEqual({ lane: 2, depth: 1 }); // Still a draft.
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowDown');
  await expect(row(page, 'done')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-menu .menu-row[data-id="formation"]')).toBeFocused();
  expect((await snapshot(page)).session.party?.cells.hero).toEqual({ lane: 1, depth: 3 });
  await page.keyboard.press('Escape'); await expect(page.locator('#game-menu')).toBeHidden();

  // The practice sigil: the battle places the Hero where the formation put him.
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  await tapDirection(page, 'ArrowLeft');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.practice-sigil');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.cells.hero).toEqual([1, 3]);
  expect((await snapshot(page)).battle?.cells).toMatchObject({ archer: [2, 2], lancer: [3, 1], mage: [3, 3] });
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined);
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');

  // Saved, reloaded and loaded: the formation comes back.
  await openSaves(page);
  await slotAction(page, 0, 'save'); await expect(page.locator('#save-status')).toContainText('Progress saved');
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await page.locator('#stage').focus();
  expect((await snapshot(page)).session.party?.cells.hero).toEqual({ lane: 2, depth: 1 }); // A fresh session has the defaults.
  await openSaves(page);
  await slotAction(page, 0, 'load');
  await page.locator('#save-confirmation').getByRole('button', { name: 'Load Slot 1', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).session.party?.cells.hero).toEqual({ lane: 1, depth: 3 });
});

test('pointer and touch: tapping a member, then a cell, swaps; leaving with changes asks first', { tag: ['@inventory'] }, async ({ page }) => {
  await openRoom(page);
  await openFormation(page);
  await cell(page, 2, 2).click(); // The Archer.
  await expect(cell(page, 2, 2)).toHaveAttribute('data-marked', '');
  await cell(page, 2, 1).click(); // The Hero's cell: they swap.
  await expect(cell(page, 2, 1)).toHaveAttribute('data-occupant', 'Archer');
  await expect(cell(page, 2, 2)).toHaveAttribute('data-occupant', 'Hero');
  await page.keyboard.press('Escape');
  const question = screen(page, 'formation').locator('.menu-formation-confirm');
  await expect(question).toBeVisible();
  await expect(question).toHaveAttribute('data-skin-state', 'ready');
  await expect(question.locator('.menu-row[data-id="no"]')).toBeFocused();
  await question.locator('.menu-row[data-id="yes"]').click();
  await expect(page.locator('#game-menu .menu-row[data-id="formation"]')).toBeFocused();
  expect((await snapshot(page)).session.party?.cells).toMatchObject({ hero: { lane: 2, depth: 1 }, archer: { lane: 2, depth: 2 } });
  await page.keyboard.press('Escape'); await expect(page.locator('#game-menu')).toBeHidden();
  // Opening and closing it repeatedly leaves nothing behind.
  const before = await snapshot(page);
  for (let i = 0; i < 5; i += 1) { await openFormation(page); await closeMenu(page); }
  const after = await snapshot(page);
  expect(after.sessionSubscribers).toBe(before.sessionSubscribers);
  expect(after.displayObjects).toBe(before.displayObjects);
  expect(await page.locator('#game-menu .menu-formation').count()).toBe(0);
});

test('Status shows one member per page, and the hub shows all four with full HP', { tag: ['@inventory'] }, async ({ page }, info) => {
  await openRoom(page);
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-card')).toHaveCount(4);
  await expect(page.locator('#game-menu .menu-card').nth(1)).toHaveAttribute('aria-label', 'Archer, HP 22 of 22');
  await page.screenshot({ path: info.outputPath('hub-party.png') });
  await page.locator('#game-menu .menu-row[data-id="status"]').click();
  await expect(screen(page, 'status')).toBeVisible();
  const page1 = screen(page, 'status').locator('.menu-detail');
  await expect(page1).toContainText('HP 30 / 30');
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
  await expect(page1.locator('h3')).toHaveText('Lancer');
  await expect(page1).toContainText('Reach: front-facing enemies, or the one directly behind them.');
  await page.screenshot({ path: info.outputPath('status.png') });
});
