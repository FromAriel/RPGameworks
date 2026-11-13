/**
 * Pure source-UI-pixel geometry. No game state, DOM, timers, or rendering.
 * Every size comes from the skin (decision 0011 W3.2): corner pieces, band per side, rail periods, title pieces,
 * medallions and divider pieces. There is no fixed tile size.
 */
import type { WindowSkinManifestV2 } from '../../content/generated/windowskin';
import { tileRects } from './skin-manifest.mjs';

export const MAX_SIDE = 4096;
export const MAX_PIXELS = 2_000_000;

export interface Rect { x: number; y: number; w: number; h: number }
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Spacing = 'mirrored-end' | 'even';
export type GapFill = { tile: string; railEdge?: undefined } | { railEdge: 'start' | 'end'; tile?: undefined };
export interface RailRule { spacing: Spacing; gapFill: GapFill }

/** A validated skin's geometry, resolved once: every rectangle the compositor draws, by role. */
export interface SkinGeometry {
  band: Record<Side, number>;
  rects: ReadonlyMap<string, Rect>;
  corner: { tl: Rect; tr: Rect; bl: Rect; br: Rect };
  title: { open: Rect; fill: Rect; close: Rect; band: number; textCenter: number; textGap: number };
  rails: Record<Side, RailRule>;
  mids: Partial<Record<Side, { rect: Rect; minEdge: number }>>;
  divider: { height: number; capLeft: Rect; capRight: Rect; open: Rect; close: Rect; repeat: Rect; plain: Rect };
  fill: Rect;
  /** Without a value, the fill piece repeats; otherwise it is stretched across the window along this axis. */
  fillStretch: 'vertical' | 'horizontal' | null;
  /** The shortest frame the corners allow: the taller of the left and right corner pairs. */
  minHeight: number;
  minWidth: number;
}

/** Resolve a skin that passed readSkinManifest into the geometry the compositor uses. */
export function skinGeometry(skin: WindowSkinManifestV2): SkinGeometry {
  const rects = tileRects(skin);
  const r = (id: string): Rect => {
    const rect = rects.get(id);
    if (!rect) throw new Error(`Unknown windowskin tile: ${id}`);
    return rect;
  };
  const g = skin.geometry;
  const corner = { tl: r('corner.tl'), tr: r('corner.tr'), bl: r('corner.bl'), br: r('corner.br') };
  const mids: SkinGeometry['mids'] = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const mid = g.midpoints?.[side];
    if (mid) mids[side] = { rect: r(`mid.${side}`), minEdge: mid.minEdge };
  }
  const rail = (side: Side): RailRule => {
    const rule = g.rails[side];
    const gapFill: GapFill = rule.gapFill.railEdge ? { railEdge: rule.gapFill.railEdge } : { tile: rule.gapFill.tile as string };
    return { spacing: rule.spacing, gapFill };
  };
  return {
    band: { ...g.band }, rects, corner,
    title: { open: r('title.open'), fill: r('title.fill'), close: r('title.close'), band: r('title.open').h, textCenter: g.title.textCenter, textGap: g.title.textGap },
    rails: { top: rail('top'), right: rail('right'), bottom: rail('bottom'), left: rail('left') },
    mids,
    divider: { height: r('divider.h.repeat').h, capLeft: r('divider.cap.left'), capRight: r('divider.cap.right'), open: r('divider.label.open'),
      close: r('divider.label.close'), repeat: r('divider.h.repeat'), plain: r('divider.h.plain') },
    fill: r('fill.plain'),
    fillStretch: g.fill?.stretch ?? null,
    minHeight: Math.max(corner.tl.h + corner.bl.h, corner.tr.h + corner.br.h),
    minWidth: Math.max(corner.tl.w + corner.tr.w, corner.bl.w + corner.br.w),
  };
}

export interface SpanPart { offset: number; length: number; kind: 'repeat' | 'plain'; mirror: boolean }

