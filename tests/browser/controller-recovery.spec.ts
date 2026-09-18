import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { snapshot } from './helpers';

const CHECKSUM = 'Uncaught Error: Corruption: block checksum mismatch';
// Real rejections are intentional here only. Assert their exact count rather
// than weakening the shared no-errors fixture used by existing tests.
const observed = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; observed.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }, testInfo) => {
  const expected = testInfo.title.includes('unrelated rejection') ? [CHECKSUM] : [];
  expect(observed.get(page), 'Only the deliberate page rejection may be uncaught').toEqual(expected);
});

async function simulatedController(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = { id: 'Synthetic Xbox standard controller', index: 0, connected: true, mapping: 'standard',
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
}
async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await expect(page.locator('#stage')).toBeFocused();
}
async function moveStick(page: Page): Promise<void> {
  await page.evaluate(() => { (navigator.getGamepads()[0]!.axes as number[])[0] = 0.85; });
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
}

test('unrelated rejection during startup cannot disable autofocus or controller movement', async ({ page }) => {
  await simulatedController(page);
  await page.route('**/generated/foundation.png', async (route) => {
    await page.evaluate((message) => { void Promise.reject(new Error(message)); }, CHECKSUM);
    await expect(page.locator('#page-error-notice')).toContainText('checksum mismatch');
    await route.continue();
  });
  await ready(page);
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await moveStick(page);
  await expect(page.locator('#status')).toContainText('Ready');
});

test('unrelated rejection after startup stays observable without stopping keyboard input', async ({ page }) => {
  await ready(page);
  await page.evaluate((message) => { void Promise.reject(new Error(message)); }, CHECKSUM);
  await expect(page.locator('#page-error-notice')).toContainText('checksum mismatch');
  await expect(page.locator('#error')).toBeHidden();
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await page.keyboard.up('ArrowRight');
  await page.locator('#controller-settings summary').click();
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.pageErrors.count).toBe(1);
  expect(report.pageErrors.last.message).toBe(CHECKSUM);
  expect(report.fatalGameError).toBeNull();
});

test('activation restores viewport focus and reports the actual input gate', async ({ page }, testInfo) => {
  await simulatedController(page); await ready(page);
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await page.locator('#effects').focus();
  await expect(page.locator('#controller-brief')).toContainText('gameplay paused');
  await page.locator('#controller-settings summary').click();
  await expect(page.locator('#controller-status')).toContainText('gameplay paused');
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.controller.detectedCount).toBe(1);
  expect(report.controller.devices[0].mapping).toBe('standard');
  expect(report.settingsOpen).toBe(true);
  expect(report.viewportFocused).toBe(false);
  expect(report.controller.gameplayRequested).toBe(false);
  expect(report.runtimePhase).toBe('ready');
  await page.screenshot({ path: testInfo.outputPath('controller-recovery-report.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('#controller-activate').click();
  await expect(page.locator('#stage')).toBeFocused();
  await expect(page.locator('#controller-settings')).not.toHaveAttribute('open', '');
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await moveStick(page);
});

test('controller detection and reporting work even if the map cannot load', async ({ page }) => {
  await simulatedController(page);
  await page.route('**/generated/content/game.json', (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#error')).toBeVisible();
  await page.locator('#controller-settings summary').click();
  await page.locator('#controller-rescan').click();
  await expect(page.locator('#controller-live')).toContainText('Axes:');
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.runtimePhase).toBe('error');
  expect(report.fatalGameError).toBeTruthy();
  expect(report.controller.detectedCount).toBe(1);
});

test('blocked API stays isolated and preserves its reason in the report', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', {
    value: () => { throw new DOMException('Gamepad permission denied', 'SecurityError'); },
  }));
  await ready(page);
  await expect(page.locator('#controller-brief')).toContainText('SecurityError');
  await page.locator('#controller-settings summary').click();
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.controller.detectedCount).toBe(0);
  expect(report.controller.status).toContain('Gamepad permission denied');
  await expect(page.locator('#error')).toBeHidden();
});

test('neutral wait is distinguished from an undetected controller', async ({ page }) => {
  await simulatedController(page); await ready(page);
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await page.locator('#controller-settings summary').click();
  await page.evaluate(() => { (navigator.getGamepads()[0]!.axes as number[])[0] = 0.85; });
  await page.locator('#controller-activate').click();
  await expect(page.locator('#controller-brief')).toContainText('Waiting for neutral');
  expect((await snapshot(page)).actorTile.x).toBe(10);
  await page.evaluate(() => { (navigator.getGamepads()[0]!.axes as number[])[0] = 0; });
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await moveStick(page);
});

test('a genuine scene update exception is still fatal and visible', async ({ page }) => {
  await simulatedController(page); await ready(page);
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await page.evaluate(() => {
    const pad = navigator.getGamepads()[0]!;
    let once = true;
    Object.defineProperty(pad, 'axes', { configurable: true, get: () => {
      if (once) { once = false; throw new Error('Intentional scene update fault'); }
      return [0, 0, 0, 0];
    } });
  });
  await expect(page.locator('#error')).toContainText('Map scene failed: Intentional scene update fault');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('error');
  await expect(page.locator('#page-error-notice')).toBeHidden();
});
