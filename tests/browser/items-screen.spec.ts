import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, test, filesRow } from './helpers';

/**
 * Decision 0016 U2.2: the Items screen. Category tabs (All first) and a sort bar (Type, A-Z, Qty) along the top, the
 * list and the highlighted item's detail below. Browsing only for now: nothing can be used outside battle until M5.4d.
 */
const TONIC = 'demo:item.tonic', LENS = 'demo:item.lens', BRASS = 'demo:item.brass-key', WORKSHOP = 'demo:item.workshop-key';
const screen = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:items"]');
const rows = (page: Page) => screen(page).locator('.menu-row .menu-row-label');
const detail = (page: Page) => screen(page).locator('.menu-detail');
const selectedTab = (page: Page) => screen(page).locator('.menu-tab[aria-selected="true"]');
const pressedSort = (page: Page) => screen(page).locator('.menu-sort-button[aria-pressed="true"]');

/** Load an imported save holding these items, through the hub's Save entry and the real import flow. */
async function carry(page: Page, inventory: Record<string, number>): Promise<void> {
  const save = JSON.parse(readFileSync('tests/fixtures/saves/v1-empty.json', 'utf8'));
  save.session.inventory = inventory;
  await page.keyboard.press('KeyI');
  await page.locator('#game-menu .menu-row[data-id="save"]').click();
  await page.locator('#save-import').setInputFiles({ name: 'items.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.locator('#save-status')).toContainText('Import validated');
  await filesRow(page, 'load-import').click();
  await page.locator('#save-confirmation').getByRole('button', { name: 'Load import', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  expect((await snapshot(page)).session.inventory).toEqual(inventory);
}
async function openItems(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(screen(page)).toBeVisible();
}

test('keyboard: tabs, the three sorts, detail and help; tab and sort are remembered while playing', { tag: ['@inventory'] }, async ({ page }, info) => {
  await openRoom(page);
  await carry(page, { [TONIC]: 3, [LENS]: 1, [BRASS]: 1, [WORKSHOP]: 1 });
  await openItems(page);
  expect((await snapshot(page)).menu).toEqual({ screen: 'builtin:items', focused: TONIC });
  await expect(screen(page).locator('.menu-tab')).toHaveText(['All', 'Consumables', 'Key Items', 'Materials']);
  await expect(selectedTab(page)).toHaveText('All');
  await expect(pressedSort(page)).toHaveAccessibleName('By type');
  // By type: Consumables, then Key Items, each by name.
  await expect(rows(page)).toHaveText(['Workshop tonic', 'Brass key', 'Polished lens', 'Workshop key']);
  await expect(screen(page).locator('.menu-row .menu-row-detail').first()).toHaveText('×3');
  await expect(detail(page)).toContainText('Workshop tonic');
  await expect(detail(page)).toContainText('Quantity 3 / 9');
  await expect(detail(page)).toContainText('Category: Consumables');
  await expect(detail(page)).toContainText('Restores 12 HP to one ally in battle.');
  await expect(detail(page)).toContainText('Carrying 4 / 32 stacks');
  await expect(screen(page).locator('.menu-help-text')).toHaveText('Restores 12 HP to one ally in battle.');
  await expect(screen(page).locator('[data-skin-state="ready"]')).toHaveCount(4);
  await page.screenshot({ path: info.outputPath('items-by-type.png') });
  await page.keyboard.press('ArrowDown');
  await expect(detail(page)).toContainText('Brass key');
  await expect(detail(page)).toContainText('Category: Key Items');
  await page.keyboard.press('KeyR'); // A-Z; the highlighted item stays highlighted.
  await expect(pressedSort(page)).toHaveAccessibleName('By name');
  await expect(rows(page)).toHaveText(['Brass key', 'Polished lens', 'Workshop key', 'Workshop tonic']);
  expect((await snapshot(page)).menu?.focused).toBe(BRASS);
  await page.keyboard.press('KeyR'); // Quantity: most first, then by name.
  await expect(pressedSort(page)).toHaveAccessibleName('By quantity');
  await expect(rows(page)).toHaveText(['Workshop tonic', 'Brass key', 'Polished lens', 'Workshop key']);
  await page.keyboard.press('KeyQ'); // Back from All wraps to Materials, which is empty.
  await expect(selectedTab(page)).toHaveText('Materials');
  await expect(rows(page)).toHaveText(['Nothing here']);
  await expect(detail(page)).toContainText('Nothing in this category yet.');
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyE');
  await expect(selectedTab(page)).toHaveText('Consumables');
  await expect(rows(page)).toHaveText(['Workshop tonic']);
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toBeFocused();
  await openItems(page);
  await expect(selectedTab(page)).toHaveText('Consumables');
  await expect(pressedSort(page)).toHaveAccessibleName('By quantity');
  expect((await snapshot(page)).session.inventory).toEqual({ [TONIC]: 3, [LENS]: 1, [BRASS]: 1, [WORKSHOP]: 1 }); // Browsing spends nothing.
});

test('controller and pointer: shoulder buttons change tabs, Burst changes the sort, clicks pick either', { tag: ['@inventory', '@input'] }, async ({ page }) => {
  await page.addInitScript(() => {
    const pad = { id: 'U2.2 fixture', index: 0, connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
  const tap = async (index: number) => {
    const set = (pressed: boolean) => page.evaluate(({ index, pressed }) => Object.assign(navigator.getGamepads()[0]!.buttons[index]!, { pressed, value: pressed ? 1 : 0 }), { index, pressed });
    await set(true); await page.waitForTimeout(70); await set(false); await page.waitForTimeout(70);
  };
  await openRoom(page);
  await carry(page, { [TONIC]: 2, [LENS]: 1 });
  await tap(9); await expect(page.locator('#game-menu')).toBeVisible();
  await tap(2); await expect(screen(page)).toBeVisible();
  await tap(5); await expect(selectedTab(page)).toHaveText('Consumables');
  await tap(4); await expect(selectedTab(page)).toHaveText('All');
  await tap(0); await expect(pressedSort(page)).toHaveAccessibleName('By name'); // Burst: next sort, never a map burst.
  await expect(rows(page)).toHaveText(['Polished lens', 'Workshop tonic']);
  await tap(13); await expect.poll(async () => (await snapshot(page)).menu?.focused).toBe(TONIC);
  await screen(page).locator('.menu-sort-button', { hasText: 'Type' }).click();
  await expect(rows(page)).toHaveText(['Workshop tonic', 'Polished lens']);
  await screen(page).locator('.menu-tab', { hasText: 'Key Items' }).click();
  await expect(rows(page)).toHaveText(['Polished lens']);
  await screen(page).locator('.menu-row', { hasText: 'Polished lens' }).click();
  await expect(detail(page)).toContainText('Category: Key Items');
  await tap(1); await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await tap(1); await expect(page.locator('#game-menu')).toBeHidden();
  expect((await snapshot(page)).burstRequests).toBe(0);
});

test('an empty inventory says so and stays navigable', { tag: ['@inventory'] }, async ({ page }) => {
  await openRoom(page);
  await openItems(page);
  await expect(rows(page)).toHaveText(['Nothing here']);
  await expect(screen(page).locator('.menu-row')).toHaveAttribute('aria-disabled', 'true');
  await expect(screen(page).locator('.menu-row')).toBeFocused();
  await expect(detail(page)).toContainText('You are not carrying anything yet.');
  await expect(detail(page)).toContainText('Carrying 0 / 32 stacks');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toBeFocused();
});
