import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from './helpers';

const galleryUrl = 'http://127.0.0.1:4174/ui-gallery/';

interface GallerySnapshot {
  activeControllers: number;
  boundaryClears: number;
  busyActivations: number;
  confirmationPending: boolean;
  glowEnabled: boolean;
  lifecycleCycles: number;
  selectedTab: string;
  scrollState: string;
}

async function openGallery(page: Page): Promise<void> {
  await page.goto(galleryUrl);
  await expect.poll(() => page.evaluate(() => Boolean(window.__UI_GALLERY__))).toBe(true);
  await expect(page.locator('#gallery-window')).toBeVisible();
}

async function snapshot(page: Page): Promise<GallerySnapshot> {
  return page.evaluate(() => {
    if (!window.__UI_GALLERY__) throw new Error('UI gallery diagnostics are unavailable.');
    return window.__UI_GALLERY__.snapshot();
  });
}

async function sample(page: Page, direction: 'up' | 'down' | 'left' | 'right' | null, interact = false, cancel = false): Promise<void> {
  await page.evaluate(({ direction, interact, cancel }) => window.__UI_GALLERY__?.sample(direction, interact, cancel), { direction, interact, cancel });
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(name), fullPage: true, animations: 'disabled' });
}

test('gallery renders production components with semantic text and state cues', async ({ page }) => {
  await openGallery(page);
  await expect(page.locator('.ui-action-button')).toHaveCount(9);
  await expect(page.locator('.ui-list-row')).toHaveCount(16);
  await expect(page.locator('.ui-status')).toHaveCount(6);
  await expect(page.locator('[role="meter"]')).toHaveCount(3);
  await expect(page.locator('#gallery-disabled')).toBeDisabled();
  await expect(page.locator('#gallery-disabled-disabled-reason')).toHaveText('Unavailable: this slot does not contain a save.');
  await expect(page.locator('#gallery-disabled')).toHaveAttribute('aria-describedby', 'gallery-disabled-disabled-reason');
  await expect(page.locator('#gallery-busy')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#gallery-busy')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#gallery-row-selected')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#gallery-row-selected .ui-list-row__marker')).toHaveText('Selected');
  await expect(page.locator('#gallery-inset-body')).toContainText('<strong> remains visible text.');
  await expect(page.locator('#gallery-inset-body strong')).toHaveCount(0);
  await expect(page.locator('#gallery-meter-info')).toHaveAttribute('aria-valuetext', '7 / 10');
  await expect(page.locator('#gallery-meter-info .ui-meter__number')).toHaveText('7 / 10');
  await expect(page.locator('#interactive-prompts')).toHaveAttribute('role', 'group');
  await expect(page.locator('#interactive-prompts')).toHaveAttribute('aria-label', 'Controls');
});

test('bright brass text has the requested one-pixel half-black outline', async ({ page }) => {
  await openGallery(page);
  expect(await page.locator('.ui-inset__title').evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, strokeWidth: style.webkitTextStrokeWidth, strokeColor: style.webkitTextStrokeColor };
  })).toEqual({ color: 'rgb(242, 221, 166)', strokeWidth: '1px', strokeColor: 'rgba(0, 0, 0, 0.5)' });
});

test('optional glow uses one opacity-only pulse layer and can be disabled without losing state', async ({ page }, info) => {
  await openGallery(page);
  const toggle = page.locator('#gallery-glow-toggle');
  const meter = page.locator('#gallery-meter-info');
  const fill = meter.locator('.ui-meter__fill');
  await expect(meter).not.toHaveAttribute('data-ui-glow', 'pulse');
  await toggle.click();
  await expect(meter).toHaveAttribute('data-ui-glow', 'pulse');
  await expect(page.locator('#gallery-row-selected')).toHaveAttribute('data-ui-glow', 'pulse');
  await expect(toggle).toHaveText('Disable optional glow pulse');
  expect((await snapshot(page)).glowEnabled).toBe(true);
  expect(await fill.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return { animationName: style.animationName, willChange: style.willChange, boxShadow: style.boxShadow };
  })).toEqual(expect.objectContaining({ animationName: 'ui-glow-pulse-opacity', willChange: 'opacity' }));
  expect(await fill.evaluate((element) => getComputedStyle(element, '::after').boxShadow)).not.toBe('none');
  await capture(page, info, 'u1.2-gallery-glow-wide.png');
  await toggle.click();
  await expect(meter).not.toHaveAttribute('data-ui-glow', 'pulse');
  await expect(page.locator('#gallery-row-selected')).toHaveAttribute('aria-pressed', 'true');
  expect((await snapshot(page)).glowEnabled).toBe(false);
});

