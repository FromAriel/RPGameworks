import type { Page } from '@playwright/test';
import { expect, openRoom, snapshot, tapDirection, test } from './helpers';

/**
 * Decision 0016 U2.1: the hub. The menu key, the Menu button and the controller's Menu button open it; Cancel or the
 * menu key close it and return focus to the map. Entries come from the demo's menu.json; until U2.2–U2.3 Items,
 * Journal, Save, Config and Help open the existing windows and come back to the hub, and the rest are greyed.
 */
const menu = (page: Page) => page.locator('#game-menu');
const row = (page: Page, id: string) => page.locator(`#game-menu .menu-row[data-id="${id}"]`);
const help = (page: Page) => page.locator('#game-menu .menu-help-text');

async function syntheticPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = { id: 'U2.1 fixture', index: 0, connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
}
async function tapPad(page: Page, index: number): Promise<void> {
  const set = (pressed: boolean) => page.evaluate(({ index, pressed }) => Object.assign(navigator.getGamepads()[0]!.buttons[index]!, { pressed, value: pressed ? 1 : 0 }), { index, pressed });
  await set(true); await page.waitForTimeout(70); await set(false); await page.waitForTimeout(70);
}

test('the menu key opens the hub: party, commands from menu.json, location; greyed entries say why; I or Escape return to the map', { tag: ['@inventory'] }, async ({ page }, info) => {
  await openRoom(page);
  await page.keyboard.press('KeyI');
  await expect(menu(page)).toBeVisible();
  expect(await snapshot(page)).toMatchObject({ inputMode: 'menu', menu: { screen: 'builtin:hub', focused: 'items' } });
  await expect(page.locator('#game-menu .menu-row')).toHaveText(['Items', 'Status', 'Formation', 'Journal', 'Codex', 'Config', 'Help', 'Save']);
  await expect(page.locator('#game-menu .menu-row[aria-disabled="true"]')).toHaveText(['Status', 'Formation', 'Codex']);
  await expect(page.locator('#game-menu .menu-card')).toHaveCount(1);
  await expect(page.locator('#game-menu .menu-card')).toHaveAttribute('aria-label', 'Hero');
  await expect(page.locator('#game-menu .menu-info-window')).toContainText('Location');
  await expect(page.locator('#game-menu .menu-info-window')).toContainText((await snapshot(page)).mapName);
  await expect(page.locator('#game-menu [data-window-skin]')).toHaveCount(4);
  await expect(page.locator('#game-menu [data-skin-state="ready"]')).toHaveCount(4);
  // The menu is laid out at 640 × 360 and enlarged with the game in whole steps.
  const scale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--game-scale').trim());
  expect(await page.locator('#game-menu .menu-surface').evaluate(e => getComputedStyle(e).transform)).toBe(`matrix(${scale}, 0, 0, ${scale}, 0, 0)`);
  await page.screenshot({ path: info.outputPath('hub.png') });
  await expect(help(page)).toHaveText('Use and inspect what you carry.');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'status')).toBeFocused();
  await expect(help(page)).toHaveText("Each member's strength and condition. Arrives later.");
  await page.keyboard.press('Enter');
  expect((await snapshot(page)).menu).toEqual({ screen: 'builtin:hub', focused: 'status' }); // Greyed: nothing opens.
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
  expect(await snapshot(page)).toMatchObject({ inputMode: 'exploration', menu: null });
  await page.keyboard.press('KeyI');
  await expect(row(page, 'items')).toBeFocused(); // A fresh menu starts at the top.
  await page.keyboard.press('KeyI');
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
  expect(await tapDirection(page, 'ArrowDown')).toBe('walked'); // The map has input again.
});

test('hub entries open their screens or the existing windows, and Cancel there comes back to the hub on the same entry', { tag: ['@inventory', '@saves'] }, async ({ page }) => {
  await openRoom(page);
  await page.keyboard.press('KeyI');
  await expect(row(page, 'items')).toBeFocused(); // The hub opens on the next game frame.
  await page.keyboard.press('Enter'); // Items: the Items screen (U2.2), on the menu's own stack.
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
  expect((await snapshot(page)).menu?.screen).toBe('builtin:items');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeVisible();
  await expect(row(page, 'items')).toBeFocused();
  await row(page, 'journal').click();
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:journal"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, 'journal')).toBeFocused();
  await row(page, 'save').click();
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:save"]')).toBeVisible(); // Save/Load: its own screen (U2.3c).
  await page.keyboard.press('Escape');
  await expect(row(page, 'save')).toBeFocused();
  await row(page, 'config').click(); // Config: its own screen (U2.3b).
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:config"]')).toBeVisible();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(row(page, 'config')).toBeFocused();
  await row(page, 'help').click();
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:help"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row(page, 'help')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
});

test('pointer and controller: the Menu button and the pad open the hub, move, choose and cancel', { tag: ['@inventory', '@input'] }, async ({ page }) => {
  await syntheticPad(page);
  await openRoom(page);
  await page.locator('#tools-toggle').click();
  await expect(menu(page)).toBeVisible();
  await page.locator('#game-menu .menu-row', { hasText: 'Items' }).click();
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
  await tapPad(page, 1); // Cancel: back to the hub…
  await expect(menu(page)).toBeVisible();
  await tapPad(page, 1); // …and back to the map.
  await expect(menu(page)).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await tapPad(page, 9); // Menu button.
  await expect(menu(page)).toBeVisible();
  await tapPad(page, 13); await tapPad(page, 13); await tapPad(page, 13); // Down to Journal.
  await expect.poll(async () => (await snapshot(page)).menu?.focused).toBe('journal');
  await tapPad(page, 2); // Confirm.
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:journal"]')).toBeVisible();
  await tapPad(page, 1);
  await expect.poll(async () => (await snapshot(page)).menu?.focused).toBe('journal');
  await tapPad(page, 9); // The Menu button closes the hub too.
  await expect(menu(page)).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
});

test('an entry hidden by its unlock condition appears once the fact is set', { tag: ['@inventory', '@dialogue'] }, async ({ page }) => {
  await page.route('**/generated/content/menu.*.json', async route => {
    const data = await (await route.fetch()).json();
    data.entries.splice(5, 0, { id: 'plaque-notes', label: 'Plaque notes', screen: 'builtin:codex', help: 'What the plaque said.',
      when: { type: 'factEquals', factId: 'demo:fact.gallery.plaque-read', value: true } });
    await route.fulfill({ json: data });
  });
  await openRoom(page, '?map=demo:map.gallery');
  await page.keyboard.press('KeyI');
  await expect(row(page, 'items')).toBeFocused();
  await expect(row(page, 'plaque-notes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toBeFocused();
  expect(await tapDirection(page, 'ArrowUp')).toBe('walked'); // (4,6) → (4,5), facing the plaque.
  await page.keyboard.press('KeyE');
  await expect(page.locator('#dialog-text')).toContainText('hidden line glows');
  await page.keyboard.press('Escape');
  expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(true);
  await page.keyboard.press('KeyI');
  await expect(row(page, 'plaque-notes')).toHaveText('Plaque notes');
  await expect(page.locator('#game-menu .menu-row')).toHaveText(['Items', 'Status', 'Formation', 'Journal', 'Codex', 'Plaque notes', 'Config', 'Help', 'Save']);
});
