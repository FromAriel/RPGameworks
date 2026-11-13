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

export type DirectionKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
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

type HoldWindow = typeof window & { __holdResult__?: Promise<string> };

/**
 * Hold a direction across as many tiles as it takes to leave exploration (a room exit starts its transition, a
 * locked door shows its message, a failed load shows its error), then release. Like tapDirection, the release
 * happens inside the page on the first frame the input mode changes, so a loaded machine cannot carry the held key
 * into the next room's first step. Resolves with the new input mode; callers then wait for the outcome they expect.
 * Use a plain keyboard hold only when the test is about held input itself.
 */
export async function holdToExit(page: Page, key: DirectionKey): Promise<RuntimeSnapshot['inputMode']> {
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await page.evaluate(code => {
    (window as HoldWindow).__holdResult__ = new Promise(resolve => {
      let armed = false;
      const deadline = performance.now() + 15000;
      const onDown = (event: KeyboardEvent) => { if (event.code === code) armed = true; };
      window.addEventListener('keydown', onDown, { capture: true });
      const release = (mode: string) => {
        window.removeEventListener('keydown', onDown, { capture: true });
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code }));
        resolve(mode);
      };
      const tick = () => {
        const mode = window.__RPGAMEWORKS__!.snapshot().inputMode;
        if (armed && mode !== 'exploration') { release(mode); return; }
        if (performance.now() > deadline) { release(mode); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, key);
  await page.keyboard.down(key);
  let mode: string;
  try { mode = await page.evaluate(() => (window as HoldWindow).__holdResult__!); }
  finally { await page.keyboard.up(key); }
  return mode as RuntimeSnapshot['inputMode'];
}

/** The menu key opens the hub (decision 0016); its Items entry opens the Items screen. */
export async function openInventory(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-row[data-id="items"]')).toBeFocused();
  await page.locator('#game-menu .menu-row[data-id="items"]').click();
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"]')).toBeVisible();
}
/** Back from a hub screen to the hub, then to the map. */
export async function closeInventory(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:hub"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
}
/** The Journal screen (decision 0016 U2.3a). */
export const journalScreen = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:journal"]');
/** Menu, then Journal. */
export async function openJournal(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-row[data-id="journal"]')).toBeVisible();
  await page.locator('#game-menu .menu-row[data-id="journal"]').click();
  await expect(journalScreen(page)).toBeVisible();
}
/** Menu, then Save: the Save/Load dialog (until U2.3c rebuilds it in the menu). */
export async function openSaves(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#game-menu .menu-row[data-id="save"]')).toBeVisible();
  await page.locator('#game-menu .menu-row[data-id="save"]').click();
  await expect(page.locator('#save-dialog')).toBeVisible();
}
/** The Items screen's rows (labels), in order. */
export const itemRows = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:items"] .menu-row .menu-row-label');

/** Reach the settings through the real closed-by-default player menu: Menu, then Config (decision 0016). */
export async function openTools(page: Page, tab: 'options' | 'debug' = 'options'): Promise<void> {
  if (await page.locator('#tools-panel').isHidden()) {
    if (await page.locator('#game-menu').isHidden()) await page.locator('#tools-toggle').click();
    await expect.poll(async () => await page.locator('#game-menu').isVisible() || await page.locator('#tools-panel').isVisible()).toBe(true);
    if (await page.locator('#game-menu').isVisible()) await page.locator('#game-menu .menu-row[data-id="config"]').click();
  }
  const button = page.locator(`#${tab}-tab`);
  if (await button.getAttribute('aria-selected') !== 'true') await button.click();
  await expect(page.locator(`#${tab}-panel`)).toBeVisible();
}
/** Close the settings; opened from the hub's Config they return to the hub, so close that too. */
export async function closeTools(page: Page): Promise<void> {
  if (await page.locator('#tools-panel').isVisible()) await page.locator('#tools-close').click();
  await expect(page.locator('#tools-panel')).toBeHidden();
  if (await page.locator('#game-menu').isVisible()) { await page.keyboard.press('Escape'); await expect(page.locator('#game-menu')).toBeHidden(); }
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
