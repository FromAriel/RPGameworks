import type { Page, TestInfo } from '@playwright/test';
import { test, expect, openRoom, openInventory, closeInventory, snapshot, tapDirection } from './helpers';
import { SKIN_SPECS, atlasDataUrl, buildSkin } from '../fixtures/skin-fixtures';
import { contentInsets, readSkinManifest } from '../../src/presentation/skin/skin-manifest.mjs';

/**
 * Decision 0011 W3.3: content and titles fit the skin. Every check reads element geometry against the insets the
 * compositor publishes, so it works for any skin: Ariel's in the real game windows, and each fixture skin in the
 * test-only UI gallery (mounted through mountWindowskin's skin parameter).
 */
const galleryUrl = 'http://127.0.0.1:4174/ui-gallery/';

interface Box { left: number; top: number; right: number; bottom: number }
interface Fit {
  element: Box; scale: number; mode: string | undefined; state: string | undefined;
  insets: { left: number; right: number; bottom: number; contentTop: number; titleMax: number };
  title: Box; content: { label: string; box: Box }[];
}

/** Measure a skinned window: its box, the published fitting, its title and each content block beside the title. */
async function measure(page: Page, selector: string): Promise<Fit> {
  return page.evaluate((selector) => {
    const element = document.querySelector<HTMLElement>(selector)!;
    const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    const value = (name: string) => Number.parseFloat(element.style.getPropertyValue(name));
    const title = element.querySelector<HTMLElement>('[data-skin-title]')!;
    const content = [...element.children].filter((child) => !child.contains(title) && child.getClientRects().length && !child.classList.contains('sr-only'))
      .map((child) => ({ label: child.id || child.className || child.tagName, box: box(child.getBoundingClientRect()) }));
    return {
      element: box(element.getBoundingClientRect()), scale: Number.parseInt(getComputedStyle(element).getPropertyValue('--skin-scale'), 10) || 1,
      mode: element.dataset.skinTitleMode, state: element.dataset.skinState,
      insets: { left: value('--skin-inset-left'), right: value('--skin-inset-right'), bottom: value('--skin-inset-bottom'), contentTop: value('--skin-content-top'), titleMax: value('--skin-title-max') },
      title: box(title.getBoundingClientRect()), content,
    };
  }, selector);
}

/** No content block crosses the published content rectangle (half a pixel of rounding allowed). */
function expectContentInside(fit: Fit, where: string): void {
  const e = fit.element, i = fit.insets;
  expect(Object.values(i).every(Number.isFinite), `${where}: fitting published`).toBe(true);
  expect(fit.content.length, `${where}: content found`).toBeGreaterThan(0);
  for (const { label, box } of fit.content) {
    expect(box.left, `${where}: ${label} left`).toBeGreaterThanOrEqual(e.left + i.left - 0.5);
    expect(box.right, `${where}: ${label} right`).toBeLessThanOrEqual(e.right - i.right + 0.5);
    if (box.bottom <= e.bottom) expect(box.bottom, `${where}: ${label} bottom`).toBeLessThanOrEqual(e.bottom - i.bottom + 0.5);
  }
  const first = Math.min(...fit.content.map(({ box }) => box.top));
  expect(first, `${where}: content starts below the frame's content top`).toBeGreaterThanOrEqual(e.top + i.contentTop - 0.5);
}

/** A title in the gap is centred and fits its slot; a header fallback sits below the content top. */
function expectTitleFits(fit: Fit, where: string, titleTop?: { frameTop: number; band: number }): void {
  const e = fit.element, t = fit.title;
  if (fit.mode === 'gap') {
    expect(Math.abs((t.left + t.right) / 2 - (e.left + e.right) / 2), `${where}: title centred`).toBeLessThanOrEqual(1);
    expect(t.right - t.left, `${where}: title inside its slot`).toBeLessThanOrEqual(fit.insets.titleMax + 0.5);
    if (titleTop) {
      const centre = (t.top + t.bottom) / 2 - e.top;
      expect(centre, `${where}: title centre in the title band`).toBeGreaterThanOrEqual(titleTop.frameTop - 1);
      expect(centre, `${where}: title centre in the title band`).toBeLessThanOrEqual(titleTop.frameTop + titleTop.band + 1);
    }
  } else {
    expect(fit.mode, `${where}: title mode`).toBe('header');
    expect(t.top, `${where}: header below the content top`).toBeGreaterThanOrEqual(e.top + fit.insets.contentTop - 0.5);
  }
}

