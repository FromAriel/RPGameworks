import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect, snapshot, openRoom, openTools, setEffects } from '../browser/helpers';
import { distribution, frameSummary } from './metrics';
import { startProbe, stopProbe } from './probe';
import type { Capture } from './probe';

const DURATION_MS = 10_000;
const WORKSHOP = 'demo:map.workshop', GALLERY = 'demo:map.gallery';
function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', timeout: 3000 }).trim();
}
const source = {
  sha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
  dirty: git('status', '--porcelain').length > 0,
  lockSha256: createHash('sha256').update(readFileSync('package-lock.json')).digest('hex'),
};
// Identity of every tracked file affecting this fixture, independent of documentation commits.
const runtimeFiles = git('ls-files', '--', 'src', 'assets', 'content', 'schemas', 'tools/generate*',
  'tools/build-content.mjs', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts').split('\n').filter(Boolean).sort();
const runtimeHash = createHash('sha256');
for (const path of runtimeFiles) { const bytes = readFileSync(path); runtimeHash.update(`${path}\0${bytes.length}\0`); runtimeHash.update(bytes); }
const environment = {
  source: { ...source, runtimeFingerprintSha256: runtimeHash.digest('hex') },
  node: process.version, platform: process.platform, osRelease: os.release(), arch: process.arch,
  logicalCPUs: os.cpus().length, cpuModel: os.cpus()[0]?.model ?? null, hostMemoryBytes: os.totalmem(),
  ci: Boolean(process.env.CI), ciRun: process.env.GITHUB_RUN_ID ?? null, ciAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  hostLabel: process.env.BENCHMARK_HOST_LABEL ?? 'local',
  renderingPolicy: 'Headless Chromium; --enable-unsafe-swiftshader; actual driver recorded below.',
  throttling: 'None. Localhost static production preview; no physical-device inference.',
  tracing: 'Off during measurement. Single worker, zero retries.',
  cosmeticRandomness: 'Existing unseeded cosmetic particle lifespan/speed ranges; not a deterministic pixel replay.',
};

async function pageEnvironment(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      browser: navigator.userAgent, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight },
      canvas: { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height },
      driver: gl ? String(gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)) : null,
      buildLabel: document.querySelector('#build-label')?.textContent,
      debugOpen: !document.querySelector<HTMLElement>('#debug-panel')!.hidden && !document.querySelector<HTMLElement>('#tools-panel')!.hidden,
      settingsOpen: !document.querySelector<HTMLElement>('#options-panel')!.hidden && !document.querySelector<HTMLElement>('#tools-panel')!.hidden,
    };
  });
}

