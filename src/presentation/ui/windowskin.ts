import skinUrl from '../../../assets/source/ui/base/Window.png?no-inline';
import { SkinPainter } from '../skin/paint';
import type { TitleBox } from '../skin/layout';

interface Surface { element: HTMLElement; title: HTMLElement; divider: boolean; key: string; paints: number }

/** Decoration only. One lazy image, one scratch bitmap, one scheduled invalidation.
 * No listeners for gameplay inputs, no recurring frame loop, no per-tile DOM nodes.
 */
export function mountWindowskin(root: ParentNode = document): { dispose(): void } {
  const surfaces: Surface[] = Array.from(root.querySelectorAll<HTMLElement>('[data-window-skin]')).map(element => {
    const title = element.querySelector<HTMLElement>('[data-skin-title]');
    if (!title) throw new Error('Windowskin surface has no semantic title');
    return { element, title, divider: element.dataset.windowSkin === 'divider', key: '', paints: 0 };
  });
  const notice = root.querySelector<HTMLElement>('#skin-status');
  const lifetime = new AbortController();
  const dirty = new Set(surfaces);
  let pending: number | null = null, timeout: ReturnType<typeof setTimeout> | null = null;
  let image: HTMLImageElement | null = null, painter: SkinPainter | null = null;
  let disposed = false, loading = false, failed = false;

  function report(text: string): void { if (notice) notice.textContent = text; }
  function fallback(reason: string): void {
    failed = true; loading = false;
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    if (image) { image.onload = null; image.onerror = null; }
    painter?.dispose(); painter = null;
    for (const { element } of surfaces) {
      element.dataset.skinState = 'fallback';
      element.style.removeProperty('background-image');
    }
    report(`Window skin unavailable: ${reason}. Plain accessible windows remain usable.`);
    console.warn('[RPGameworks] Window skin fallback:', reason);
  }
  function ensureImage(): void {
    if (loading || painter || failed || disposed) return;
    loading = true; report('Loading the base window skin…');
    image = new Image();
    image.onload = () => {
      if (disposed || failed || !image) return;
      if (timeout !== null) clearTimeout(timeout);
      timeout = null; image.onload = null; image.onerror = null; loading = false;
      try {
        if (image.naturalWidth !== 192 || image.naturalHeight !== 192) throw new Error('Expected a 192 × 192 atlas');
        painter = new SkinPainter(image);
        report('Base skin: Ariel’s edited Midnight Silver. Source preserved; connector audit in docs/WINDOW-SKIN.md.');
        invalidate();
      } catch (cause) { fallback(cause instanceof Error ? cause.message : String(cause)); }
    };
    image.onerror = () => { if (!disposed) fallback('The atlas could not be loaded'); };
    timeout = setTimeout(() => { if (!disposed) fallback('Atlas loading timed out'); }, 5000);
    image.src = skinUrl;
  }
  function paint(surface: Surface): void {
    const { element, title, divider } = surface;
    if (!element.getClientRects().length || !title.getClientRects().length) return;
    if (!painter) { ensureImage(); return; }
    const bounds = element.getBoundingClientRect(), label = title.getBoundingClientRect();
    const scale = Number.parseInt(getComputedStyle(element).getPropertyValue('--skin-scale'), 10) === 2 ? 2 : 1;
    const width = Math.floor(bounds.width / scale), height = Math.floor(bounds.height / scale);
    const left = Math.floor((bounds.width - width * scale) / 2), top = Math.floor((bounds.height - height * scale) / 2);
    const labelStyle = getComputedStyle(title);
    const lineHeight = Number.parseFloat(labelStyle.lineHeight) || Number.parseFloat(labelStyle.fontSize) * 1.4;
    const text: TitleBox = { left: (label.left - bounds.left - left) / scale, right: (label.right - bounds.left - left) / scale,
      centerY: (label.top + label.height / 2 - bounds.top - top) / scale, height: label.height / scale, lineHeight: lineHeight / scale };
    const key = JSON.stringify([width, height, scale, text, title.textContent]);
    if (key === surface.key) return;
    try {
      const result = divider ? painter.divider(width, text) : painter.frame(width, height, text);
      const y = divider ? (result.titleMode === 'gap' ? Math.max(0, Math.round(text.centerY - 8) * scale) : Math.max(0, height - 16) * scale) : top;
      element.style.backgroundImage = `url("${result.url}")`;
      element.style.backgroundSize = `${width * scale}px ${divider ? 16 * scale : height * scale}px`;
      element.style.backgroundPosition = `${left}px ${y}px`;
      element.dataset.skinState = 'ready'; element.dataset.skinTitleMode = result.titleMode;
      element.dataset.skinPaints = String(++surface.paints);
      surface.key = key;
    } catch (cause) { fallback(cause instanceof Error ? cause.message : String(cause)); }
  }
  function flush(): void {
    pending = null;
    if (disposed || failed || document.hidden) return;
    const batch = [...dirty]; dirty.clear();
    for (const surface of batch) { if (!failed) paint(surface); }
  }
  function invalidate(): void {
    if (disposed || failed) return;
    for (const surface of surfaces) dirty.add(surface);
    if (pending === null && !document.hidden) pending = requestAnimationFrame(flush);
  }
  const resize = new ResizeObserver(invalidate);
  const attributes = new MutationObserver(invalidate);
  const titles = new MutationObserver(invalidate);
  for (const { element, title } of surfaces) {
    resize.observe(element); resize.observe(title);
    // Never observe our own style/data attributes, or the changing live Debug table.
    attributes.observe(element, { attributes: true, attributeFilter: ['hidden', 'open'] });
    titles.observe(title, { childList: true, characterData: true, subtree: true });
  }
  window.addEventListener('resize', invalidate, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', invalidate, { signal: lifetime.signal });
  document.fonts.addEventListener('loadingdone', invalidate, { signal: lifetime.signal });
  void document.fonts.ready.then(() => { if (!disposed) invalidate(); });
  invalidate();
  return { dispose(): void {
    if (disposed) return;
    disposed = true; lifetime.abort(); resize.disconnect(); attributes.disconnect(); titles.disconnect(); dirty.clear();
    if (pending !== null) cancelAnimationFrame(pending);
    if (timeout !== null) clearTimeout(timeout);
    pending = null; timeout = null;
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); }
    image = null; painter?.dispose(); painter = null;
    for (const { element } of surfaces) {
      element.style.removeProperty('background-image'); element.style.removeProperty('background-size'); element.style.removeProperty('background-position');
      delete element.dataset.skinState; delete element.dataset.skinTitleMode; delete element.dataset.skinPaints;
    }
  } };
}
