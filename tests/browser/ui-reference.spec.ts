import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, openRoom, openTools, snapshot, test } from './helpers';

const gallery = 'demo:map.gallery';

async function step(page: Page, key: string): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
}

async function capture(target: Locator, name: string, info: TestInfo): Promise<void> {
  await target.screenshot({ path: info.outputPath(name), animations: 'disabled' });
}

async function openInventory(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#inventory-dialog')).toBeVisible();
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
  const inventory = page.locator('#inventory-dialog');
  for (let attempt = 0; attempt < 3 && await inventory.isHidden(); attempt += 1) {
    await tapPad(page, 9);
    if (await inventory.isHidden()) await page.waitForTimeout(300);
  }
  await expect(inventory).toBeVisible();
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

  test('captures wide dialogue and Settings', async ({ page }, info) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page);
    await openMaraDialogue(page);
    await capture(page.locator('#interaction-dialog'), 'u1-dialogue-1100x850.png', info);
    await page.keyboard.press('Escape');
    await openTools(page);
    await capture(page.locator('#tools-panel'), 'u1-settings-1100x850.png', info);
  });

  test('resolves semantic tokens and preserves selected plus focus-visible states', async ({ page }) => {
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
    const item = page.locator('[data-item-id="demo:item.lens"]');
    await expect(item).toBeFocused();
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    expect(await item.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        selectionLine: style.borderLeftColor,
        focusStyle: style.outlineStyle,
        focusColor: style.outlineColor,
      };
    })).toEqual({
      background: 'rgb(38, 59, 80)',
      selectionLine: 'rgb(189, 229, 244)',
      focusStyle: 'dashed',
      focusColor: 'rgb(241, 246, 250)',
    });
    await expect(page.locator('#item-name')).toHaveText('Polished lens');
  });

  test('captures wide lens Inventory and empty and populated Save Load', async ({ page }, info) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page, `?map=${gallery}`);
    await collectLens(page);
    await openInventory(page);
    const lensRow = page.locator('[data-item-id="demo:item.lens"]');
    await expect(lensRow.locator('.ui-list-row__label')).toHaveText('Polished lens');
    await expect(lensRow.locator('.ui-list-row__trailing')).toHaveText('× 1');
    await capture(page.locator('#inventory-dialog'), 'u1-inventory-lens-1100x850.png', info);
    await page.locator('#inventory-saves').click();
    await expect(page.locator('#save-dialog')).toBeVisible();
    await expect(page.getByText('Empty — Load and Export are unavailable.')).toHaveCount(3);
    await capture(page.locator('#save-dialog'), 'u1-save-empty-1100x850.png', info);
    await page.locator('#save-slots .save-slot').first().getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#save-status')).toContainText('Progress saved');
    await capture(page.locator('#save-dialog'), 'u1-save-populated-1100x850.png', info);
    await page.locator('#save-slots .save-slot').first().getByRole('button', { name: 'Save' }).click();
    const confirmation = page.locator('#save-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Replace Slot 1?');
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await capture(confirmation, 'u1-save-confirmation-1100x850.png', info);
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
  });

  test('captures unavailable-storage feedback', async ({ page }, info) => {
    await page.addInitScript(() => Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
    }));
    await page.setViewportSize({ width: 1100, height: 850 });
    await openRoom(page);
    await openInventory(page);
    await page.locator('#inventory-saves').click();
    await expect(page.locator('#save-dialog')).toBeVisible();
    await expect(page.locator('#save-status')).toContainText('Local saves unavailable');
    await capture(page.locator('#save-dialog'), 'u1-save-storage-unavailable-1100x850.png', info);
  });

  test('captures narrow dialogue Inventory and Save Load', async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoom(page);
    await openMaraDialogue(page);
    await capture(page.locator('#interaction-dialog'), 'u1-dialogue-390x844.png', info);
    await page.keyboard.press('Escape');
    await expect(page.locator('#stage')).toBeFocused();
    await openInventory(page);
    await capture(page.locator('#inventory-dialog'), 'u1-inventory-390x844.png', info);
    await page.locator('#inventory-saves').click();
    await expect(page.locator('#save-dialog')).toBeVisible();
    await capture(page.locator('#save-dialog'), 'u1-save-empty-390x844.png', info);
  });

  test.describe('touch-first', () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('captures narrow touch Inventory', async ({ page }, info) => {
      await openRoom(page);
      await page.locator('#tools-toggle').tap();
      await expect(page.locator('#inventory-dialog')).toBeVisible();
      await capture(page.locator('#inventory-dialog'), 'u1-inventory-touch-390x844.png', info);
    });
  });

  test.describe('forced colors', () => {
    test.use({ forcedColors: 'active', viewport: { width: 1100, height: 850 } });

    test('retains focused Inventory and disabled Save Load reasons', async ({ page }, info) => {
      await openRoom(page);
      expect(await page.locator('[data-window-skin]').evaluateAll((elements) => elements.every(
        (element) => getComputedStyle(element).backgroundImage === 'none',
      ))).toBe(true);
      await openInventory(page);
      await expect(page.locator('#inventory-close')).toBeFocused();
      await capture(page.locator('#inventory-dialog'), 'u1-inventory-forced-colors.png', info);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      await expect(page.locator('#inventory-saves')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#save-dialog')).toBeVisible();
      await expect(page.getByText('Empty — Load and Export are unavailable.')).toHaveCount(3);
      await expect(page.locator('#save-slots .save-slot').first().getByRole('button', { name: 'Save' })).toBeFocused();
      await capture(page.locator('#save-dialog'), 'u1-save-forced-colors.png', info);
    });
  });
});
