import type { Page } from '@playwright/test';
import { expect, openRoom, tapDirection, test } from './helpers';

/** Decision 0016 U2.4: the Codex and Credits, both data-only catalog screens in the demo. */
const screen = (page: Page) => page.locator('#game-menu .menu-screen[data-screen="builtin:catalog"]');
const rows = (page: Page) => screen(page).locator('.menu-row .menu-row-label');
async function open(page: Page, entry: 'codex' | 'credits'): Promise<void> {
  await page.keyboard.press('KeyI');
  await page.locator(`#game-menu .menu-row[data-id="${entry}"]`).click();
  await expect(screen(page)).toBeVisible();
}

test('the Codex lists the creatures met, and lore stays ??? until it is discovered', { tag: ['@inventory', '@quests'] }, async ({ page }, info) => {
  await openRoom(page, '?map=demo:map.gallery');
  await open(page, 'codex');
  await expect(screen(page).locator('.menu-tab[aria-selected="true"]')).toHaveText('Creatures');
  await expect(rows(page)).toHaveText(['Clay Golem', 'Bat', 'Two-Headed Ogre']);
  await expect(screen(page).locator('.menu-catalog-top')).toContainText('Found 4 / 8');
  await expect(screen(page).locator('.menu-detail')).toContainText('A figure of fired clay');
  await expect(screen(page).locator('[data-skin-state="ready"]')).toHaveCount(4);
  await page.screenshot({ path: info.outputPath('codex.png') });
  await page.keyboard.press('KeyE');
  await expect(rows(page)).toHaveText(['The Workshop', '???', '???', '???', '???']);
  await page.keyboard.press('ArrowDown');
  await expect(screen(page).locator('.menu-detail')).toContainText('Not discovered yet.');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#game-menu')).toBeHidden();
  // Reading the Gallery plaque unlocks its entry.
  expect(await tapDirection(page, 'ArrowUp')).toBe('walked');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#dialog-text')).toContainText('hidden line glows');
  await page.keyboard.press('Escape');
  await open(page, 'codex');
  await expect(screen(page).locator('.menu-catalog-top')).toContainText('Found 5 / 8');
  await page.keyboard.press('KeyE');
  await expect(rows(page)).toHaveText(['The Workshop', 'The brass plaque', '???', '???', '???']);
  await page.keyboard.press('ArrowDown');
  await expect(screen(page).locator('.menu-detail')).toContainText("A polished lens once focused the gallery's light.");
});

test('Credits: the project, then the Stone Soup artists from the library credit file, scrolling to the last', { tag: ['@inventory'] }, async ({ page }, info) => {
  await openRoom(page);
  await open(page, 'credits');
  await expect(screen(page).locator('.menu-tab')).toHaveText(['RPGameworks', 'Stone Soup']);
  await expect(rows(page)).toHaveText(['RPGameworks', 'UNSCII font', 'White and Silver skin', 'Starter hero']);
  await expect(screen(page).locator('.menu-catalog-top')).not.toContainText('Found'); // Nothing to discover here.
  await page.keyboard.press('KeyE');
  await expect(rows(page).first()).toHaveText('About the Stone Soup art');
  await expect(rows(page).nth(1)).toHaveText('Eino Keskitalo (evktalo)');
  await expect(screen(page).locator('.menu-detail')).toContainText('Licence: CC0-1.0.');
  const count = await rows(page).count();
  for (let i = 1; i < count; i += 1) await page.keyboard.press('ArrowDown');
  const last = screen(page).locator('.menu-row').last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport(); // The list scrolls to keep the highlighted artist visible.
  await page.screenshot({ path: info.outputPath('credits.png') });
});
