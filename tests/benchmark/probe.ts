import type { Page } from '@playwright/test';
import type { RuntimeSnapshot } from '../../src/runtime-types';

export interface Sample {
  elapsedMs: number;
  runtime: RuntimeSnapshot;
  domElements: number;
  paints: number[];
}
export interface Transfer {
  sequence: number;
  target: string;
  fetchPath: string | null;
  fetchStartMs: number | null;
  readyObservedMs: number;
  fetchToReadyObservedMs: number | null;
}
export interface Capture {
  elapsedMs: number;
  intervalsMs: number[];
  samples: Sample[];
  transfers: Transfer[];
  longTasks: { count: number; totalMs: number; maxMs: number } | null;
  diagnosticsMutations: number;
  hiddenEvents: number;
  blurEvents: number;
  overflow: boolean;
  autoStopped: boolean;
}
interface Probe { stop(): Capture; readonly observedTransfers: number; }
declare global { interface Window { __RPG_BENCHMARK__?: Probe; } }

/** All instrumentation is injected into a test page, never shipped in the game. */
export async function startProbe(page: Page, tour = false): Promise<void> {
  await page.evaluate(({ tour }) => {
    if (window.__RPG_BENCHMARK__) throw new Error('A benchmark capture is already active');
    if (!window.__RPGAMEWORKS__ || window.__RPGAMEWORKS__.snapshot().phase !== 'ready' || document.hidden || !document.hasFocus()) {
      throw new Error('Capture requires a ready, visible, focused application');
    }
    const start = performance.now();
    const buffer = new Float64Array(30_000); // Fixed ceiling; never a growing frame log.
    const samples: Sample[] = [], transfers: Transfer[] = [];
    let used = 0, previous: number | null = null, lastSample = -Infinity, stopped = false;
    let sequence = window.__RPGAMEWORKS__.snapshot().transitions;
    let hiddenEvents = 0, blurEvents = 0, diagnosticsMutations = 0, overflow = false, autoStopped = false;
    let raf = 0, watchdog = 0;
    let result: Capture | null = null;
    const lifetime = new AbortController();
    const read = (): RuntimeSnapshot => window.__RPGAMEWORKS__!.snapshot();
    function sample(now: number, runtime = read()): void {
      if (samples.length >= 1024) { overflow = true; return; }
      samples.push({ elapsedMs: now - start, runtime, domElements: document.getElementsByTagName('*').length,
        paints: Array.from(document.querySelectorAll<HTMLElement>('[data-window-skin]'), e => Number(e.dataset.skinPaints ?? 0)) });
      lastSample = now;
    }
    const longTasks = PerformanceObserver.supportedEntryTypes.includes('longtask') ? { count: 0, totalMs: 0, maxMs: 0 } : null;
    function consume(entries: PerformanceEntry[]): void {
      if (!longTasks) return;
      for (const entry of entries) {
        if (entry.startTime < start) continue;
        longTasks.count += 1; longTasks.totalMs += entry.duration; longTasks.maxMs = Math.max(longTasks.maxMs, entry.duration);
      }
    }
    const observer = longTasks ? new PerformanceObserver(list => consume(list.getEntries())) : null;
    observer?.observe({ type: 'longtask', buffered: false });
    const diagnostics = new MutationObserver(list => { diagnosticsMutations += list.length; });
    const table = document.querySelector('#diagnostics');
    if (table) diagnostics.observe(table, { childList: true, subtree: true, characterData: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenEvents += 1; }, { signal: lifetime.signal });
    window.addEventListener('blur', () => { blurEvents += 1; }, { signal: lifetime.signal });
    function frame(timestamp: number): void {
      if (stopped) return;
      const now = performance.now();
      // Keep all observed intervals, including stalls. No clipping or trimming outliers.
      if (previous !== null) {
        if (used < buffer.length) buffer[used++] = timestamp - previous;
        else overflow = true;
      }
      previous = timestamp;
      const runtime = tour || now - lastSample >= 250 ? read() : null;
      if (runtime && tour && runtime.inputMode === 'exploration' && runtime.transitions !== sequence) {
        if (runtime.transitions !== sequence + 1 || transfers.length >= 256) overflow = true;
        else {
          const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const entry = entries.filter(e => e.name.includes('/generated/content/maps/') && e.startTime >= start).at(-1);
          transfers.push({ sequence: runtime.transitions, target: runtime.mapId,
            fetchPath: entry ? new URL(entry.name).pathname : null, fetchStartMs: entry?.startTime ?? null,
            readyObservedMs: now, fetchToReadyObservedMs: entry ? now - entry.startTime : null });
          sample(now, runtime);
        }
        sequence = runtime.transitions;
      }
      if (runtime && now - lastSample >= 250) sample(now, runtime);
      raf = requestAnimationFrame(frame);
    }
    function stop(): Capture {
      if (result) return result;
      stopped = true; cancelAnimationFrame(raf); clearTimeout(watchdog); lifetime.abort();
      if (observer) { consume(observer.takeRecords()); observer.disconnect(); }
      diagnosticsMutations += diagnostics.takeRecords().length; diagnostics.disconnect();
      const end = performance.now(); sample(end);
      result = { elapsedMs: end - start, intervalsMs: Array.from(buffer.subarray(0, used)), samples, transfers,
        longTasks, hiddenEvents, blurEvents, diagnosticsMutations, overflow, autoStopped };
      return result;
    }
    sample(start);
    window.__RPG_BENCHMARK__ = { stop, get observedTransfers() { return transfers.length; } };
    // A failed driver must not leave the probe running forever.
    watchdog = window.setTimeout(() => { autoStopped = true; stop(); }, 120_000);
    raf = requestAnimationFrame(frame);
  }, { tour });
}

export async function stopProbe(page: Page): Promise<Capture> {
  return page.evaluate(() => {
    if (!window.__RPG_BENCHMARK__) throw new Error('No benchmark capture is active');
    const value = window.__RPG_BENCHMARK__.stop();
    delete window.__RPG_BENCHMARK__;
    return value;
  });
}
