import { openTools, openControllerSettings } from './helpers';
import { test, expect, snapshot } from './helpers';
import type { Page } from '@playwright/test';
import type { PadState } from '../../src/platform/gamepad-model';

declare global { interface Window { __TEST_PADS__: (PadState | null)[] } }

async function fakePads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__TEST_PADS__ = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.__TEST_PADS__ });
  });
}
async function setPad(page: Page, axes = [0, 0, 0, 0], pressed: number[] = [], index = 0, mapping = 'standard'): Promise<void> {
  await page.evaluate(({ axes, pressed, index, mapping }) => {
    window.__TEST_PADS__[index] = { id: `Xbox Elite Series 2 TEST ${index}`, index, mapping, connected: true, axes,
      buttons: Array.from({ length: 20 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) };
  }, { axes, pressed, index, mapping });
}
async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await expect(page.locator('#stage')).toBeFocused();
  await expect(page.locator('#error')).toBeHidden();
}
async function neutral(page: Page, index = 0, mapping = 'standard'): Promise<void> {
  await setPad(page, [0, 0, 0, 0], [], index, mapping); await page.waitForTimeout(100);
}
async function rest(page: Page): Promise<void> { await page.waitForTimeout(250); }

test('launch accepts keyboard without any click and does not repeatedly steal focus', async ({ page }) => {
  await ready(page);
  const initial = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(initial.actorTile.x);
  await page.keyboard.up('ArrowRight');
  await openTools(page); await page.locator('#effects').focus(); await page.waitForTimeout(500);
  await expect(page.locator('#effects')).toBeFocused();
});

test('slow startup preserves intentional settings focus', async ({ page }) => {
  await page.route('**/generated/foundation.png', async (route) => {
    await openControllerSettings(page);
    await page.locator('#controller-deadzone').focus();
    await route.continue();
  });
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await page.waitForTimeout(400);
  await expect(page.locator('#controller-deadzone')).toBeFocused();
});

test('standard controller drives left stick and D-pad with drift rejection', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  const initial = (await snapshot(page)).actorTile;
  await setPad(page, [0.2, 0]); await rest(page); expect((await snapshot(page)).actorTile).toEqual(initial);
  await setPad(page, [0.8, 0]);
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(initial.x);
  await neutral(page); await rest(page); const moved = (await snapshot(page)).actorTile;
  await setPad(page, [0, 0], [12]);
  await expect.poll(async () => (await snapshot(page)).actorTile.y).toBeLessThan(moved.y);
});

