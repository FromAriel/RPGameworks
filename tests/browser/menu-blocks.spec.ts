import type { Page } from '@playwright/test';
import { expect, test } from './helpers';
import { SKIN_SPECS, atlasDataUrl, buildSkin } from '../fixtures/skin-fixtures';

/**
 * Decision 0016 U2.0: the menu layer and shared blocks, in the test-only UI gallery. The blocks are W1 skin windows laid
 * out in a 640 × 360 logical box and enlarged in whole steps; a real MenuController runs a gallery hub and an items-style
 * screen, so the screen stack, Cancel, tabs, pickers and every input path can be driven here before U2.1 builds the hub.
 */
const galleryUrl = 'http://127.0.0.1:4174/ui-gallery/';
const menu = (page: Page) => page.evaluate(() => window.__UI_GALLERY__!.menu.state());
const pad = (page: Page, input: { direction?: 'up' | 'down' | 'left' | 'right' | null; interact?: boolean; cancel?: boolean; tab?: -1 | 0 | 1 }) =>
  page.evaluate(i => window.__UI_GALLERY__!.menu.sample({ direction: i.direction ?? null, burst: false, interact: !!i.interact, cancel: !!i.cancel, menu: false, tab: i.tab ?? 0 }), input);

test('menu blocks are skin windows at the logical size, enlarged whole at 2× without enlarging the skin twice', { tag: ['@windows'] }, async ({ page }) => {
  await page.goto(galleryUrl);
  for (const scale of ['1', '2']) {
    const windows = page.locator(`.gallery-menu-frame[data-scale="${scale}"] [data-window-skin]`);
    await expect(windows).toHaveCount(4);
    await expect(page.locator(`.gallery-menu-frame[data-scale="${scale}"] [data-skin-state="ready"]`)).toHaveCount(4);
  }
  // The skin bitmap is painted at the window's layout size in both frames; the 2× frame enlarges it as a whole.
  const sizes = await page.locator('.gallery-menu-frame .menu-window').evaluateAll(els => els.map(e => [(e as HTMLElement).style.backgroundSize, (e as HTMLElement).offsetWidth, Math.round(e.getBoundingClientRect().width)]));
  expect(sizes.slice(0, 4)).toEqual([['640px 50px', 640, 640], ['432px 310px', 432, 432], ['208px 200px', 208, 208], ['208px 110px', 208, 208]]);
  expect(sizes.slice(4)).toEqual([['640px 50px', 640, 1280], ['432px 310px', 432, 864], ['208px 200px', 208, 416], ['208px 110px', 208, 416]]);
  await expect(page.locator('.gallery-menu-frame .menu-window[data-skin-untitled]')).toHaveCount(6); // Help, party and info in both frames.
  const party = page.locator('.gallery-menu-frame[data-scale="1"] .menu-card').first();
  await expect(party).toHaveAttribute('aria-label', 'Hero, level 3, HP 29 of 30, MP 8 of 10');
});

test('the menu controller: keyboard moves and opens screens, Q/E switch tabs, Cancel closes a picker, then each screen, then the menu', { tag: ['@windows'] }, async ({ page }) => {
  await page.goto(galleryUrl);
  await page.locator('#gallery-open-menu').click();
  await expect.poll(async () => (await menu(page)).top).toBe('gallery:hub');
  expect(await menu(page)).toMatchObject({ open: true, focused: 'Items', help: 'Use and inspect what you carry.' });
  await page.keyboard.press('ArrowDown');
  expect(await menu(page)).toMatchObject({ focused: 'Status', help: 'Each member’s strength and condition.' }); // Disabled, but readable.
  await page.keyboard.press('Enter');
  expect((await menu(page)).top).toBe('gallery:hub'); // A disabled entry does nothing.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await menu(page)).top).toBe('gallery:items');
  expect(await menu(page)).toMatchObject({ focused: 'Workshop tonic2', help: 'Restores 12 HP.' });
  await page.keyboard.press('KeyE'); // On a list row E confirms: the party picker opens.
  await expect(page.locator('.menu-layer button.menu-card')).toHaveCount(4);
  await page.keyboard.press('Escape'); // Cancel closes the picker first…
  await expect(page.locator('.menu-layer button.menu-card')).toHaveCount(0);
  expect((await menu(page)).top).toBe('gallery:items');
  await page.keyboard.press('KeyQ'); // …and Q steps the tabs backwards, wrapping to Materials.
  await expect.poll(async () => (await menu(page)).focused).toBe('Sigil shard3');
  await expect(page.locator('.menu-layer .menu-tab[aria-selected="true"]')).toHaveText('Materials');
  await page.keyboard.press('Escape');
  expect((await menu(page)).top).toBe('gallery:hub');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await menu(page)).open).toBe(false);
  await expect(page.locator('.menu-layer')).toBeHidden();
  await expect(page.locator('#gallery-open-menu')).toBeFocused();
});