test('tabs, rows, prompts, and semantic controller navigation share one behavior path', async ({ page }) => {
  await openGallery(page);
  const items = page.locator('#gallery-tab-items');
  await items.focus();
  await page.keyboard.press('End');
  await expect(page.locator('#gallery-tab-system')).toBeFocused();
  await expect(page.locator('#gallery-tab-system')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(items).toBeFocused();
  await expect(items).toHaveAttribute('aria-selected', 'true');

  const first = page.locator('#interactive-row-0');
  const second = page.locator('#interactive-row-1');
  await first.focus();
  await sample(page, 'down');
  await expect(second).toBeFocused();
  await sample(page, null, true);
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#interaction-status')).toContainText('Gallery map selected.');

  await page.evaluate(() => window.__UI_GALLERY__?.setPrompts('controller'));
  await expect(page.locator('#interactive-prompts')).toContainText('Stick / D-pad');
  await page.evaluate(() => window.__UI_GALLERY__?.setPrompts('touch'));
  await expect(page.locator('#interactive-prompts')).toContainText('Tap');
});

test('selected cyan and neutral focus remain simultaneous and busy controls cannot activate', async ({ page }) => {
  await openGallery(page);
  const selected = page.locator('#interactive-row-0');
  await selected.focus();
  expect(await selected.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, line: style.borderLeftColor, outline: style.outlineColor, outlineStyle: style.outlineStyle };
  })).toEqual({
    background: 'rgb(38, 59, 80)', line: 'rgb(189, 229, 244)', outline: 'rgb(241, 246, 250)', outlineStyle: 'dashed',
  });
  const primary = page.locator('#gallery-primary');
  await primary.hover();
  await expect(primary).toHaveCSS('background-color', 'rgb(36, 63, 84)');
  await page.mouse.down();
  await expect(primary).not.toHaveCSS('transform', 'none');
  await page.mouse.up();
  await page.locator('#gallery-busy').click({ force: true });
  await expect(page.locator('#gallery-busy')).toHaveText('Saving progress…');
  expect((await snapshot(page)).busyActivations).toBe(0);
  await expect(page.locator('#interaction-status')).toContainText('Choose a row');
});

test('scroll affordances expose above and below content without color alone', async ({ page }) => {
  await openGallery(page);
  await expect(page.locator('.ui-scroll-affordance--above')).toBeHidden();
  await expect(page.locator('.ui-scroll-affordance--below')).toHaveText('More below');
  await expect(page.locator('.ui-scroll-affordance--below')).toBeVisible();
  await page.locator('#gallery-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
  await expect.poll(async () => (await snapshot(page)).scrollState).toBe('above');
  await expect(page.locator('.ui-scroll-affordance--above')).toHaveText('More above');
  await expect(page.locator('.ui-scroll-affordance--above')).toBeVisible();
  await expect(page.locator('.ui-scroll-affordance--below')).toBeHidden();
});

test('confirmation requires fresh intent, rejects overlap, cancels safely, and restores focus', async ({ page }) => {
  await openGallery(page);
  const opener = page.locator('#open-confirmation');
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#gallery-confirmation')).toBeVisible();
  await expect(page.locator('#gallery-confirmation button', { hasText: 'Cancel' })).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).confirmationPending).toBe(true);
  expect(await page.evaluate(() => window.__UI_GALLERY__?.tryOverlap())).toBe('A confirmation is already pending.');
  await sample(page, null, false, true);
  await expect(page.locator('#gallery-confirmation')).toBeHidden();
  await expect(opener).toBeFocused();
  await expect(page.locator('#interaction-status')).toContainText('Replacement cancelled.');

  await opener.click();
  await expect(page.locator('#gallery-confirmation')).toBeVisible();
  await page.getByRole('button', { name: 'Replace progress' }).click();
  await expect(opener).toBeFocused();
  await expect(page.locator('#interaction-status')).toContainText('Replacement confirmed.');
  expect((await snapshot(page)).boundaryClears).toBe(4);
});

