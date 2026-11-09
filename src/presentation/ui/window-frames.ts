import { loadFrameManifest } from '../frame-manifest';
import { fillColumn } from '../pixel-frame/fill.ts';
import type { ManifestFrame } from '../pixel-frame/manifest.ts';

/**
 * Page windows on baked Pixel Frame frames (decision 0010, W2.3). The frames come from the game's UI theme through the
 * bake manifest: CSS `border-image` draws the frame (window-frames.css), a per-height hard-stop gradient draws the
 * banded fill, and each window's title sits on a baked nameplate. Text and controls stay semantic HTML.
 *
 * It keeps the W1 surface contract (`[data-window-skin]`, `data-skin-state`, `#skin-status`) so menus, dialogue,
 * inventory, saves and Settings switch over without markup changes. Decoration only: lazy, one manifest, one scheduled
 * invalidation, no per-frame work, and a plain usable fallback when the frames cannot load.
 */
interface Surface { element: HTMLElement; divider: boolean; key: string; paints: number }

const TIMEOUT_MS = 5000;
const VARS = ['src', 'slice', 'border', 'outset', 'fill'] as const;

function decode(url: string): Promise<void> {
  const image = new Image();
  image.src = url;
  return image.decode();
}

/** CSS hard-stop gradient for a fill column, `scale` CSS pixels per logical pixel. */
export function fillGradient(column: readonly (readonly [number, number, number])[], scale: number): string {
  const stops: string[] = [];
  let start = 0;
  for (let row = 1; row <= column.length; row++) {
    const color = column[start]!;
    const next = column[row];
    if (next && next[0] === color[0] && next[1] === color[1] && next[2] === color[2]) continue;
    stops.push(`rgb(${color[0]} ${color[1]} ${color[2]}) ${start * scale}px ${row * scale}px`);
    start = row;
  }
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

export function mountWindowFrames(root: ParentNode = document, base: string = import.meta.env.BASE_URL): { dispose(): void } {
  const surfaces: Surface[] = Array.from(root.querySelectorAll<HTMLElement>('[data-window-skin]')).map(element => {
    if (!element.querySelector('[data-skin-title]')) throw new Error('Window frame surface has no semantic title');
    return { element, divider: element.dataset.windowSkin === 'divider', key: '', paints: 0 };
  });
  const notice = root.querySelector<HTMLElement>('#skin-status');
  const style = document.documentElement.style;
  const lifetime = new AbortController();
  const dirty = new Set(surfaces);
  let pending: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let page: ManifestFrame | null = null;
  let disposed = false, loading = false, failed = false;

  function report(text: string): void { if (notice) notice.textContent = text; }
  function clearVars(): void {
    for (const kind of ['page', 'plate']) for (const name of VARS) style.removeProperty(`--pf-${kind}-${name}`);
  }
  function fallback(reason: string): void {
    failed = true; loading = false;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    clearVars();
    for (const { element } of surfaces) {
      element.dataset.skinState = 'fallback';
      element.style.removeProperty('background-image');
    }
    report(`Window frames unavailable: ${reason}. Plain accessible windows remain usable.`);
    console.warn('[RPGameworks] Window frame fallback:', reason);
  }
  function setVars(kind: 'page' | 'plate', frame: ManifestFrame): void {
    style.setProperty(`--pf-${kind}-src`, `url("${base}generated/${frame.images.raised}")`);
    style.setProperty(`--pf-${kind}-slice`, String(frame.slice));
    style.setProperty(`--pf-${kind}-border`, String(frame.border));
    style.setProperty(`--pf-${kind}-outset`, String(frame.outset));
    const fill = frame.fill.kind === 'flat' ? frame.fill.color : frame.fill.kind === 'bands' ? frame.fill.top : 'transparent';
    style.setProperty(`--pf-${kind}-fill`, fill);
  }
  function ensureFrames(): void {
    if (loading || page || failed || disposed) return;
    loading = true; report('Loading the window frames…');
    timeout = setTimeout(() => { if (!disposed && loading) fallback('Frame loading timed out'); }, TIMEOUT_MS);
    void (async () => {
      const manifest = await loadFrameManifest(base);
      if (disposed || failed) return;
      if (!manifest) throw new Error('The frame manifest could not be loaded');
      const pageFrame = manifest.frames.page, plate = manifest.frames.nameplate;
      if (!pageFrame || !plate) throw new Error('The UI theme has no page or nameplate window');
      await Promise.all([decode(`${base}generated/${pageFrame.images.raised}`), decode(`${base}generated/${plate.images.raised}`)]);
      if (disposed || failed) return;
      if (timeout !== null) clearTimeout(timeout);
      timeout = null; loading = false;
      setVars('page', pageFrame); setVars('plate', plate);
      page = pageFrame;
      report(`Window frames: ${manifest.theme}, baked from the Pixel Frame engine (decision 0010).`);
      invalidate();
    })().catch((cause: unknown) => { if (!disposed && !failed) fallback(cause instanceof Error ? cause.message : String(cause)); });
  }
  function paint(surface: Surface): void {
    const { element, divider } = surface;
    if (!element.getClientRects().length) return;
    if (!page) { ensureFrames(); return; }
    const scale = Number.parseInt(getComputedStyle(element).getPropertyValue('--skin-scale'), 10) === 2 ? 2 : 1;
    if (divider) {
      if (element.dataset.skinState !== 'ready') {
        element.dataset.skinState = 'ready'; element.dataset.skinTitleMode = 'header';
        element.dataset.skinPaints = String(++surface.paints);
      }
      return;
    }
    // The fill covers the padding box; bands follow its height in whole logical pixels.
    const ready = element.dataset.skinState === 'ready';
    const rows = Math.max(0, Math.ceil(element.clientHeight / scale));
    const key = JSON.stringify([ready, rows, scale]);
    if (key === surface.key) return;
    const column = fillColumn(page.fill, rows);
    if (column && column.length) element.style.backgroundImage = fillGradient(column, scale);
    else element.style.removeProperty('background-image');
    element.dataset.skinState = 'ready'; element.dataset.skinTitleMode = 'plate';
    element.dataset.skinPaints = String(++surface.paints);
    surface.key = key;
  }
  function flush(): void {
    pending = null;
    if (disposed || failed || document.hidden) return;
    const batch = [...dirty]; dirty.clear();
    for (const surface of batch) if (!failed) paint(surface);
  }
  function invalidate(): void {
    if (disposed || failed) return;
    for (const surface of surfaces) dirty.add(surface);
    if (pending === null && !document.hidden) pending = requestAnimationFrame(flush);
  }
  const resize = new ResizeObserver(invalidate);
  const attributes = new MutationObserver(invalidate);
  for (const { element } of surfaces) {
    resize.observe(element);
    // Never observe our own style/data attributes, or the changing live Debug table.
    attributes.observe(element, { attributes: true, attributeFilter: ['hidden', 'open'] });
  }
  window.addEventListener('resize', invalidate, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', invalidate, { signal: lifetime.signal });
  invalidate();
  return { dispose(): void {
    if (disposed) return;
    disposed = true; lifetime.abort(); resize.disconnect(); attributes.disconnect(); dirty.clear();
    if (pending !== null) cancelAnimationFrame(pending);
    if (timeout !== null) clearTimeout(timeout);
    pending = null; timeout = null; page = null;
    clearVars();
    for (const { element } of surfaces) {
      element.style.removeProperty('background-image');
      delete element.dataset.skinState; delete element.dataset.skinTitleMode; delete element.dataset.skinPaints;
    }
  } };
}
