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
  await expect(page.locator('#error')).toBeHidden();
  await page.getByTestId('viewport').focus();
}

export { expect };
