import './style.css';
import type { FoundationHandle } from './runtime-types';

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}

const stage = required<HTMLElement>('#stage');
const status = required<HTMLElement>('#status');
const error = required<HTMLElement>('#error');
const effects = required<HTMLInputElement>('#effects');
const diagnostics = required<HTMLElement>('#diagnostics');
const rendererLabel = required<HTMLElement>('#render-label');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const appLifetime = new AbortController();
effects.checked = !media.matches;
let handle: FoundationHandle | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let disposed = false;
let failed = false;
let lastStatus = '';

required<HTMLElement>('#build-label').textContent = `v${__APP_VERSION__} · ${__BUILD_ID__}`;

function reportError(message: string): void {
  failed = true;
  error.hidden = false;
  error.textContent = message;
  status.textContent = 'The foundation could not continue. See the error above.';
}

function drawDiagnostics(): void {
  if (!handle || disposed) return;
  const snapshot = handle.snapshot();
  if (snapshot.phase === 'ready' && !failed) {
    const message = snapshot.effectsEnabled ? 'Ready. Explore the room or trigger a pixel burst.' : 'Ready. Cosmetic particles are off; movement is unchanged.';
    if (message !== lastStatus) { status.textContent = message; lastStatus = message; }
  }
  rendererLabel.textContent = snapshot.renderer.toUpperCase();
  const rows: [string, string][] = [
    ['Renderer', `${snapshot.renderer} / ${snapshot.phaser}`],
    ['Logical view', '320 × 192'],
    ['Player tile', `${snapshot.actorTile.x}, ${snapshot.actorTile.y}`],
    ['Active scenes', String(snapshot.activeScenes)],
    ['Display objects', String(snapshot.displayObjects)],
    ['Particles', `${snapshot.aliveParticles} / 64`],
    ['Scene starts / stops', `${snapshot.starts} / ${snapshot.stops}`],
    ['Observed FPS', Number.isFinite(snapshot.fps) ? String(snapshot.fps) : '—'],
  ];
  // Refreshing at 4 Hz avoids rebuilding UI every animation frame.
  diagnostics.replaceChildren(...rows.map(([name, value]) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const detail = document.createElement('dd');
    label.textContent = name;
    detail.textContent = value;
    row.append(label, detail);
    return row;
  }));
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  if (timer) clearInterval(timer);
  appLifetime.abort();
  handle?.destroy();
  handle = null;
  delete window.__RPGAMEWORKS__;
}

window.addEventListener('error', (event) => reportError(event.message || 'Unexpected rendering error.'), { signal: appLifetime.signal });
window.addEventListener('unhandledrejection', (event) => reportError(String(event.reason)), { signal: appLifetime.signal });
media.addEventListener('change', (event) => {
  if (event.matches) {
    effects.checked = false;
    effects.dispatchEvent(new Event('change'));
  }
}, { signal: appLifetime.signal });
// Retain the running application in a back/forward cache entry; dispose otherwise.
window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { signal: appLifetime.signal });
import.meta.hot?.dispose(dispose);

async function start(): Promise<void> {
  try {
    const { createFoundation } = await import('./presentation/foundation');
    if (disposed) return;
    handle = createFoundation({
      stage,
      controls: required<HTMLElement>('.controls'),
      burst: required<HTMLButtonElement>('#burst'),
      restart: required<HTMLButtonElement>('#restart'),
      effects,
    }, reportError);
    const running = handle;
    window.__RPGAMEWORKS__ = Object.freeze({ snapshot: () => running.snapshot() });
    timer = setInterval(drawDiagnostics, 250);
    drawDiagnostics();
  } catch (cause) {
    reportError(cause instanceof Error ? cause.message : String(cause));
  }
}

void start();
