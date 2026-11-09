/**
 * Bake geometry, ported from Pixel Frame `bake.js`: render a frame once per state at a canonical
 * box size (corners plus a minimal middle tile). Swept edges are uniform along their length, so
 * stretching the middle tile rebuilds the live frame pixel-for-pixel at any size.
 *
 * The demonstrator's CSS and preview-page writers are not ported here; the game builds its own
 * page and canvas consumers from the slice numbers (decision 0010, W2.2 and W2.3).
 */
import { MAT } from './bitmap.ts';
import { getArt, ORNAMENT_SIZES } from './art.ts';
import type { OrnamentSize } from './art.ts';
import { composeFrame } from './frame.ts';
import type { ComposedFrame } from './frame.ts';
import type { NormalMode } from './normals.ts';
import { createImage, shade as shadeFrame } from './shade.ts';
import type { FrameState, RgbaImage, ShadeOptions } from './shade.ts';
import { applyFlair, resolveStyle } from './styles.ts';
import type { Flair, FrameStyle, StyleId } from './styles.ts';

export type StateName = 'raised' | 'hover' | 'pressed' | 'focus' | 'active' | 'disabled';

/** Name, forced state, geometry press amount. */
export const STATES: readonly (readonly [StateName, FrameState, number])[] = [
  ['raised', {}, 0],
  ['hover', { hover: true }, 0],
  ['pressed', { pressed: true }, 1],
  ['focus', { focus: true }, 0],
  ['active', { active: true }, 1],
  ['disabled', { disabled: true }, 0],
];

export interface BakeSettings extends Omit<ShadeOptions, 'state' | 'neutral' | 'flat' | 'streakRows' | 'pulse'> {
  readonly flair?: Flair;
  readonly ornament?: OrnamentSize;
  readonly normalMode?: NormalMode;
  readonly strength?: number;
  readonly radius?: number;
  /** Bake the four gem pulse frames for focus (default on). */
  readonly animate?: boolean;
}

/** The style as baked: medallions and centre art cannot be expressed as a 9-slice, so they are dropped. */
export function bakeStyle(ref: StyleId | FrameStyle, settings: BakeSettings): FrameStyle {
  const base = applyFlair(resolveStyle(ref), settings.flair ?? 'full');
  return { ...base, medallion: null, center: null };
}

export interface BakeLayout {
  readonly style: FrameStyle;
  /** Profile depth: the border width. */
  readonly P: number;
  readonly reach: number;
  /** Slice depth inside the box. */
  readonly inner: number;
  readonly tile: number;
  /** Canonical box size. */
  readonly box: number;
  readonly repeat: 'stretch' | 'repeat';
}

/** Slice geometry for a style: keep the stretched middle clear of anything the corners influence. */
export function layout(ref: StyleId | FrameStyle, settings: BakeSettings): BakeLayout {
  const style = bakeStyle(ref, settings);
  const size = settings.ornament ?? 'medium';
  const P = style.profile.length;
  const art = style.corner ? getArt(style.corner, size) : null;
  const reach = art ? Math.max(art.w - art.ox, art.h - art.oy) : 0;
  const pad = settings.normalMode === 'distance' || settings.normalMode === 'blend' ? (settings.radius || 5) + 1 : 3;
  const inner = Math.max(reach, P) + pad;
  const motif = style.motif ? Math.round(style.motif.period * ORNAMENT_SIZES[size]) : 0;
  const tile = motif || 1;
  return { style, P, reach, inner, tile, box: 2 * inner + tile, repeat: motif ? 'repeat' : 'stretch' };
}

export function geometry(ref: StyleId | FrameStyle, settings: BakeSettings, press: number, W?: number, H?: number): { L: BakeLayout; frame: ComposedFrame } {
  const L = layout(ref, settings);
  const frame = composeFrame(L.style, W || L.box, H || L.box, {
    flair: 'full', // flair already applied in bakeStyle
    ...(settings.ornament !== undefined ? { ornament: settings.ornament } : {}),
    ...(settings.normalMode !== undefined ? { normalMode: settings.normalMode } : {}),
    ...(settings.strength !== undefined ? { strength: settings.strength } : {}),
    ...(settings.radius !== undefined ? { radius: settings.radius } : {}),
    pressAmount: press,
  });
  return { L, frame };
}

