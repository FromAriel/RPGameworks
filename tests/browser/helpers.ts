import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RuntimeSnapshot } from '../../src/runtime-types';

export const test = base.extend<{ errorGuard: void }>({
  errorGuard: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('TEST_WINDOW_ERROR:')) errors.push(message.text());
    });
    await page.addInitScript(() => {
      // ResizeObserver errors use window.error, not always Playwright pageerror.
      window.addEventListener('error', (event) => console.error(`TEST_WINDOW_ERROR:${event.message}`));
    });
    await use();
    expect(errors, 'Uncaught browser errors').toEqual([]);
  }, { auto: true }],
});

export const snapshot = (page: Page): Promise<RuntimeSnapshot> => page.evaluate(() => {
  if (!window.__RPGAMEWORKS__) throw new Error('Runtime diagnostics not installed.');
  return window.__RPGAMEWORKS__.snapshot();
});

export async function openRoom(page: Page, suffix = ''): Promise<void> {
  await page.goto(`./${suffix}`);
  // The rendering module loads asynchronously after the HTML load event.
  // Poll a value during startup; throwing from the poll would fail immediately.
  await expect.poll(() => page.evaluate(
    () => window.__RPGAMEWORKS__?.snapshot().phase ?? 'booting',
  )).toBe('ready');
  await expect.poll(() => page.evaluate(
    () => window.__RPGAMEWORKS__?.snapshot().characterArtStatus ?? 'loading',
  )).not.toBe('loading');
  await expect(page.locator('#error')).toBeHidden();
  await page.getByTestId('viewport').focus();
}

export { expect };

/** Reach controls through the real closed-by-default player menu. */
export async function openTools(page: Page, tab: 'options' | 'debug' = 'options'): Promise<void> {
  if (await page.locator('#tools-panel').isHidden()) {
    if (await page.locator('#inventory-dialog').isHidden()) await page.locator('#tools-toggle').click();
    await expect.poll(async () => await page.locator('#inventory-dialog').isVisible() || await page.locator('#tools-panel').isVisible()).toBe(true);
    if (await page.locator('#inventory-dialog').isVisible()) await page.locator('#inventory-settings').click();
  }
  const button = page.locator(`#${tab}-tab`);
  if (await button.getAttribute('aria-selected') !== 'true') await button.click();
  await expect(page.locator(`#${tab}-panel`)).toBeVisible();
}
export async function closeTools(page: Page): Promise<void> {
  if (await page.locator('#tools-panel').isVisible()) await page.locator('#tools-close').click();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
}
export async function openControllerSettings(page: Page): Promise<void> {
  await openTools(page);
  if (!(await page.locator('#controller-settings').evaluate((root: HTMLDetailsElement) => root.open))) {
    await page.locator('#controller-settings summary').click();
  }
}
export async function setEffects(page: Page, value: boolean): Promise<void> {
  await openTools(page); await page.locator('#effects').setChecked(value); await closeTools(page);
}
export async function enableTouch(page: Page): Promise<void> {
  await openTools(page); await page.locator('#touch-enabled').check(); await closeTools(page);
  await expect(page.locator('#touch-controls')).toBeVisible();
}