test('A emits one burst per press, disconnect releases movement and held reconnect cannot fire', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  await setPad(page, [0, 0], [0]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
  await page.waitForTimeout(300); expect((await snapshot(page)).burstRequests).toBe(1);
  await setPad(page, [0.8, 0]); await rest(page);
  await page.evaluate(() => { window.__TEST_PADS__ = []; }); await rest(page);
  const stopped = (await snapshot(page)).actorTile; await rest(page); expect((await snapshot(page)).actorTile).toEqual(stopped);
  await setPad(page, [0.8, 0], [0]); await rest(page);
  expect((await snapshot(page)).actorTile).toEqual(stopped); expect((await snapshot(page)).burstRequests).toBe(1);
  await neutral(page); await setPad(page, [0, 0], [0]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(2);
});

test('settings freeze input, save deadzone/remapping, and resume only after controls are released', async ({ page }, testInfo) => {
  await fakePads(page); await ready(page); await neutral(page);
  await openControllerSettings(page);
  await page.locator('#controller-deadzone').evaluate((element: HTMLInputElement) => { element.value = '45'; element.dispatchEvent(new Event('change', { bubbles: true })); });
  // X is now assigned to interaction by default; explicitly free it before rebinding.
  await page.locator('#controller-button-interact').selectOption('-1');
  await page.locator('#controller-button-burst').selectOption('2');
  await setPad(page, [1, 0], [2]); await rest(page);
  const initial = await snapshot(page); expect(initial.burstRequests).toBe(0); expect(initial.actorTile.x).toBe(10);
  await page.locator('#controller-return').click(); await rest(page); expect((await snapshot(page)).actorTile.x).toBe(10);
  await neutral(page); await setPad(page, [0.3, 0]); await rest(page); expect((await snapshot(page)).actorTile.x).toBe(10);
  await setPad(page, [0, 0], [2]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
  await ready(page); await openControllerSettings(page);
  await expect(page.locator('#controller-deadzone')).toHaveValue('45');
  await expect(page.locator('#controller-button-burst')).toHaveValue('2');
  await neutral(page); await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('controller-settings.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath('controller-settings-narrow.png'), fullPage: true });
});

test('right stick and inversion can be configured', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  await openControllerSettings(page);
  await page.locator('#controller-axis-x').selectOption('2'); await page.locator('#controller-axis-y').selectOption('3');
  await page.locator('#controller-invert-y').check(); await page.locator('#controller-return').click(); await neutral(page);
  const initial = (await snapshot(page)).actorTile.y;
  await setPad(page, [0, 0, 0, 0.8]);
  await expect.poll(async () => (await snapshot(page)).actorTile.y).toBeLessThan(initial);
});

test('controller selection and non-standard mapping require explicit configuration', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page); await neutral(page, 1, '');
  await openControllerSettings(page);
  await expect(page.locator('#controller-device option')).toHaveCount(3);
  await page.locator('#controller-device').selectOption('1'); await page.locator('#controller-return').click();
  await neutral(page, 1, ''); await setPad(page, [0.8, 0], [], 1, ''); await rest(page);
  expect((await snapshot(page)).actorTile.x).toBe(10);
  await openControllerSettings(page); await page.locator('#controller-unmapped').check();
  await page.locator('#controller-return').click(); await neutral(page, 1, ''); await setPad(page, [0.8, 0], [], 1, '');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
});

test('disabled and blocked controller APIs do not break keyboard gameplay', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', { value: () => { throw new DOMException('blocked', 'SecurityError'); } }));
  await ready(page); await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10); await page.keyboard.up('ArrowRight');
  await openControllerSettings(page);
  await expect(page.locator('#controller-status')).toContainText('unavailable or blocked');
});

test('corrupt preferences and unavailable storage have visible fallbacks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rpgameworks.controller.v1', '{oops'));
  await ready(page); await openControllerSettings(page);
  await expect(page.locator('#controller-message')).toContainText('defaults');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
  // X is now assigned to interaction by default; explicitly free it before rebinding.
  await page.locator('#controller-button-interact').selectOption('-1');
  await page.locator('#controller-button-burst').selectOption('2');
  await expect(page.locator('#controller-message')).toContainText('session only');
  await expect(page.locator('#error')).toBeHidden();
});

test('room restarts keep controller settings and cannot multiply action edges', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  for (let i = 1; i <= 4; i += 1) {
    await openTools(page, 'debug'); await page.locator('#restart').click(); await expect.poll(async () => (await snapshot(page)).starts).toBe(i + 1);
    await page.locator('#stage').focus(); await neutral(page);
    await setPad(page, [0, 0], [0]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
    await page.waitForTimeout(200); expect((await snapshot(page)).burstRequests).toBe(1);
    expect((await snapshot(page)).activeScenes).toBe(1);
  }
});


test('disabling the controller leaves keyboard input active', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  await openControllerSettings(page);
  await page.locator('#controller-enabled').uncheck(); await page.locator('#controller-return').click();
  await setPad(page, [1, 0], [0]); await rest(page);
  expect((await snapshot(page)).actorTile.x).toBe(10); expect((await snapshot(page)).burstRequests).toBe(0);
  await page.keyboard.down('ArrowLeft'); await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeLessThan(10);
  await page.keyboard.up('ArrowLeft');
});

test('window blur and hidden state discard held controller actions until neutral', async ({ page }) => {
  await fakePads(page); await ready(page); await neutral(page);
  await setPad(page, [0.8, 0], [0]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
  });
  await rest(page); const stopped = (await snapshot(page)).actorTile;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
  });
  await rest(page); expect((await snapshot(page)).actorTile).toEqual(stopped); expect((await snapshot(page)).burstRequests).toBe(1);
  await neutral(page); await setPad(page, [0, 0], [0]); await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(2);
});