/**
 * Split a rail of `length` pixels into whole pattern tiles of `period` pixels and plain gaps. No tile is ever cut.
 * - mirrored-end (W1): q-1 normal tiles, the r leftover pixels as one plain gap, then one complete mirrored tile;
 *   an exact multiple is q normal tiles; a rail shorter than one tile is all plain.
 * - even: q whole tiles with the leftover split into q+1 nearly equal plain gaps (before, between and after).
 */
export function spanParts(length: number, period: number, spacing: Spacing = 'mirrored-end'): SpanPart[] {
  if (!Number.isInteger(length) || length < 0 || length > MAX_SIDE) throw new Error('Invalid skin span');
  if (!Number.isInteger(period) || period < 1 || period > MAX_SIDE) throw new Error('Invalid skin period');
  const q = Math.floor(length / period), r = length % period;
  const parts: SpanPart[] = [];
  if (q === 0) return r ? [{ offset: 0, length: r, kind: 'plain', mirror: false }] : [];
  if (spacing === 'even') {
    let offset = 0;
    for (let n = 0; n <= q; n += 1) {
      const gap = Math.floor(((n + 1) * r) / (q + 1)) - Math.floor((n * r) / (q + 1));
      if (gap) { parts.push({ offset, length: gap, kind: 'plain', mirror: false }); offset += gap; }
      if (n < q) { parts.push({ offset, length: period, kind: 'repeat', mirror: false }); offset += period; }
    }
    return parts;
  }
  const normal = r ? q - 1 : q;
  for (let n = 0; n < normal; n += 1) parts.push({ offset: n * period, length: period, kind: 'repeat', mirror: false });
  if (r) {
    parts.push({ offset: normal * period, length: r, kind: 'plain', mirror: false });
    parts.push({ offset: length - period, length: period, kind: 'repeat', mirror: true });
  }
  return parts;
}

export interface TitleBox { left: number; right: number; centerY: number; height: number; lineHeight: number }
export interface FrameGeometry {
  width: number; height: number;
  /** Where the frame's top edge sits: lowered so the title band is centred on the live title text. */
  top: number;
  /** The title gap: title.open's left edge and title.close's left edge, or null for the header fallback. */
  title: { openX: number; closeX: number } | null;
  /** Medallion positions along each edge (x for top and bottom, y for left and right), or null when absent. */
  mid: Record<Side, number | null>;
}

export function frameGeometry(geo: SkinGeometry, width: number, height: number, title?: TitleBox): FrameGeometry {
  if (![width, height].every(n => Number.isInteger(n) && n <= MAX_SIDE) || width < geo.minWidth || height < geo.minHeight
      || width * height > MAX_PIXELS) {
    throw new Error('Skin surface is outside the bounded bitmap budget');
  }
  const { corner, title: t } = geo;
  let top = 0, gap: FrameGeometry['title'] = null;
  if (title && Object.values(title).every(Number.isFinite)) {
    const openX = Math.floor(title.left) - t.textGap - t.open.w, closeX = Math.ceil(title.right) + t.textGap;
    const proposedTop = Math.max(0, Math.round(title.centerY) - t.textCenter);
    if (title.height <= title.lineHeight * 1.2 && title.right > title.left &&
        openX >= corner.tl.w && closeX + t.close.w <= width - corner.tr.w && proposedTop <= height - geo.minHeight - t.band) {
      top = proposedTop; gap = { openX, closeX };
    }
  }
  const along = (side: Side): number | null => {
    const mid = geo.mids[side];
    if (!mid) return null;
    if (side === 'top') return gap === null && width >= mid.minEdge ? Math.floor((width - mid.rect.w) / 2) : null;
    if (side === 'bottom') return width >= mid.minEdge ? Math.floor((width - mid.rect.w) / 2) : null;
    return height - top >= mid.minEdge ? top + Math.floor((height - top - mid.rect.h) / 2) : null;
  };
  return { width, height, top, title: gap, mid: { top: along('top'), right: along('right'), bottom: along('bottom'), left: along('left') } };
}
