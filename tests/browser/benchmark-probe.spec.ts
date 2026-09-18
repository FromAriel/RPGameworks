import { test, expect, openRoom, snapshot } from './helpers';
import { startProbe, stopProbe } from '../benchmark/probe';

test('benchmark probe is absent at launch, refuses duplicate ownership and disposes cleanly', async ({ page }) => {
  await openRoom(page);
  expect(await page.evaluate(() => window.__RPG_BENCHMARK__)).toBeUndefined();
  const before = await snapshot(page);
  await startProbe(page);
  await expect(startProbe(page)).rejects.toThrow('already active');
  await page.waitForTimeout(150);
  const data = await stopProbe(page);
  expect(data.intervalsMs.length).toBeGreaterThan(0);
  expect(data.autoStopped).toBe(false); expect(data.overflow).toBe(false);
  expect((await snapshot(page)).actorTile).toEqual(before.actorTile);
  expect(await page.evaluate(() => window.__RPG_BENCHMARK__)).toBeUndefined();
  await expect(stopProbe(page)).rejects.toThrow('No benchmark capture');
  await startProbe(page); await page.waitForTimeout(60); await stopProbe(page);
});

test('benchmark preserves long intervals instead of hiding stalls with movement clamping', async ({ page }) => {
  await openRoom(page); await startProbe(page); await page.waitForTimeout(100);
  // Deliberately exercise the measurement path, not a performance claim about the game.
  await page.evaluate(() => { const until = performance.now() + 90; while (performance.now() < until) { /* test stall */ } });
  await page.waitForTimeout(150);
  const data = await stopProbe(page);
  expect(Math.max(...data.intervalsMs)).toBeGreaterThan(50);
  expect(data.samples.at(-1)!.runtime.phase).toBe('ready');
});

test('benchmark records hidden/blur contamination and refuses a hidden capture', async ({ page }) => {
  await openRoom(page); await startProbe(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur'));
  });
  const data = await stopProbe(page);
  expect(data.hiddenEvents).toBe(1); expect(data.blurEvents).toBe(1);
  await expect(startProbe(page)).rejects.toThrow('visible');
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange'));
  });
});