export function shadeForBake(frame: ComposedFrame, settings: BakeSettings, state: FrameState, pulse?: number): RgbaImage {
  return shadeFrame(frame, {
    ...settings,
    state,
    neutral: !!frame.style.neutral,
    flat: !!frame.style.flat,
    streakRows: true,
    ...(pulse !== undefined ? { pulse } : {}),
  });
}

/** Optionally crop the overhang margin (scrollbars cannot draw outside their box). */
export function crop(img: RgbaImage, by: number): RgbaImage {
  if (!by) return img;
  const out = createImage(img.width - 2 * by, img.height - 2 * by);
  for (let y = 0; y < out.height; y++) {
    const from = ((y + by) * img.width + by) * 4;
    out.data.set(img.data.subarray(from, from + out.width * 4), y * out.width * 4);
  }
  return out;
}

export interface BakedFrame {
  readonly name: string;
  readonly tier: FrameStyle['tier'];
  /** Border width (profile depth), in logical pixels. */
  readonly P: number;
  /** Overhang drawn outside the box (CSS border-image-outset), in logical pixels. */
  readonly M: number;
  /** Slice size measured from the image edge. */
  readonly S: number;
  /** Middle slice length. */
  readonly tile: number;
  readonly repeat: 'stretch' | 'repeat';
  /** Image width and height (square). */
  readonly size: number;
  readonly inset: boolean;
  readonly neutral: boolean;
  readonly droppedMedallion: boolean;
  readonly images: Readonly<Record<StateName, RgbaImage>>;
  /** Four focus frames when the style has gems, else null. */
  readonly pulse: readonly RgbaImage[] | null;
}

/** Render every state of one style. */
export function renderBaked(ref: StyleId | FrameStyle, settings: BakeSettings, opts: { readonly crop?: boolean } = {}): BakedFrame {
  const images: Partial<Record<StateName, RgbaImage>> = {};
  let base: { L: BakeLayout; frame: ComposedFrame } | null = null;
  for (const [name, state, press] of STATES) {
    const g = geometry(ref, settings, press);
    base ??= g;
    images[name] = crop(shadeForBake(g.frame, settings, state), opts.crop ? g.frame.M : 0);
  }
  const { L, frame } = base!;
  const hasGem = frame.mat.includes(MAT.GEM);
  const pulse = hasGem && settings.animate !== false
    ? [0, 1, 2, 3].map(k => crop(shadeForBake(frame, settings, { focus: true }, k), opts.crop ? frame.M : 0))
    : null;
  const M = opts.crop ? 0 : frame.M;
  return {
    name: frame.baseStyle.name,
    tier: frame.style.tier,
    P: L.P,
    M,
    S: M + L.inner,
    tile: L.box - 2 * L.inner,
    repeat: L.repeat,
    size: frame.w - 2 * (frame.M - M),
    inset: !!frame.style.inset,
    neutral: !!frame.style.neutral,
    droppedMedallion: !!resolveStyle(ref).medallion,
    images: images as Record<StateName, RgbaImage>,
    pulse,
  };
}

/** 9-slice reconstruction of a baked image at another size, as CSS border-image and Phaser NineSlice draw it. */
export function reconstruct(img: RgbaImage, S: number, tile: number, w: number, h: number, repeat: 'stretch' | 'repeat'): RgbaImage {
  const out = createImage(w, h);
  const map = (v: number, len: number, srcLen: number) => {
    if (v < S) return v;
    if (v >= len - S) return v - (len - srcLen);
    if (repeat === 'stretch') return S;
    const mid = len - 2 * S;
    const offset = Math.floor((mid - tile) / 2) % tile;
    return S + ((((v - S - offset) % tile) + tile) % tile);
  };
  for (let y = 0; y < h; y++) {
    const sy = map(y, h, img.height);
    for (let x = 0; x < w; x++) {
      const sx = map(x, w, img.width);
      const s = (sy * img.width + sx) * 4, d = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) out.data[d + k] = img.data[s + k]!;
    }
  }
  return out;
}
