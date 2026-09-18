/** Pure source-UI-pixel geometry. No game state, DOM, timers, or rendering. */
export const TILE = 16;
export const MAX_SIDE = 4096;
export const MAX_PIXELS = 2_000_000;

export interface SpanPart { offset: number; length: number; kind: 'repeat' | 'plain'; mirror: boolean }

export function spanParts(length: number): SpanPart[] {
  if (!Number.isInteger(length) || length < 0 || length > MAX_SIDE) throw new Error('Invalid skin span');
  const q = Math.floor(length / TILE), r = length % TILE;
  const parts: SpanPart[] = [];
  if (q === 0) return r ? [{ offset: 0, length: r, kind: 'plain', mirror: false }] : [];
  const normal = r ? q - 1 : q;
  for (let n = 0; n < normal; n += 1) parts.push({ offset: n * TILE, length: TILE, kind: 'repeat', mirror: false });
  if (r) {
    parts.push({ offset: normal * TILE, length: r, kind: 'plain', mirror: false });
    parts.push({ offset: length - TILE, length: TILE, kind: 'repeat', mirror: true });
  }
  return parts;
}

export interface TitleBox { left: number; right: number; centerY: number; height: number; lineHeight: number }
export interface FrameGeometry {
  width: number; height: number; top: number;
  title: { openX: number; closeX: number } | null;
  sideMid: number | null; bottomMid: number | null;
}

export function frameGeometry(width: number, height: number, title?: TitleBox): FrameGeometry {
  if (![width, height].every(n => Number.isInteger(n) && n >= 32 && n <= MAX_SIDE) || width * height > MAX_PIXELS) {
    throw new Error('Skin surface is outside the bounded bitmap budget');
  }
  let top = 0, gap: FrameGeometry['title'] = null;
  if (title && Object.values(title).every(Number.isFinite)) {
    const openX = Math.floor(title.left) - 4 - TILE, closeX = Math.ceil(title.right) + 4;
    const proposedTop = Math.max(0, Math.round(title.centerY) - 8);
    if (title.height <= title.lineHeight * 1.2 && title.right > title.left &&
        openX >= TILE && closeX + TILE <= width - TILE && proposedTop <= height - 48) {
      top = proposedTop; gap = { openX, closeX };
    }
  }
  return { width, height, top, title: gap,
    sideMid: height - top >= 96 ? top + Math.floor((height - top - TILE) / 2) : null,
    bottomMid: width >= 96 ? Math.floor((width - TILE) / 2) : null };
}