test('repeated disposable lifecycles return to the same active-owner count', async ({ page }) => {
  await openGallery(page);
  const before = await snapshot(page);
  await page.evaluate(() => window.__UI_GALLERY__?.cycleLifecycle(40));
  const after = await snapshot(page);
  expect(after.activeControllers).toBe(before.activeControllers);
  expect(after.lifecycleCycles).toBe(40);
  await page.locator('#open-confirmation').click();
  await expect(page.locator('#gallery-confirmation')).toBeVisible();
  await page.evaluate(() => window.__UI_GALLERY__?.dispose());
  await expect(page.locator('#gallery-confirmation')).toBeHidden();
  expect(await page.evaluate(() => window.__UI_GALLERY__)).toBeUndefined();
});

test('wide and compact gallery references remain reviewable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  await openGallery(page);
  await capture(page, info, 'u1.2-gallery-wide-1100x850.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#interactive-lane')).toHaveCSS('grid-template-columns', /[0-9.]+px/);
  const box = await page.locator('#gallery-window').boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 1000)).toBeLessThanOrEqual(390);
  await capture(page, info, 'u1.2-gallery-compact-390x844.png');
});

test.describe('gallery accessibility media', () => {
  test('forced colors retain structure, selection, focus, and disabled reasons', async ({ page }, info) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openGallery(page);
    expect(await page.locator('[data-window-skin]').evaluateAll((elements) => elements.every(
      (element) => getComputedStyle(element).backgroundImage === 'none',
    ))).toBe(true);
    await expect(page.locator('#gallery-disabled-disabled-reason')).toBeVisible();
    await page.locator('#gallery-row-selected').focus();
    await expect(page.locator('#gallery-row-selected')).toBeFocused();
    await page.evaluate(() => window.__UI_GALLERY__?.setGlow(true));
    expect(await page.locator('#gallery-meter-info .ui-meter__fill').evaluate(
      (element) => getComputedStyle(element, '::after').display,
    )).toBe('none');
    await capture(page, info, 'u1.2-gallery-forced-colors.png');
  });

  test('reduced motion removes transitions without removing selected state', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGallery(page);
    await expect(page.locator('#gallery-row-selected')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('#gallery-row-selected').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
    await page.evaluate(() => window.__UI_GALLERY__?.setGlow(true));
    expect(await page.locator('#gallery-meter-info .ui-meter__fill').evaluate((element) => {
      const style = getComputedStyle(element, '::after');
      return { animationName: style.animationName, opacity: style.opacity, boxShadow: style.boxShadow };
    })).toEqual(expect.objectContaining({ animationName: 'none', opacity: '0.55' }));
  });

  test('two-times page enlargement reflows without horizontal document clipping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGallery(page);
    await page.evaluate(() => { document.body.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('#gallery-disabled-disabled-reason')).toBeVisible();
  });

  test('plain fallback remains usable when the decorative atlas fails', async ({ page }) => {
    await page.route('**/Window-*.png', (route) => route.abort());
    await openGallery(page);
    await expect(page.locator('#gallery-window')).toHaveAttribute('data-skin-state', 'fallback');
    await expect(page.locator('#skin-status')).toContainText('Plain accessible windows remain usable.');
    await page.locator('#interactive-row-0').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#interactive-row-1')).toBeFocused();
  });
});

test.describe('touch-first gallery', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('keeps direct controls at the shared touch target and captures the stacked layout', async ({ page }, info) => {
    await openGallery(page);
    await expect(page.locator('#gallery-primary')).toHaveCSS('min-height', '44px');
    await page.locator('#interactive-row-2').tap();
    await expect(page.locator('#interactive-row-2')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__UI_GALLERY__?.setPrompts('touch'));
    await capture(page, info, 'u1.2-gallery-touch-390x844.png');
  });
});
