/**
 * Frame composition, ported from Pixel Frame `frame.js`: sweep the profile around the box (a mitred
 * ring), then stamp edge motifs, the centre medallion and the four corners (one art piece, mirrored).
 */
import { CLEAR, COVERED, Frame, MAT, SRC, flipArt } from './bitmap.ts';
import type { Art } from './bitmap.ts';
import { ORNAMENT_SIZES, getArt } from './art.ts';
import type { OrnamentSize } from './art.ts';
import { computeNormals } from './normals.ts';
import type { NormalMode } from './normals.ts';
import { applyFlair, resolveStyle } from './styles.ts';
import type { Flair, FrameStyle, StyleId } from './styles.ts';
import type { Profile } from './profile.ts';

export interface CornerPlacement {
  readonly art: Art;
  readonly tl: readonly [number, number];
  readonly tr: readonly [number, number];
  readonly bl: readonly [number, number];
  readonly br: readonly [number, number];
}

/** A frame plus where its box and ornaments landed. */
export interface ComposedFrame extends Frame {
  /** Overhang margin around the box, in pixels. */
  readonly M: number;
  readonly W: number;
  readonly H: number;
  readonly style: FrameStyle;
  readonly baseStyle: FrameStyle;
  readonly profile: Profile;
  readonly ornament: OrnamentSize;
  readonly motifs: { readonly x: readonly number[]; readonly y: readonly number[] };
  readonly medalX: number | null;
  readonly medalW: number;
  readonly corner: CornerPlacement | null;
}

export interface ComposeOptions {
  readonly flair?: Flair;
  readonly ornament?: OrnamentSize;
  readonly normalMode?: NormalMode;
  readonly strength?: number;
  readonly radius?: number;
  /** 0 raised, 0.5 flat mid-step, 1 sunk. */
  readonly pressAmount?: number;
  readonly pressed?: boolean;
}

export function stamp(frame: Frame, art: Art, x0: number, y0: number, src: number): void {
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const a = y * art.w + x;
      const c = art.cov[a];
      if (!c) continue;
      const i = frame.index(x0 + x, y0 + y);
      if (i < 0) continue;
      frame.tx[i] = 0;
      frame.ty[i] = 0;
      if (c === CLEAR) {
        frame.cov[i] = 0; frame.hgt[i] = 0; frame.mat[i] = 0; frame.src[i] = 0;
      } else {
        frame.cov[i] = COVERED;
        frame.hgt[i] = art.hgt[a]!;
        frame.mat[i] = art.mat[a]!;
        frame.src[i] = src;
      }
    }
  }
}

/** Evenly distribute motif centres between the corner pieces; never leaves a partial tile. */
export function placeAlong(len: number, reserve: number, period: number): number[] {
  const start = reserve + 1;
  const end = len - reserve - 1;
  const span = end - start;
  if (span < period) return [];
  const n = Math.floor(span / period);
  const step = span / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.round(start + step * (i + 0.5) - 0.5));
  return out;
}

const flipCache = new WeakMap<Art, { x: Art; y: Art; xy: Art }>();
function flipped(art: Art): { x: Art; y: Art; xy: Art } {
  let f = flipCache.get(art);
  if (!f) {
    f = { x: flipArt(art, true, false), y: flipArt(art, false, true), xy: flipArt(art, true, true) };
    flipCache.set(art, f);
  }
  return f;
}

