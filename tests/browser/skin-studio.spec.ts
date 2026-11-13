import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, test } from './helpers';

/**
 * Decision 0013 B4 acceptance: the skin studio re-bakes and re-composes real W1 windows when a setting changes, a saved
 * recipe bakes to identical pixels with `npm run skins` (B3), and the page is absent from the game build.
 */
const studioUrl = 'http://127.0.0.1:4176/';
const SKIN = 'assets/source/ui/skins/white-silver';
const rgbaSha = (file: string) => createHash('sha256').update(PNG.sync.read(readFileSync(file)).data).digest('hex');
const windows = (page: Page) => page.locator('#preview [data-window-skin]');

async function openStudio(page: Page): Promise<void> {
  await page.goto(studioUrl);
  await expect(page.locator('body')).toHaveAttribute('data-bakes', '1');
  await expect(windows(page)).toHaveCount(10);
  await expect(page.locator('#preview [data-skin-state="ready"]')).toHaveCount(10);
}
/** Wait for the next bake after an edit and return its atlas hash. */
async function nextBake(page: Page, before: number): Promise<string> {
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-bakes'))).toBeGreaterThan(before);
  await expect(page.locator('#preview [data-skin-state="ready"]')).toHaveCount(10);
  return (await page.locator('body').getAttribute('data-atlas-sha'))!;
}

test('the studio bakes the default skin in the page to the same pixels npm run skins committed, at 1× and 2×', { tag: ['@windows', '@smoke'] }, async ({ page }) => {
  await openStudio(page);
  await expect(page.locator('#recipe-pick')).toHaveValue(/white-silver\/recipe\.json$/);
  expect(await page.locator('body').getAttribute('data-atlas-sha')).toBe(rgbaSha(`${SKIN}/Window.png`));
  const scales = await windows(page).evaluateAll((elements) => elements.map((e) => getComputedStyle(e).getPropertyValue('--skin-scale').trim()));
  expect(scales).toEqual([...Array(5).fill('1'), ...Array(5).fill('2')]);
  await expect(page.locator('#studio-errors li')).toHaveCount(0);
});

test('changing a setting re-bakes and re-composes the windows; a bad value is reported and blocks saving', { tag: ['@windows'] }, async ({ page }) => {
  await openStudio(page);
  const firstSha = await page.locator('body').getAttribute('data-atlas-sha');
  const firstImage = await windows(page).first().evaluate((e) => (e as HTMLElement).style.backgroundImage);
  await page.locator('#wear').fill('0.6');
  const worn = await nextBake(page, 1);
  expect(worn).not.toBe(firstSha);
  expect(await windows(page).first().evaluate((e) => (e as HTMLElement).style.backgroundImage)).not.toBe(firstImage);

  await page.locator('#profile').fill('3 x');
  await page.locator('#profile').press('Tab');
  await expect(page.locator('#studio-errors li')).toHaveText(['Bevel: type heights 0–9 separated by spaces, for example "3 2".']);
  await expect(page.locator('#save')).toBeDisabled();
  await page.locator('#profile').fill('2 2');
  await page.locator('#profile').press('Tab');
  await nextBake(page, 2);
  await expect(page.locator('#studio-errors li')).toHaveCount(0);
  await expect(page.locator('#save')).toBeEnabled();
});

test('a saved recipe bakes with npm run skins to exactly the pixels the studio showed', { tag: ['@windows'] }, async ({ page }) => {
  await openStudio(page);
  await page.locator('#band').fill('5');
  await nextBake(page, 1);
  await page.locator('#profile').fill('2 4 2');
  await page.locator('#profile').press('Tab');
  await nextBake(page, 2);
  await page.locator('#azimuth').fill('200');
  const shown = await nextBake(page, 3);

  const root = mkdtempSync(path.join(tmpdir(), 'rpg-studio-'));
  try {
    const dir = path.join(root, 'studio-test');
    mkdirSync(dir);
    const download = page.waitForEvent('download');
    await page.locator('#save').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('recipe.json');
    await file.saveAs(path.join(dir, 'recipe.json'));
    copyFileSync(`${SKIN}/corner.png`, path.join(dir, 'corner.png'));
    const recipe = JSON.parse(readFileSync(path.join(dir, 'recipe.json'), 'utf8')) as { band: unknown; profile: unknown; light: { azimuth: number } };
    expect(recipe).toMatchObject({ band: { top: 5, right: 5, bottom: 5, left: 5 }, profile: [2, 4, 2], light: { azimuth: 200 } });
    execFileSync(process.execPath, ['tools/skin-bake/skins.ts', '--root', root], { encoding: 'utf8' });
    expect(rgbaSha(path.join(dir, 'Window.png'))).toBe(shown);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the studio is not part of the game build', { tag: ['@windows', '@boot'] }, async ({ page }) => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const text = files('dist').filter((f) => /\.(html|js|css|json)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  // The page's title, the bake core's own refusal message, and the reader's art check never reach the game.
  for (const marker of ['Skin studio', 'has no room for the outline', 'does not exist beside the recipe']) expect(text, marker).not.toContain(marker);
  const response = await page.goto('/RPGameworks/skin-studio/');
  expect(await page.locator('#controls').count(), `status ${response?.status()}`).toBe(0);
});