async function writeReport(page: Page, info: TestInfo, name: string, capture: Capture, complete: boolean) {
  const counters = ['activeScenes', 'loadedMaps', 'displayObjects', 'textureCount', 'aliveParticles', 'pooledParticles'] as const;
  const resources = Object.fromEntries(counters.map(key => [key, distribution(capture.samples.map(s => s.runtime[key]))]));
  const report = {
    schemaVersion: 1, workloadVersion: 'm1-baseline-v1', name, workloadCompleted: complete,
    generatedAt: new Date().toISOString(), environment, page: await pageEnvironment(page),
    requestedSteadyDurationMs: name === 'door-tour' ? null : DURATION_MS,
    measurement: {
      framePacing: 'Intervals between benchmark requestAnimationFrame timestamps; not GPU time, CPU work or presented-frame counts.',
      resources: 'Read-only runtime/DOM snapshots at about 4 Hz; tour additionally samples completed transfers. Sampled maxima can miss intra-frame peaks.',
      travel: 'Map resource fetch start to first rAF-observed exploration-ready snapshot. Includes observer-frame delay; excludes walking to the door. no-cache may revalidate.',
      unavailable: { gameCpuWorkMs: null, gpuTimeMs: null, heapBytes: null, gpuMemoryBytes: null, listenerCount: null },
    },
    summary: { ...frameSummary(capture.intervalsMs), resources,
      engineReportedFps: distribution(capture.samples.map(s => s.runtime.fps)),
      domElements: distribution(capture.samples.map(s => s.domElements)),
      travelAllMs: distribution(capture.transfers.flatMap(t => t.fetchToReadyObservedMs === null ? [] : [t.fetchToReadyObservedMs])),
      travelAfterFirstVisitEachWayMs: distribution(capture.transfers.slice(2).flatMap(t => t.fetchToReadyObservedMs === null ? [] : [t.fetchToReadyObservedMs])),
    },
    capture,
  };
  const path = info.outputPath(`${name}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  await info.attach(name, { path, contentType: 'application/json' });
  return report;
}

function checkCapture(capture: Capture): void {
  expect(capture.autoStopped).toBe(false); expect(capture.overflow).toBe(false);
  expect(capture.hiddenEvents).toBe(0); expect(capture.blurEvents).toBe(0);
  expect(capture.intervalsMs.length).toBeGreaterThan(0);
  expect(capture.samples.length).toBeGreaterThan(1);
  for (const { runtime } of capture.samples) {
    expect(runtime.phase).toBe('ready'); expect(runtime.activeScenes).toBe(1); expect(runtime.loadedMaps).toBe(1);
    expect(runtime.aliveParticles).toBeLessThanOrEqual(64); expect(runtime.pooledParticles).toBeLessThanOrEqual(64);
    expect(runtime.failedTransitions).toBe(0); expect(runtime.cancelledTransitions).toBe(0);
    expect(runtime.starts).toBe(1); expect(runtime.stops).toBe(0);
  }
}

/** Release as soon as the renderer sees motion; do not inject positions or call engine actions. */
async function step(page: Page, key: string): Promise<void> {
  await expect(page.locator('#stage')).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try { await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(false);
}
async function talk(page: Page): Promise<void> {
  await step(page, 'ArrowDown');
  expect((await snapshot(page)).actorTile).toEqual({ x: 10, y: 7 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-state', 'ready');
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('message');
}

// Identical ordinary input sequence for all moving comparisons: 10 × 1s holds,
// alternating left/right along a clear row; one Space press every 250ms.
async function walkingWorkload(page: Page): Promise<void> {
  for (let leg = 0; leg < 10; leg += 1) {
    const key = leg % 2 ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key);
    try {
      for (let pulse = 0; pulse < 4; pulse += 1) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(250);
      }
    } finally { await page.keyboard.up(key); }
  }
}

const cases = [
  { name: 'workshop-idle', suffix: '', effects: false, mode: 'idle' },
  { name: 'gallery-idle', suffix: '?map=demo:map.gallery', effects: false, mode: 'idle' },
  { name: 'walk-effects-off', suffix: '', effects: false, mode: 'walk' },
  { name: 'walk-effects-on', suffix: '', effects: true, mode: 'walk' },
  { name: 'walk-effects-debug', suffix: '', effects: true, mode: 'debug' },
  { name: 'mara-message', suffix: '', effects: true, mode: 'message' },
  { name: 'settings-idle', suffix: '', effects: true, mode: 'settings' },
] as const;

for (const scenario of cases) test(`baseline: ${scenario.name}`, async ({ page }, info) => {
  await openRoom(page, scenario.suffix); await setEffects(page, scenario.effects);
  if (scenario.mode === 'message') await talk(page);
  else if (scenario.mode === 'settings') await openTools(page);
  else if (scenario.mode === 'debug') { await openTools(page, 'debug'); await page.locator('#stage').click({ position: { x: 10, y: 10 } }); }
  // Warmup excludes image decoding and initial skin composition from steady-state measurements.
  await page.waitForTimeout(1500);
  const screen = await pageEnvironment(page);
  expect(screen.canvas).toMatchObject({ width: 320, height: 192, cssWidth: 960, cssHeight: 576 });
  await startProbe(page);
  let complete = false;
  let capture!: Capture;
  try {
    if (scenario.mode === 'walk' || scenario.mode === 'debug') await walkingWorkload(page);
    else await page.waitForTimeout(DURATION_MS);
    complete = true;
  } finally {
    capture = await stopProbe(page);
    await writeReport(page, info, scenario.name, capture, complete);
  }
  checkCapture(capture);
  expect(capture.elapsedMs).toBeGreaterThanOrEqual(DURATION_MS);
  const first = capture.samples[0]!, last = capture.samples.at(-1)!;
  expect(last.paints).toEqual(first.paints); // Stable chrome never repaints just because the game runs.
  if (scenario.mode === 'debug') expect(capture.diagnosticsMutations).toBeGreaterThan(0);
  else expect(capture.diagnosticsMutations).toBe(0);
  const shapes = new Set(capture.samples.map(s => `${s.runtime.mapId}/${s.runtime.displayObjects}/${s.runtime.textureCount}`));
  expect(shapes.size).toBe(1);
  expect(last.runtime.transitions).toBe(0);
  if (scenario.mode === 'walk' || scenario.mode === 'debug') {
    expect(last.runtime.burstRequests - first.runtime.burstRequests).toBe(40);
    expect(capture.samples.some(s => s.runtime.moving)).toBe(true);
    if (scenario.effects) expect(capture.samples.some(s => s.runtime.aliveParticles > 0)).toBe(true);
    else expect(capture.samples.every(s => s.runtime.aliveParticles === 0)).toBe(true);
  }
});

test('baseline: door-tour', async ({ page }, info) => {
  await openRoom(page); await setEffects(page, true);
  // Warm the travel dialog skin with the real conversation, then return to row 6.
  await talk(page); await page.keyboard.press('Escape');
  await expect(page.locator('#interaction-dialog')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused(); await step(page, 'ArrowUp');
  expect((await snapshot(page)).actorTile).toEqual({ x: 10, y: 6 });
  const initial = await snapshot(page);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const perMap = new Map<string, { objects: number; textures: number }>();
  const checkpoints = [];
  await startProbe(page, true);
  let complete = false;
  let capture!: Capture;
  try {
    for (let leg = 0; leg < 40; leg += 1) {
      const target = leg % 2 ? WORKSHOP : GALLERY;
      const key = leg % 2 ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.press('Space');
      await page.keyboard.down(key);
      try { await expect.poll(async () => (await snapshot(page)).mapId).toBe(target); }
      finally { await page.keyboard.up(key); }
      await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
      await expect(page.locator('#interaction-dialog')).toBeHidden();
      await expect(page.locator('#stage')).toBeFocused();
      // Wait for the read-only observer, not an arbitrary delay or a game-state override.
      await page.waitForFunction(n => window.__RPG_BENCHMARK__?.observedTransfers === n, leg + 1);
      const s = await snapshot(page);
      const shape = { objects: s.displayObjects, textures: s.textureCount };
      if (perMap.has(target)) expect(shape).toEqual(perMap.get(target)); else perMap.set(target, shape);
      expect(s.aliveParticles).toBe(0); expect(s.pooledParticles).toBe(0);
      expect(s.actorTile).toEqual(leg % 2 ? { x: 17, y: 6 } : { x: 2, y: 6 });
      checkpoints.push({ leg: leg + 1, ...s });
    }
    await page.waitForTimeout(100); // Include the final readiness observation.
    complete = true;
  } finally {
    capture = await stopProbe(page);
    await writeReport(page, info, 'door-tour', capture, complete);
    const path = info.outputPath('door-checkpoints.json');
    writeFileSync(path, JSON.stringify({ source, checkpoints }, null, 2) + '\n');
    await info.attach('door-checkpoints', { path, contentType: 'application/json' });
  }
  checkCapture(capture);
  expect(capture.transfers).toHaveLength(40);
  expect(capture.transfers.every(t => t.fetchToReadyObservedMs !== null && t.fetchToReadyObservedMs >= 0)).toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  const final = await snapshot(page);
  expect(final.transitions - initial.transitions).toBe(40);
  expect(final.displayObjects).toBe(initial.displayObjects); expect(final.textureCount).toBe(initial.textureCount);
  expect(final.mapId).toBe(WORKSHOP);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).burstRequests).toBe(1);
});
