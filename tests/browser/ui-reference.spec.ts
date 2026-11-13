import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, openRoom, openTools, tapDirection, test, type DirectionKey, saveScreen, slotAction, slotCommand, slotRow } from './helpers';

const gallery = 'demo:map.gallery';

// Shared tap: releases the key inside the page, so a loaded machine cannot add a step.
async function step(page: Page, key: DirectionKey): Promise<void> {
  expect(await tapDirection(page, key)).toBe('walked');
}

async function capture(target: Locator, name: string, info: TestInfo): Promise<void> {
  await target.screenshot({ path: info.outputPath(name), animations: 'disabled' });
}

/** The Items screen (decision 0016), which replaced the U1 Inventory dialog in these captures. */
async function openInventory(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
}
/** From the Items screen, back to the menu and on to Save / Load (a menu screen since decision 0016 U2.3c). */
async function itemsToSaves(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.locator('#game-menu .menu-row[data-id="save"]').click();
  await expect(saveScreen(page)).toBeVisible();
}

async function collectLens(page: Page): Promise<void> {
  await step(page, 'ArrowDown');
  await step(page, 'ArrowDown');
  for (let move = 0; move < 3; move += 1) await step(page, 'ArrowRight');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#dialog-text')).toContainText('found a polished lens');
  await page.keyboard.press('Escape');
  await expect(page.locator('#stage')).toBeFocused();
}

async function openMaraDialogue(page: Page): Promise<void> {
  await step(page, 'ArrowDown');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toBeVisible();
  await expect(page.locator('#dialog-title')).toContainText('Mara');
}

async function installSyntheticPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      id: 'U1.1 reference pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0],
      buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
  });
}

async function tapPad(page: Page, index: number): Promise<void> {
  await page.evaluate((button) => Object.assign(navigator.getGamepads()[0]!.buttons[button]!, { pressed: true, value: 1 }), index);
  // Cross at least one low-frequency device-discovery sample as well as gameplay frames.
  await page.waitForTimeout(300);
  await page.evaluate((button) => Object.assign(navigator.getGamepads()[0]!.buttons[button]!, { pressed: false, value: 0 }), index);
  await page.waitForTimeout(100);
}

async function openInventoryWithPad(page: Page): Promise<void> {
  const hub = page.locator('#game-menu');
  for (let attempt = 0; attempt < 3 && await hub.isHidden(); attempt += 1) {
    await tapPad(page, 9);
    if (await hub.isHidden()) await page.waitForTimeout(300);
  }
  await expect(hub).toBeVisible();
  await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await tapPad(page, 2); // Confirm Items.
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
}