test('the menu controller with a controller: move, confirm, shoulder tabs and cancel; pointer chooses a party member', { tag: ['@windows'] }, async ({ page }) => {
  await page.goto(galleryUrl);
  await page.locator('#gallery-open-menu').click();
  await expect.poll(async () => (await menu(page)).top).toBe('gallery:hub');
  await pad(page, { interact: true });
  await expect.poll(async () => (await menu(page)).top).toBe('gallery:items');
  await pad(page, { tab: 1 });
  await expect(page.locator('.menu-layer .menu-tab[aria-selected="true"]')).toHaveText('Key Items');
  await pad(page, { tab: -1 });
  await expect(page.locator('.menu-layer .menu-tab[aria-selected="true"]')).toHaveText('Consumables');
  await pad(page, { direction: 'down' });
  expect((await menu(page)).focused).toBe('Ether1');
  await pad(page, { direction: null });
  await page.locator('.menu-layer .menu-row', { hasText: 'Workshop tonic' }).click();
  await page.locator('.menu-layer button.menu-card', { hasText: 'Mage' }).click();
  // The picker closes, focus returns to the row, and the detail window reports the result.
  await expect(page.locator('.menu-layer button.menu-card')).toHaveCount(0);
  await expect(page.locator('.menu-layer .menu-detail')).toContainText('Used tonic on mage.');
  expect((await menu(page)).focused).toBe('Workshop tonic2');
  await pad(page, { cancel: true });
  await expect.poll(async () => (await menu(page)).top).toBe('gallery:hub');
  await pad(page, { cancel: true });
  await expect.poll(async () => (await menu(page)).open).toBe(false);
});

test('the menu for screen readers: a modal dialog, named groups and tabs, disabled entries announced, help as descriptions', { tag: ['@windows'] }, async ({ page }) => {
  await page.goto(galleryUrl);
  await page.locator('#gallery-open-menu').click();
  const dialog = page.getByRole('dialog', { name: 'Gallery menu' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const commands = dialog.getByRole('group', { name: 'Menu' });
  await expect(commands.getByRole('button', { name: 'Items' })).toBeFocused();
  await expect(commands.getByRole('button', { name: 'Items' })).toHaveAccessibleDescription('Use and inspect what you carry.');
  await expect(commands.getByRole('button', { name: 'Status' })).toHaveAttribute('aria-disabled', 'true');
  // The help line shows what the focused row's description already says, so it is not a live region (no double reading).
  await expect(dialog.locator('.menu-help-text')).toHaveText('Use and inspect what you carry.');
  await expect(dialog.locator('.menu-help-text')).not.toHaveAttribute('aria-live', /.*/);
  await expect(dialog.getByRole('button', { name: 'Hero, level 3, HP 29 of 30, MP 8 of 10' })).toHaveCount(0); // Hub cards are read, not chosen.
  await commands.getByRole('button', { name: 'Items' }).press('Enter');
  const tabs = dialog.getByRole('tablist', { name: 'Categories' });
  await expect(tabs.getByRole('tab', { name: 'Consumables' })).toHaveAttribute('aria-selected', 'true');
  // The detail window is the polite live region: it follows the highlighted item.
  await expect(dialog.locator('.menu-detail[aria-live="polite"]')).toContainText('Restores 12 HP.');
  await dialog.getByRole('group', { name: 'Items' }).getByRole('button', { name: /Workshop tonic/ }).press('Enter');
  await expect(dialog.getByRole('group', { name: 'Use on whom?' }).getByRole('button', { name: 'Mage, level 2, HP 20 of 20, MP 14 of 16' })).toBeVisible();
});

test('a window too small for the skin draws plain by itself; the skin stays on every window it fits', { tag: ['@windows'] }, async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(galleryUrl);
  await expect.poll(() => page.evaluate(() => Boolean(window.__UI_GALLERY__))).toBe(true);
  // 32-pixel corners need at least 64 pixels of height: the 50-pixel help windows cannot take this skin.
  const built = buildSkin(SKIN_SPECS.find(s => s.name.includes('32-pixel chunky'))!);
  await page.evaluate(({ url, manifest }) => window.__UI_GALLERY__!.useSkin(url, manifest), { url: atlasDataUrl(built), manifest: built.skin });
  await expect(page.locator('#gallery-window')).toHaveAttribute('data-skin-state', 'ready');
  const frame = page.locator('.gallery-menu-frame[data-scale="1"]');
  await expect(frame.locator('.menu-help')).toHaveAttribute('data-skin-state', 'fallback');
  await expect(frame.locator('.menu-window:not(.menu-help)')).toHaveCount(3);
  for (const window of await frame.locator('.menu-window:not(.menu-help)').all()) await expect(window).toHaveAttribute('data-skin-state', 'ready');
  await expect(page.locator('#skin-status')).not.toContainText('Window skin unavailable');
  expect(warnings.some(w => w.includes('does not fit this window'))).toBe(true);
});
