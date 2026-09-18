import { test, expect, snapshot } from './helpers';
import type { Page } from '@playwright/test';
import type { PadState } from '../../src/platform/gamepad-model';

declare global { interface Window { __PARITY_PADS__: (PadState | null)[] } }
async function install(page: Page, index = 0, numeric = false): Promise<void> {
  await page.addInitScript(({ index, numeric }) => {
    window.__PARITY_PADS__ = Array.from({ length:index + 1 }, () => null);
    window.__PARITY_PADS__[index] = { id:'MouseJoy parity synthetic controller', index, mapping:'standard', connected:true,
      axes:[0,0,0,0], buttons:Array.from({ length:17 }, () => numeric ? 0 : { pressed:false, value:0 }) };
    // Native readers can return fresh objects; never rely on mutating cached ones.
    Object.defineProperty(navigator, 'getGamepads', { configurable:true, value:() => structuredClone(window.__PARITY_PADS__) });
  }, { index, numeric });
}
async function ready(page: Page): Promise<void> {
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await expect(page.locator('#controller-brief')).toContainText('Ready');
}
async function axis(page: Page, index: number, x: number): Promise<void> {
  await page.evaluate(({ index, x }) => { (window.__PARITY_PADS__[index]!.axes as number[])[0] = x; }, { index, x });
}

test('game accepts a high native slot and numeric buttons like the supplied reader', async ({ page }) => {
  await install(page, 20, true); await ready(page);
  await axis(page,20,.9); await expect.poll(async() => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await axis(page,20,0);
  await page.evaluate(() => { (window.__PARITY_PADS__[20]!.buttons as number[])[0] = 1; });
  await expect.poll(async() => (await snapshot(page)).burstRequests).toBe(1);
  await page.locator('#controller-settings summary').click();
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.controller.inputReader).toBe('mousejoy-frame-v1');
  expect(report.controller.sampling).toMatchObject({ rawSlotCount:21, nonNullCount:1, connectedCount:1 });
  expect(report.controller.chosenIndex).toBe(20);
});

test('page-level gamepad input works without focusing the viewport but respects form fields', async ({ page }) => {
  await install(page); await ready(page);
  // Blur the viewport into body: a connected controller should not require a canvas click.
  await page.locator('#stage').evaluate((stage:HTMLElement) => stage.blur());
  await expect(page.locator('#stage')).not.toBeFocused();
  await expect(page.locator('#controller-brief')).toContainText('Ready');
  await axis(page,0,.9); await expect.poll(async() => (await snapshot(page)).actorTile.x).toBeGreaterThan(10);
  await axis(page,0,0); await page.waitForTimeout(180);
  await page.locator('#effects').focus();
  await expect(page.locator('#controller-brief')).toContainText('gameplay paused');
  const before = (await snapshot(page)).actorTile;
  await axis(page,0,-.9); await page.waitForTimeout(250);
  expect((await snapshot(page)).actorTile).toEqual(before);
});

test('raw detection continues before map loading finishes', async ({ page }) => {
  await install(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/generated/content/game.json', async route => { await gate; await route.continue(); });
  await page.goto('./', { waitUntil:'domcontentloaded' });
  try {
    await page.locator('#controller-settings summary').click();
    await expect(page.locator('#controller-live')).toContainText('Axes:');
    await page.locator('#controller-report-button').click();
    const report = JSON.parse(await page.locator('#controller-report').inputValue());
    expect(report.runtimePhase).toBe('booting');
    expect(report.controller.sampling.frameSamples).toBeGreaterThan(0);
    expect(report.controller.detectedCount).toBe(1);
    expect(report.controller.waitingForNeutral).toBe(true);
  } finally { release(); }
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
});

test('standalone reference probe reads both sticks on the production project subpath', async ({ page }) => {
  await install(page,20,true);
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await page.goto('./controller-probe.html');
  await expect(page.locator('#connection')).toContainText('Connected: MouseJoy');
  await page.evaluate(() => {
    (window.__PARITY_PADS__[20]!.axes as number[]).splice(0,4,.8,-.7,-.6,.5);
    (window.__PARITY_PADS__[20]!.buttons as number[])[2]=1;
  });
  await expect(page.locator('#lx-value')).toHaveText('0.80');
  await expect(page.locator('#ry-value')).toHaveText('0.50');
  await expect(page.locator('#buttons')).toContainText('2');
  const report = JSON.parse(await page.locator('#report').innerText());
  expect(report.rawSlotCount).toBe(21); expect(report.connectedCount).toBe(1);
  expect(requests.some(url => /foundation|generated\/content/.test(url))).toBe(false);
  await expect(page.getByRole('link', { name:'Return to RPGameworks' })).toHaveAttribute('href','./');
});

test('an empty native response remains empty in the game and the independent probe', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator,'getGamepads',{ value:() => [null,null,null,null] }));
  await page.goto('./');
  await expect.poll(() => page.evaluate(() => window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await page.locator('#controller-settings summary').click();
  await page.locator('#controller-report-button').click();
  const report = JSON.parse(await page.locator('#controller-report').inputValue());
  expect(report.controller.sampling).toMatchObject({ rawSlotCount:4, nonNullCount:0, connectedCount:0 });
  expect(report.controller.devices).toEqual([]);
  await page.locator('#controller-probe').evaluate((anchor:HTMLAnchorElement) => { location.href=anchor.href; });
  await expect(page.locator('#connection')).toContainText('no connected controller');
  expect(JSON.parse(await page.locator('#report').innerText()).connectedCount).toBe(0);
});