test.describe('U1.1 real-screen references', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript({
      content: `{
        const NativeDate = Date;
        const fixedTime = Date.parse('2026-09-20T19:00:00.000Z');
        class ReferenceDate extends NativeDate {
          constructor(...args) { super(...(args.length ? args : [fixedTime])); }
          static now() { return fixedTime; }
        }
        globalThis.Date = ReferenceDate;
      }`,
    });
  });

  test('captures wide dialogue and Settings', { tag: ['@windows'] }, async ({ page }, info) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page);
    await openMaraDialogue(page);
    await capture(page.locator('#interaction-dialog'), 'u1-dialogue-1100x850.png', info);
    await page.keyboard.press('Escape');
    await openTools(page);
    await capture(page.locator('#tools-panel'), 'u1-settings-1100x850.png', info);
  });

  test('resolves semantic tokens and preserves selected plus focus-visible states', { tag: ['@windows'] }, async ({ page }) => {
    await installSyntheticPad(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRoom(page, `?map=${gallery}`);
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.color = 'var(--ui-selection)';
      probe.style.transitionDuration = 'var(--ui-motion-fast)';
      document.body.append(probe);
      const computed = getComputedStyle(probe);
      const result = {
        cyan: root.getPropertyValue('--ui-cyan').trim(),
        brass: root.getPropertyValue('--ui-brass').trim(),
        violet: root.getPropertyValue('--ui-violet').trim(),
        success: root.getPropertyValue('--ui-success').trim(),
        warning: root.getPropertyValue('--ui-warning').trim(),
        danger: root.getPropertyValue('--ui-danger').trim(),
        selection: computed.color,
        reducedDuration: computed.transitionDuration,
      };
      probe.remove();
      return result;
    });
    expect(tokens).toEqual({
      cyan: '#87cbe6', brass: '#c9b78b', violet: '#a58cf0', success: '#7fc79a',
      warning: '#e0b76a', danger: '#df8585', selection: 'rgb(135, 203, 230)', reducedDuration: '0s',
    });
    await collectLens(page);
    await openInventoryWithPad(page);
    const item = page.locator('#game-menu .menu-screen[data-screen="builtin:items"]').locator('.menu-row[data-id="demo:item.lens"]');
    await expect(item).toBeFocused();
    expect(await item.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"▶"'); // The menu cursor.
    await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]').locator('.menu-detail h3')).toHaveText('Polished lens');
  });

  test('captures wide lens Inventory and empty and populated Save Load', { tag: ['@windows'] }, async ({ page }, info) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page, `?map=${gallery}`);
    await collectLens(page);
    await openInventory(page);
    await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]').locator('.menu-row-label')).toHaveText(['Polished lens']);
    await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]').locator('.menu-row-detail')).toHaveText(['×1']);
    await capture(page.locator('#game-menu .menu-surface'), 'u2-items-lens-1100x850.png', info);
    await itemsToSaves(page);
    await expect(saveScreen(page).locator('.menu-save-slots .menu-row-detail')).toHaveText(['Empty', 'Empty', 'Empty']);
    await capture(page.locator('#game-menu .menu-surface'), 'u2-save-empty-1100x850.png', info);
    await slotAction(page, 0, 'save');
    await expect(page.locator('#save-status')).toContainText('Progress saved');
    await capture(page.locator('#game-menu .menu-surface'), 'u2-save-populated-1100x850.png', info);
    await slotRow(page, 0).click();
    await capture(page.locator('#game-menu .menu-surface'), 'u2-save-commands-1100x850.png', info);
    await slotCommand(page, 'save').click();
    const confirmation = page.locator('#save-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Replace Slot 1?');
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await capture(confirmation, 'u1-save-confirmation-1100x850.png', info);
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
  });

  test('captures unavailable-storage feedback', { tag: ['@windows'] }, async ({ page }, info) => {
    await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
    }));
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page);
    await openInventory(page);
    await itemsToSaves(page);
    await expect(page.locator('#save-status')).toContainText('Local saves unavailable');
    await capture(page.locator('#game-menu .menu-surface'), 'u2-save-storage-unavailable-1100x850.png', info);
  });

  test('captures narrow dialogue Inventory and Save Load', { tag: ['@windows'] }, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoom(page);
    await openMaraDialogue(page);
    await capture(page.locator('#interaction-dialog'), 'u1-dialogue-390x844.png', info);
    await page.keyboard.press('Escape');
    await expect(page.locator('#stage')).toBeFocused();
    await openInventory(page);
    await capture(page.locator('#game-menu .menu-surface'), 'u2-items-390x844.png', info);
    await itemsToSaves(page);
    await capture(page.locator('#game-menu .menu-surface'), 'u2-save-empty-390x844.png', info);
  });

  test.describe('touch-first', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('captures narrow touch Inventory', { tag: ['@windows'] }, async ({ page }, info) => {
      await openRoom(page);
      await page.locator('#tools-toggle').tap();
      await page.locator('#game-menu .menu-row[data-id="items"]').tap();
      await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
      await capture(page.locator('#game-menu .menu-surface'), 'u2-items-touch-390x844.png', info);
    });
  });

  test.describe('forced colors', () => {
    test.use({ forcedColors: 'active', viewport: { width: 1100, height: 850 } });

    test('retains focused Inventory and disabled Save Load reasons', { tag: ['@windows'] }, async ({ page }, info) => {
      await openRoom(page);
      expect(await page.locator('[data-window-skin]').evaluateAll((elements) => elements.every(
        (element) => getComputedStyle(element).backgroundImage === 'none',
      ))).toBe(true);
      await openInventory(page);
      await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]').locator('.menu-row')).toBeFocused(); // "Nothing here", focusable and greyed.
      await capture(page.locator('#game-menu .menu-surface'), 'u2-items-forced-colors.png', info);
      await itemsToSaves(page);
      await expect(saveScreen(page).locator('.menu-save-slots .menu-row-detail')).toHaveText(['Empty', 'Empty', 'Empty']);
      await page.keyboard.press('Enter');
      await expect(slotCommand(page, 'load')).toHaveAttribute('aria-disabled', 'true'); // Shown, greyed: the slot is empty.
      await expect(slotCommand(page, 'save')).toBeFocused();
      await capture(page.locator('#game-menu .menu-surface'), 'u2-save-forced-colors.png', info);
    });
  });
});
