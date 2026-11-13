import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, journalScreen, openJournal, openRoom, openSaves, snapshot, test, filesRow } from './helpers';

/**
 * Decision 0016 U2.3a: the Journal and Help screens in the menu. The Journal lists known quests, active first, with the
 * objective or how the quest ended; Help explains each topic for the keyboard, a controller (with the player's own
 * bindings) and touch.
 */
const help = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:help"]');
const detail = (_page: Page, screen: ReturnType<typeof help>) => screen.locator('.menu-detail');

/** Load an imported v2 save with these quest states, through the hub's Save entry. */
async function withQuests(page: Page, quests: Record<string, 'active' | 'completed'>): Promise<void> {
  const save = JSON.parse(readFileSync('tests/fixtures/saves/v2-lens-held-beside-mara.json', 'utf8'));
  save.session.quests = quests;
  await openSaves(page);
  await page.locator('#save-import').setInputFiles({ name: 'quests.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.locator('#save-status')).toContainText('Import validated');
  await filesRow(page, 'load-import').click();
  await page.locator('#save-confirmation').getByRole('button', { name: 'Load import', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  expect((await snapshot(page)).session.quests).toEqual(quests);
}

test('the Journal lists active quests first, then completed ones, with their objective or ending', { tag: ['@quests', '@inventory'] }, async ({ page }, info) => {
  await openRoom(page);
  await withQuests(page, { 'demo:quest.gallery-light': 'completed', 'demo:quest.archive-ledger': 'active' });
  await openJournal(page);
  await expect(journalScreen(page).locator('.menu-row .menu-row-label')).toHaveText(['The archive ledger', 'Restore the Gallery light']);
  await expect(journalScreen(page).locator('.menu-row .menu-row-detail')).toHaveText(['', '✓']);
  await expect(detail(page, journalScreen(page))).toContainText('In progress.');
  await expect(detail(page, journalScreen(page))).toContainText('Find the archive ledger in the Storeroom');
  await expect(journalScreen(page).locator('[data-skin-state="ready"]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('journal.png') });
  await page.keyboard.press('ArrowDown');
  await expect(detail(page, journalScreen(page))).toContainText('Completed.');
  await expect(detail(page, journalScreen(page))).toContainText('Mara fitted the lens');
  await expect(journalScreen(page).locator('.menu-help-text')).toHaveText('Completed.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu .menu-row[data-id="journal"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toBeFocused();
});

test('an empty Journal says so', { tag: ['@quests', '@inventory'] }, async ({ page }) => {
  await openRoom(page);
  await openJournal(page);
  await expect(journalScreen(page).locator('.menu-row')).toHaveText(['No quests yet']);
  await expect(journalScreen(page).locator('.menu-row')).toBeFocused();
  await expect(detail(page, journalScreen(page))).toContainText('Talk to people to find work worth doing.');
});

test('Help: topics per input device, controller lines from the current bindings, Q/E and clicks change the device', { tag: ['@inventory', '@input'] }, async ({ page }, info) => {
  await openRoom(page);
  await page.keyboard.press('KeyI');
  await page.locator('#game-menu .menu-row[data-id="help"]').click();
  await expect(help(page)).toBeVisible();
  await expect(help(page).locator('.menu-row .menu-row-label')).toHaveText(['Moving', 'Talking', 'The menu', 'Battle', 'Saving']);
  await expect(help(page).locator('.menu-tab[aria-selected="true"]')).toHaveText('Keyboard');
  await expect(detail(page, help(page))).toContainText('Moving: Keyboard');
  await expect(detail(page, help(page))).toContainText('Arrow keys or W A S D: walk.');
  await page.keyboard.press('ArrowDown');
  await expect(detail(page, help(page))).toContainText('E or Enter: talk, read or open.');
  await page.keyboard.press('KeyE'); // Controller: the default bindings, named.
  await expect(help(page).locator('.menu-tab[aria-selected="true"]')).toHaveText('Controller');
  await expect(detail(page, help(page))).toContainText('Talking: Controller');
  await expect(detail(page, help(page))).toContainText('X (button 2): talk, read or open.');
  await expect(detail(page, help(page))).toContainText('B (button 1): close.');
  await page.keyboard.press('ArrowDown');
  await expect(detail(page, help(page))).toContainText('LB (button 4) and RB (button 5): change tabs.');
  await page.screenshot({ path: info.outputPath('help-controller.png') });
  await help(page).locator('.menu-tab', { hasText: 'Touch' }).click();
  await expect(detail(page, help(page))).toContainText('Menu (top right): open the menu.');
  await page.keyboard.press('KeyQ'); await page.keyboard.press('KeyQ');
  await expect(help(page).locator('.menu-tab[aria-selected="true"]')).toHaveText('Keyboard');
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu .menu-row[data-id="help"]')).toBeFocused();
});
