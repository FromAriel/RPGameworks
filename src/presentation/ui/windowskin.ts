import skinUrl from '../../../assets/source/ui/base/Window.png?no-inline';
import manifest from '../../../assets/source/ui/base/Window.manifest.json';
import { SkinPainter } from '../skin/paint';
import type { TitleBox } from '../skin/layout';

interface Surface { element: HTMLElement; title: HTMLElement; divider: boolean; key: string; paints: number }
/** A skin to mount: its atlas image URL and its manifest (version 1 or 2), given inline or as a URL to fetch. */
export interface WindowSkinSource { atlasUrl: string; manifest?: unknown; manifestUrl?: string }
/** Ariel's canonical skin: the default for games without a UI theme, the test gallery, and early startup. */
export const BASE_SKIN: WindowSkinSource = { atlasUrl: skinUrl, manifest };
const BASE_SKIN_ID = 'base';

/**
 * Which skin each window uses (decision 0011 W3.4). A window's skin is, in order: the skin it asks for itself
 * (`data-skin-id`, set for example by the dialogue window for a message that names a skin), its surface's default
 * (`data-skin-surface`), or the fallback skin.
 */
export interface SkinChoice { readonly skins: ReadonlyMap<string, WindowSkinSource>; readonly surfaces: Readonly<Record<string, string>>; readonly fallback: string }
export interface WindowskinHandle {
  dispose(): void;
  useTheme(choice: SkinChoice): void;
  /**
   * The loaded painter for a surface's skin (decision 0011 W3.5: the battle stage composes its windows with it), or null
   * if that skin cannot load. Loads the skin once if no window has needed it yet; shared with the page windows.
   */
  painterFor(surface: string): Promise<SkinPainter | null>;
}

/**
 * Fitting published on each skinned element, in CSS pixels including --skin-scale (decision 0011 W3.3). Window CSS
 * reads these for padding and title width; each has a fallback in the CSS equal to Ariel's skin, used while loading
 * and when the skin falls back to plain windows.
 */
const FIT_PROPERTIES = ['--skin-inset-left', '--skin-inset-right', '--skin-inset-bottom', '--skin-content-top', '--skin-title-max', '--skin-title-clearance'] as const;

interface SkinRecord {
  readonly id: string; readonly source: WindowSkinSource | undefined;
  state: 'idle' | 'loading' | 'ready' | 'failed';
  image: HTMLImageElement | null; painter: SkinPainter | null; timeout: ReturnType<typeof setTimeout> | null;
  fetch: AbortController | null; name: string;
  waiters: ((painter: SkinPainter | null) => void)[];
}

/** Decoration only. Lazy images (one per skin in use), one scratch bitmap per skin, one scheduled invalidation.
 * No listeners for gameplay inputs, no recurring frame loop, no per-tile DOM nodes.
 */