/** Compose a frame for a W × H box (logical pixels). */
export function composeFrame(styleRef: StyleId | FrameStyle, W: number, H: number, opts: ComposeOptions = {}): ComposedFrame {
  const base = resolveStyle(styleRef);
  const style = applyFlair(base, opts.flair ?? 'full');
  const profile = style.profile;
  const p = profile.length;
  const mid = Math.floor(p / 2);
  const size = opts.ornament ?? 'medium';
  const corner = style.corner ? getArt(style.corner, size) : null;
  const medal = style.medallion ? getArt(style.medallion, size) : null;
  const motif = style.motif ? getArt(style.motif.art, size) : null;
  const period = style.motif ? Math.round(style.motif.period * ORNAMENT_SIZES[size]) : 0;

  let over = 0;
  if (corner) over = Math.max(over, corner.ox, corner.oy);
  if (medal) over = Math.max(over, (medal.h >> 1) - mid);
  if (motif) over = Math.max(over, (motif.h >> 1) - mid);
  const M = over + 3; // room for outline + shadow
  const frame = new Frame(W + 2 * M, H + 2 * M);

  // 1. Sweep: depth = distance to the nearest box side; equal depths form a mitre.
  const edgeMat = style.neutral ? MAT.NEUTRAL : style.edgeMat === 'accent' ? MAT.ACCENT : MAT.METAL;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (d >= p) continue;
      const i = (y + M) * frame.w + x + M;
      frame.cov[i] = COVERED;
      frame.hgt[i] = profile[d]!;
      frame.mat[i] = edgeMat;
      frame.src[i] = SRC.EDGE;
      if (d === y || d === H - 1 - y) frame.tx[i] = 1;
      else frame.ty[i] = 1;
    }
  }

  const cx = corner ? corner.w - corner.ox : 0;
  const cy = corner ? corner.h - corner.oy : 0;

  // 2. Motifs along the ridge line of every edge.
  let motifs: { x: number[]; y: number[] } = { x: [], y: [] };
  if (motif) {
    const xs = placeAlong(W, cx, period);
    const ys = placeAlong(H, cy, period);
    const hw = motif.w >> 1, hh = motif.h >> 1;
    for (const px of xs) {
      stamp(frame, motif, M + px - hw, M + mid - hh, SRC.MOTIF);
      stamp(frame, motif, M + px - hw, M + H - 1 - mid - hh, SRC.MOTIF);
    }
    for (const py of ys) {
      stamp(frame, motif, M + mid - hw, M + py - hh, SRC.MOTIF);
      stamp(frame, motif, M + W - 1 - mid - hw, M + py - hh, SRC.MOTIF);
    }
    motifs = { x: xs, y: ys };
  }

  // 3. Centre medallion on the top and bottom edges, only when it fits between the corners.
  let medalX: number | null = null;
  let medalW = 0;
  if (medal && W >= medal.w + 2 * cx + 2) {
    const x0 = M + Math.floor((W - medal.w) / 2);
    stamp(frame, medal, x0, M + mid - (medal.h >> 1), SRC.MEDALLION);
    stamp(frame, flipped(medal).y, x0, M + H - 1 - mid - (medal.h - 1 - (medal.h >> 1)), SRC.MEDALLION);
    medalX = x0 - M;
    medalW = medal.w;
  }

  // 4. Corners: one piece, mirrored into the other three.
  let placement: CornerPlacement | null = null;
  if (corner) {
    const f = flipped(corner);
    const right = M + W - (corner.w - corner.ox);
    const bottom = M + H - (corner.h - corner.oy);
    stamp(frame, corner, M - corner.ox, M - corner.oy, SRC.CORNER);
    stamp(frame, f.x, right, M - corner.oy, SRC.CORNER);
    stamp(frame, f.y, M - corner.ox, bottom, SRC.CORNER);
    stamp(frame, f.xy, right, bottom, SRC.CORNER);
    placement = { art: corner, tl: [M - corner.ox, M - corner.oy], tr: [right, M - corner.oy], bl: [M - corner.ox, bottom], br: [right, bottom] };
  }

  // 5. Centre art (the gem in a slider knob, the rivet on a scrollbar thumb).
  if (style.center) {
    const art = getArt(style.center, size);
    if (art) stamp(frame, art, M + Math.floor((W - art.w) / 2), M + Math.floor((H - art.h) / 2), SRC.CENTER);
  }

  computeNormals(frame, opts.normalMode ?? 'profile', {
    ...(opts.strength !== undefined ? { strength: opts.strength } : {}),
    radius: opts.radius || Math.max(2, p),
    inset: !!style.inset,
    press: opts.pressAmount ?? (opts.pressed ? 1 : 0),
    gemRadius: size === 'large' ? 5 : 4,
    flat: !!style.flat,
  });
  return Object.assign(frame, { M, W, H, style, baseStyle: base, profile, ornament: size, motifs, medalX, medalW, corner: placement });
}
