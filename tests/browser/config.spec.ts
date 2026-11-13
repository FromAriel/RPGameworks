import { closeMenu, configScreen, expect, openConfig, openRoom, snapshot, test } from './helpers';

/**
 * Decision 0016 U2.3b: Config in the menu holds the player settings as On/Off rows; Controller setup opens the
 * detailed panel and closes back to Config; Debug is no longer part of it (F2 only).
 */
test('Config flips settings by Enter and Left/Right, and Controller setup closes back to it', { tag: ['@inventory', '@input'] }, async ({ page }, info) => {
  await openRoom(page);
  await openConfig(page);
  const screen = configScreen(page);
  const row = (id: string) => screen.locator(`.menu-row[data-id="${id}"]`);
  await expect(screen.locator('.menu-row .menu-row-label')).toHaveText(['Cosmetic particles', 'On-screen controls', 'Controller', 'Controller setup…']);
  await expect(row('particles')).toBeFocused();
  await expect(row('particles')).toHaveAttribute('role', 'switch');
  await expect(row('particles')).toHaveAttribute('aria-checked', 'true');
  await expect(screen.locator('.menu-detail')).toContainText('Effects never change game rules.');
  await page.keyboard.press('Enter');
  await expect(row('particles')).toHaveAttribute('aria-checked', 'false');
  await expect(row('particles').locator('.menu-row-detail')).toHaveText('Off');
  expect((await snapshot(page)).effectsEnabled).toBe(false);
  await expect(row('particles')).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(row('touch')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#touch-controls')).toBeVisible();
  await expect(row('touch')).toBeFocused(); // Left/Right flip the row; they do not move focus.
  await page.screenshot({ path: info.outputPath('config.png') });
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#touch-controls')).toBeHidden();

  await page.keyboard.press('ArrowDown');
  await expect(row('controller')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(row('controller')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(screen.locator('.menu-detail')).toContainText('Close it to come back here.');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#tools-title')).toHaveText('Controller setup');
  await expect(page.locator('#controller-enabled')).not.toBeChecked(); // The form shows Config's change.
  await expect(page.locator('#debug-panel')).toBeHidden();
  await page.locator('#controller-enabled').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(row('controller-setup')).toBeFocused();
  await expect(row('controller')).toHaveAttribute('aria-checked', 'true'); // And Config shows the form's change.
  await closeMenu(page);
  await expect(page.locator('#stage')).toBeFocused();
});

test('Return to game in Controller setup goes to the game, not back to Config', { tag: ['@inventory', '@input'] }, async ({ page }) => {
  await openRoom(page);
  await openConfig(page);
  await configScreen(page).locator('.menu-row[data-id="controller-setup"]').click();
  await page.locator('#tools-resume').click();
  await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(page.locator('#game-menu')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).inputMode).toBe('exploration');
});
