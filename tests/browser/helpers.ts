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

type DirectionKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
type TapWindow = typeof window & { __tapResult__?: Promise<'walked' | 'turned' | 'none'> };

/**
 * Press a direction for exactly one gameplay reaction: one step onto a walkable tile, or a turn toward a solid one.
 * A held direction starts another step whenever the current 160 ms step ends, so a release timed from the test
 * process races the game on slow machines (a 120 ms hold once walked two tiles on the Windows CI runner). The key
 * down is a real key press; an in-page watcher releases it (a window keyup, which the input owner listens for) in the
 * same frame the step starts, or after a few frames when the direction only turns the hero. Resolves when movement
 * has finished.
 */
export async function tapDirection(page: Page, key: DirectionKey): Promise<'walked' | 'turned' | 'none'> {
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.evaluate(code => {
    const want = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, string>)[code];
    (window as TapWindow).__tapResult__ = new Promise(resolve => {
      let frames = -1;
      const deadline = performance.now() + 5000;
      const armed = (event: KeyboardEvent) => { if (event.code === code && frames < 0) frames = 0; };
      window.addEventListener('keydown', armed, { capture: true });
      const release = (result: 'walked' | 'turned' | 'none') => {
        window.removeEventListener('keydown', armed, { capture: true });
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
        resolve(result);
      };
      const tick = () => {
        const state = window.__RPGAMEWORKS__!.snapshot();
        if (frames >= 0) {
          frames += 1;
          if (state.moving) { release('walked'); return; }
          if (frames >= 3) { release(state.facing === want ? 'turned' : 'none'); return; }
        }
        if (performance.now() > deadline) { release('none'); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, key);
  await page.keyboard.down(key);
  let result: 'walked' | 'turned' | 'none';
  try { result = await page.evaluate(() => (window as TapWindow).__tapResult__!); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(false);
  return result;
}

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
