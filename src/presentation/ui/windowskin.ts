import skinUrl from '../../../assets/source/ui/base/Window.png?no-inline';
import manifest from '../../../assets/source/ui/base/Window.manifest.json';
import { SkinPainter } from '../skin/paint';
import type { TitleBox } from '../skin/layout';

interface Surface { element: HTMLElement; title: HTMLElement; divider: boolean; key: string; paints: number }
/** A skin to mount: its atlas image URL and its manifest (version 1 or 2). */
export interface WindowSkinSource { atlasUrl: string; manifest: unknown }
/** Ariel's canonical skin. */
export const BASE_SKIN: WindowSkinSource = { atlasUrl: skinUrl, manifest };

/**
 * Fitting published on each skinned element, in CSS pixels including --skin-scale (decision 0011 W3.3). Window CSS
 * reads these for padding and title width; each has a fallback in the CSS equal to Ariel's skin, used while loading
 * and when the skin falls back to plain windows.
 */
const FIT_PROPERTIES = ['--skin-inset-left', '--skin-inset-right', '--skin-inset-bottom', '--skin-content-top', '--skin-title-max', '--skin-title-clearance'] as const;

/** Decoration only. One lazy image, one scratch bitmap, one scheduled invalidation.
 * No listeners for gameplay inputs, no recurring frame loop, no per-tile DOM nodes.
 */
export function mountWindowskin(root: ParentNode = document, skin: WindowSkinSource = BASE_SKIN): { dispose(): void } {
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
      for (const property of FIT_PROPERTIES) element.style.removeProperty(property);
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
        painter = new SkinPainter(image, skin.manifest); // Reads and validates the manifest; checks the atlas size it declares.
        report('Base skin: Ariel’s edited Midnight Silver. Source preserved; connector audit in docs/WINDOW-SKIN.md.');
        invalidate();
      } catch (cause) { fallback(cause instanceof Error ? cause.message : String(cause)); }
    };
    image.onerror = () => { if (!disposed) fallback('The atlas could not be loaded'); };
    timeout = setTimeout(() => { if (!disposed) fallback('Atlas loading timed out'); }, 5000);
    image.src = skin.atlasUrl;
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
      // A titled divider centres its band on the title text; otherwise it sits at the bottom of its element.
      const band = painter.geometry.divider.height, half = Math.floor(band / 2);
      const y = divider ? (result.titleMode === 'gap' ? Math.max(0, Math.round(text.centerY - half) * scale) : Math.max(0, height - band) * scale) : top;
      element.style.backgroundImage = `url("${result.url}")`;
      element.style.backgroundSize = `${width * scale}px ${divider ? band * scale : height * scale}px`;
      element.style.backgroundPosition = `${left}px ${y}px`;
      const px = (value: number) => `${Math.round(value * 100) / 100}px`;
      element.style.setProperty('--skin-title-max', px(result.titleSlot * scale));
      if (!divider) {
        // Measured from the element's edges in whole skin pixels. The bitmap covers the element except for less than one
        // scale step at the right and bottom (and its rounding offset at the left and top); a skin's derived insets
        // include a margin of at least that, and Ariel's declared insets sit under each window's own extra spacing.
        const insets = painter.insets;
        element.style.setProperty('--skin-inset-left', px(insets.left * scale));
        element.style.setProperty('--skin-inset-right', px(insets.right * scale));
        element.style.setProperty('--skin-inset-bottom', px(insets.bottom * scale));
        const contentTop = top + (result.top + insets.top) * scale;
        element.style.setProperty('--skin-content-top', px(contentTop));
        // With the title in the frame's top edge, content below it must still start at the content top. The title's
        // own position never depends on this, so the extra space below the heading is exact in one step.
        const heading = Array.from(element.children).find(child => child.contains(title));
        const blocks = Array.from(element.children).filter(child => child !== heading && child.getClientRects().length > 0
          && !['absolute', 'fixed'].includes(getComputedStyle(child).position));
        const current = Number.parseFloat(element.style.getPropertyValue('--skin-title-clearance')) || 0;
        if (result.titleMode === 'gap' && blocks.length) {
          const natural = Math.min(...blocks.map(block => block.getBoundingClientRect().top)) - bounds.top - current;
          const needed = Math.max(0, Math.ceil(contentTop - natural));
          if (needed !== current) element.style.setProperty('--skin-title-clearance', px(needed));
        } else if (current) element.style.removeProperty('--skin-title-clearance');
      }
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
      for (const property of FIT_PROPERTIES) element.style.removeProperty(property);
      delete element.dataset.skinState; delete element.dataset.skinTitleMode; delete element.dataset.skinPaints;
    }
  } };
}