async function painted(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute('data-skin-state', 'ready');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('Ariel’s skin: dialogue and inventory content stay inside the published insets at both scales', { tag: ['@windows', '@dialogue', '@inventory'] }, async ({ page }) => {
  for (const viewport of [{ width: 1100, height: 850 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openRoom(page);
    expect(await tapDirection(page, 'ArrowDown')).toBe('walked');
    await page.keyboard.press('KeyE');
    await painted(page, '#interaction-dialog');
    const dialogue = await measure(page, '#interaction-dialog');
    expect(dialogue.scale).toBe(viewport.width >= 768 ? 2 : 1);
    expectContentInside(dialogue, `dialogue ${viewport.width}`);
    expectTitleFits(dialogue, `dialogue ${viewport.width}`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#interaction-dialog')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
    await openInventory(page);
    await painted(page, '#inventory-dialog');
    const inventory = await measure(page, '#inventory-dialog');
    expectContentInside(inventory, `inventory ${viewport.width}`);
    expectTitleFits(inventory, `inventory ${viewport.width}`);
    await closeInventory(page);
  }
});

async function openGalleryWith(page: Page, index: number): Promise<{ skin: ReturnType<typeof buildSkin>['skin'] }> {
  const built = buildSkin(SKIN_SPECS[index]!);
  await page.goto(galleryUrl);
  await expect.poll(() => page.evaluate(() => Boolean(window.__UI_GALLERY__))).toBe(true);
  await page.evaluate(({ url, manifest }) => window.__UI_GALLERY__!.useSkin(url, manifest), { url: atlasDataUrl(built), manifest: built.skin });
  await painted(page, '#gallery-window');
  return { skin: built.skin };
}

for (const [index, spec] of SKIN_SPECS.entries()) {
  test(`fixture skin “${spec.name}” fits content and title at wide, narrow and 2× sizes`, { tag: ['@windows'] }, async ({ page }, info: TestInfo) => {
    const { skin } = await openGalleryWith(page, index);
    const read = readSkinManifest(skin);
    if (!read.ok) throw new Error(read.errors.join('; '));
    const insetTop = contentInsets(read.skin).top;
    const band = Math.max(skin.geometry.band.top, skin.tiles.find((t) => t.id === 'title.open')!.rect!.h);
    const check = async (where: string) => {
      await painted(page, '#gallery-window');
      const fit = await measure(page, '#gallery-window');
      expect(fit.state, `${where}: skin state`).toBe('ready');
      expectContentInside(fit, where);
      expectTitleFits(fit, where, { frameTop: fit.insets.contentTop - insetTop * fit.scale, band: band * fit.scale });
      return fit;
    };
    expect((await check('wide 1×')).mode).toBe('gap');
    await page.screenshot({ path: info.outputPath(`fit-${index}-wide.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await check('narrow 1×');
    // 2×: the gallery window takes the larger pixel scale; a resize makes the skin repaint at it.
    await page.evaluate(() => document.querySelector<HTMLElement>('#gallery-window')!.style.setProperty('--skin-scale', '2'));
    await page.setViewportSize({ width: 1100, height: 850 });
    expect((await check('wide 2×')).scale).toBe(2);
    await page.screenshot({ path: info.outputPath(`fit-${index}-wide-2x.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await check('narrow 2×');
    // A title too long for its slot falls back to a header below the content top.
    await page.evaluate(() => { document.querySelector('#gallery-title')!.textContent = 'A deliberately long gallery window title that cannot fit between the corners and its brackets'; });
    expect((await check('long title')).mode).toBe('header');
  });
}