export function mountWindowskin(root: ParentNode = document, skin: WindowSkinSource | SkinChoice = BASE_SKIN): WindowskinHandle {
  const surfaces: Surface[] = Array.from(root.querySelectorAll<HTMLElement>('[data-window-skin]')).map(element => {
    const title = element.querySelector<HTMLElement>('[data-skin-title]');
    if (!title) throw new Error('Windowskin surface has no semantic title');
    return { element, title, divider: element.dataset.windowSkin === 'divider', key: '', paints: 0 };
  });
  const notice = root.querySelector<HTMLElement>('#skin-status');
  const lifetime = new AbortController();
  const dirty = new Set(surfaces);
  const records = new Map<string, SkinRecord>();
  let choice: SkinChoice = 'atlasUrl' in skin ? { skins: new Map([[BASE_SKIN_ID, skin]]), surfaces: {}, fallback: BASE_SKIN_ID } : skin;
  let pending: number | null = null;
  let disposed = false;

  function report(text: string): void { if (notice) notice.textContent = text; }
  function record(id: string): SkinRecord {
    let entry = records.get(id);
    if (!entry) {
      entry = { id, source: choice.skins.get(id), state: 'idle', image: null, painter: null, timeout: null, fetch: null, name: id, waiters: [] };
      records.set(id, entry);
    }
    return entry;
  }
  function release(entry: SkinRecord): void {
    if (entry.timeout !== null) clearTimeout(entry.timeout);
    entry.timeout = null; entry.fetch?.abort(); entry.fetch = null;
    if (entry.image) { entry.image.onload = null; entry.image.onerror = null; }
  }
  function settle(entry: SkinRecord): void {
    const waiters = entry.waiters.splice(0);
    for (const resolve of waiters) resolve(entry.state === 'ready' ? entry.painter : null);
  }
  function fallback(entry: SkinRecord, reason: string): void {
    if (entry.state === 'failed') return;
    entry.state = 'failed'; release(entry);
    entry.painter?.dispose(); entry.painter = null;
    settle(entry);
    report(`Window skin unavailable: ${reason}. Plain accessible windows remain usable.`);
    console.warn('[RPGameworks] Window skin fallback:', entry.id, reason);
    invalidate();
  }
  function plain(surface: Surface): void {
    const { element } = surface;
    element.dataset.skinState = 'fallback';
    element.style.removeProperty('background-image');
    for (const property of FIT_PROPERTIES) element.style.removeProperty(property);
    delete element.dataset.skinActive;
    surface.key = '';
  }
  function load(entry: SkinRecord): void {
    if (entry.state !== 'idle' || disposed) return;
    const source = entry.source;
    if (!source) { fallback(entry, `Unknown window skin ${entry.id}`); return; }
    entry.state = 'loading'; report('Loading the window skin…');
    let manifestData: unknown = source.manifest, image: HTMLImageElement | null = null;
    const finish = (): void => {
      if (entry.state !== 'loading' || manifestData === undefined || !image?.complete || !image.naturalWidth) return;
      release(entry);
      try {
        entry.painter = new SkinPainter(image, manifestData); // Reads and validates the manifest; checks the atlas size.
        entry.state = 'ready';
        const theme = (manifestData as { theme?: unknown }).theme;
        entry.name = typeof theme === 'string' ? theme : entry.id;
        settle(entry);
        report(`Window skin: ${[...records.values()].filter(r => r.state === 'ready').map(r => r.name).join(', ')}.`);
        invalidate();
      } catch (cause) { fallback(entry, cause instanceof Error ? cause.message : String(cause)); }
    };
    entry.timeout = setTimeout(() => { if (!disposed) fallback(entry, 'Atlas loading timed out'); }, 5000);
    if (manifestData === undefined) {
      if (!source.manifestUrl) { fallback(entry, `Window skin ${entry.id} has no manifest`); return; }
      const controller = new AbortController(); entry.fetch = controller;
      fetch(source.manifestUrl, { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<unknown>; })
        .then(json => { manifestData = json; finish(); })
        .catch(() => { if (!disposed && !controller.signal.aborted) fallback(entry, 'The skin manifest could not be loaded'); });
    }
    image = new Image(); entry.image = image;
    image.onload = () => { if (!disposed) finish(); };
    image.onerror = () => { if (!disposed) fallback(entry, 'The atlas could not be loaded'); };
    image.src = source.atlasUrl;
  }
  function skinFor(element: HTMLElement): string {
    return element.dataset.skinId ?? choice.surfaces[element.dataset.skinSurface ?? ''] ?? choice.fallback;
  }
  function paint(surface: Surface): void {
    const { element, title, divider } = surface;
    if (!element.getClientRects().length || !title.getClientRects().length) return;
    const entry = record(skinFor(element));
    if (entry.state === 'failed') { if (element.dataset.skinState !== 'fallback') plain(surface); return; }
    if (entry.state !== 'ready' || !entry.painter) { load(entry); return; }
    const painter = entry.painter;
    const bounds = element.getBoundingClientRect(), label = title.getBoundingClientRect();
    const scale = Number.parseInt(getComputedStyle(element).getPropertyValue('--skin-scale'), 10) === 2 ? 2 : 1;
    const width = Math.floor(bounds.width / scale), height = Math.floor(bounds.height / scale);
    const left = Math.floor((bounds.width - width * scale) / 2), top = Math.floor((bounds.height - height * scale) / 2);
    const labelStyle = getComputedStyle(title);
    const lineHeight = Number.parseFloat(labelStyle.lineHeight) || Number.parseFloat(labelStyle.fontSize) * 1.4;
    const text: TitleBox = { left: (label.left - bounds.left - left) / scale, right: (label.right - bounds.left - left) / scale,
      centerY: (label.top + label.height / 2 - bounds.top - top) / scale, height: label.height / scale, lineHeight: lineHeight / scale };
    const key = JSON.stringify([entry.id, width, height, scale, text, title.textContent]);
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
      element.dataset.skinState = 'ready'; element.dataset.skinTitleMode = result.titleMode; element.dataset.skinActive = entry.id;
      element.dataset.skinPaints = String(++surface.paints);
      surface.key = key;
    } catch (cause) { fallback(entry, cause instanceof Error ? cause.message : String(cause)); }
  }
  function flush(): void {
    pending = null;
    if (disposed || document.hidden) return;
    const batch = [...dirty]; dirty.clear();
    for (const surface of batch) paint(surface);
  }
  function invalidate(): void {
    if (disposed) return;
    for (const surface of surfaces) dirty.add(surface);
    if (pending === null && !document.hidden) pending = requestAnimationFrame(flush);
  }
  const resize = new ResizeObserver(invalidate);
  const attributes = new MutationObserver(invalidate);
  const titles = new MutationObserver(invalidate);
  for (const { element, title } of surfaces) {
    resize.observe(element); resize.observe(title);
    // Never observe our own style/data attributes, or the changing live Debug table. A window asking for another
    // skin (data-skin-id) repaints with it.
    attributes.observe(element, { attributes: true, attributeFilter: ['hidden', 'open', 'data-skin-id'] });
    titles.observe(title, { childList: true, characterData: true, subtree: true });
  }
  window.addEventListener('resize', invalidate, { signal: lifetime.signal });
  document.addEventListener('visibilitychange', invalidate, { signal: lifetime.signal });
  document.fonts.addEventListener('loadingdone', invalidate, { signal: lifetime.signal });
  void document.fonts.ready.then(() => { if (!disposed) invalidate(); });
  invalidate();
  return {
    painterFor(surface: string): Promise<SkinPainter | null> {
      if (disposed) return Promise.resolve(null);
      const entry = record(choice.surfaces[surface] ?? choice.fallback);
      if (entry.state === 'ready') return Promise.resolve(entry.painter);
      if (entry.state === 'failed') return Promise.resolve(null);
      return new Promise(resolve => { entry.waiters.push(resolve); load(entry); });
    },
    useTheme(next: SkinChoice): void {
      if (disposed) return;
      choice = next;
      // A skin already loaded under the same ID is kept; others load when a window first needs them. A skin that was
      // unknown before this theme (and so fell back) gets a fresh record.
      for (const [id, entry] of records) if (entry.state === 'idle' || (!entry.source && next.skins.has(id))) records.delete(id);
      invalidate();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true; lifetime.abort(); resize.disconnect(); attributes.disconnect(); titles.disconnect(); dirty.clear();
      if (pending !== null) cancelAnimationFrame(pending);
      pending = null;
      for (const entry of records.values()) {
        release(entry);
        for (const resolve of entry.waiters.splice(0)) resolve(null);
        if (entry.image) entry.image.removeAttribute('src');
        entry.image = null; entry.painter?.dispose(); entry.painter = null;
      }
      records.clear();
      for (const { element } of surfaces) {
        element.style.removeProperty('background-image'); element.style.removeProperty('background-size'); element.style.removeProperty('background-position');
        for (const property of FIT_PROPERTIES) element.style.removeProperty(property);
        delete element.dataset.skinState; delete element.dataset.skinTitleMode; delete element.dataset.skinPaints; delete element.dataset.skinActive;
      }
    },
  };
}
