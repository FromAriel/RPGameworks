import type { Page } from '@playwright/test';
import { test, expect, openRoom, openInventory, closeInventory, snapshot, tapDirection } from './helpers';
import { SKIN_SPECS, atlasDataUrl, buildSkin } from '../fixtures/skin-fixtures';

/**
 * Decision 0011 W3.4: the game's UI theme chooses each surface's skin, and a message or dialogue may ask for its own.
 * These tests change only content (the generated theme and map, served through routes) and never the code.
 */
const BASE = 'demo:skin.white-silver', THIN = 'demo:skin.thin';
const thin = buildSkin(SKIN_SPECS[0]!);
const thinPng = Buffer.from(atlasDataUrl(thin).split(',')[1]!, 'base64');

interface Theme { schemaVersion: 1; skins: { id: string; manifest: string; atlas: string }[]; surfaces: Record<string, string> }

/** Serve the fixture skin beside the real one, and let a test edit the generated theme. */
async function withThinSkin(page: Page, edit: (theme: Theme) => void, atlas: 'ok' | 'missing' = 'ok'): Promise<string[]> {
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/skins/fixture-thin.png')) requests.push(r.url()); });
  await page.route('**/generated/content/skins/fixture-thin.json', (route) => route.fulfill({ json: { ...thin.skin, image: 'fixture-thin.png' } }));
  await page.route('**/generated/content/skins/fixture-thin.png', (route) => atlas === 'ok'
    ? route.fulfill({ contentType: 'image/png', body: thinPng }) : route.fulfill({ status: 404, body: 'missing' }));
  await page.route('**/generated/content/ui-theme.*.json', async (route) => {
    const theme = await (await route.fetch()).json() as Theme;
    theme.skins.push({ id: THIN, manifest: 'skins/fixture-thin.json', atlas: 'skins/fixture-thin.png' });
    edit(theme);
    await route.fulfill({ json: theme });
  });
  return requests;
}

async function painted(page: Page, selector: string, state: 'ready' | 'fallback' = 'ready'): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute('data-skin-state', state);
}
async function talkToMara(page: Page): Promise<void> {
  expect(await tapDirection(page, 'ArrowDown')).toBe('walked');
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toBeVisible();
}
async function closeDialogue(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('#interaction-dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
}

test('the UI theme re-skins only the surface it names, loading that skin once', { tag: ['@windows', '@inventory', '@dialogue'] }, async ({ page }) => {
  const requests = await withThinSkin(page, (theme) => { theme.surfaces.inventory = THIN; });
  await openRoom(page);
  for (let round = 0; round < 2; round++) {
    await openInventory(page);
    await painted(page, '#game-menu .menu-screen[data-screen="builtin:items"] .menu-window[aria-label="Items"]');
    await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"] .menu-window[aria-label="Items"]')).toHaveAttribute('data-skin-active', THIN);
    await closeInventory(page);
  }
  await talkToMara(page);
  await painted(page, '#interaction-dialog');
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-active', BASE);
  expect(requests).toHaveLength(1);
  await expect(page.locator('#skin-status')).toContainText('thin 4-pixel band');
});

test('a dialogue that names a skin uses it, and the window returns to its default afterwards', { tag: ['@windows', '@dialogue'] }, async ({ page }) => {
  await withThinSkin(page, () => undefined);
  await page.route('**/generated/content/maps/workshop.*.json', async (route) => {
    const map = await (await route.fetch()).json() as { dialogues?: { id: string; skin?: string }[] };
    const mara = map.dialogues?.find((d) => d.id === 'mara-lens');
    if (!mara) throw new Error('Mara’s dialogue graph is missing from the Workshop map');
    mara.skin = THIN;
    await route.fulfill({ json: map });
  });
  await openRoom(page);
  await talkToMara(page);
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-id', THIN);
  await painted(page, '#interaction-dialog');
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-active', THIN);
  await closeDialogue(page);
  await expect(page.locator('#interaction-dialog')).not.toHaveAttribute('data-skin-id', /./);
  await openInventory(page);
  await painted(page, '#game-menu .menu-screen[data-screen="builtin:items"] .menu-window[aria-label="Items"]');
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"] .menu-window[aria-label="Items"]')).toHaveAttribute('data-skin-active', BASE);
});

test('a skin whose atlas is missing falls back on its own surfaces only', { tag: ['@windows', '@inventory'] }, async ({ page }) => {
  await withThinSkin(page, (theme) => { theme.surfaces.inventory = THIN; }, 'missing');
  await openRoom(page);
  await openInventory(page);
  await painted(page, '#game-menu .menu-screen[data-screen="builtin:items"] .menu-window[aria-label="Items"]', 'fallback');
  await expect(page.locator('#skin-status')).toContainText('Plain accessible windows remain usable.');
  await expect(page.locator('#game-menu .menu-screen[data-screen="builtin:items"] .menu-row')).toBeFocused(); // Still a usable window.
  await closeInventory(page);
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await talkToMara(page);
  await painted(page, '#interaction-dialog');
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-active', BASE);
});
