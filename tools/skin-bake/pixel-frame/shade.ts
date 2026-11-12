/**
 * Shading, ported from Pixel Frame `light.js`: N.L plus specular on the ridge, quantised into
 * palette ramps (optionally Bayer-dithered), plus a pixel outline and hard drop shadow.
 *
 * Only the lit view is ported. The interactive cursor lamp, the glint animation and the inspection
 * views stay in pixelstudio (decision 0010): the game bakes frames and never lights at runtime.
 */
import { COVERED, MAT, SRC } from './bitmap.ts';
import type { ComposedFrame } from './frame.ts';
import { HIGH_CONTRAST, RAMPS, SPEC, ramp as resample, resolveTheme } from './palettes.ts';
import type { Ramp, Rgb, ThemeRef } from './palettes.ts';

/** Plain RGBA pixels, row-major, 4 bytes per pixel (the shape of ImageData without the DOM). */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export function createImage(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export interface FrameState {
  readonly hover?: boolean;
  readonly pressed?: boolean;
  readonly focus?: boolean;
  readonly active?: boolean;
  readonly disabled?: boolean;
}

export interface ShadeOptions {
  /** Light azimuth in degrees, screen space with y down: 225 = from the top left. */
  readonly az: number;
  /** Light elevation in degrees. */
  readonly el: number;
  readonly steps?: number;
  readonly dither?: boolean;
  readonly outline?: boolean;
  readonly shadow?: boolean;
  readonly theme?: ThemeRef;
  readonly state?: FrameState;
  readonly neutral?: boolean;
  readonly flat?: boolean;
  /** Anisotropic (brushed) metal on/off and its mix 0..1. */
  readonly brushed?: boolean;
  readonly brush?: number;
  /** Contact shadow strength 0..1. */
  readonly ao?: number;
  /** Gem pulse phase 0..3, for the focus animation frames. */
  readonly pulse?: number;
  /** Bake mode: textures stay constant along each edge so 9-slices stretch exactly. */
  readonly streakRows?: boolean;
  /** Gem light on nearby metal when focused or active, 0..1. */
  readonly glow?: number;
  /** Grime, worn edges and tarnish 0..1. */
  readonly wear?: number;
  readonly tarnish?: boolean;
  readonly contrast?: 'normal' | 'high';
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const SHADOW: readonly [number, number, number, number] = [0, 0, 0, 96];
const PULSE = [0, 1, 2, 1];
const GLOW_MOD = [0.7, 0.85, 1, 0.85];

/** Hash noise for brush streaks and wear: deterministic per coordinate pair. */
function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
}
function streakNoise(u: number, v: number): number {
  const u0 = Math.floor(u), f = u - u0;
  return hash(u0, v) * (1 - f) + hash(u0 + 1, v) * f;
}
const unit = (a: number, b: number) => (hash(a, b) + 1) / 2;

interface Wear { readonly grime: number; readonly deep: boolean; readonly edge: boolean; readonly tarnish: boolean }

export function shade(frame: ComposedFrame, o: ShadeOptions): RgbaImage {
  const { w, h } = frame;
  const img = createImage(w, h);
  const px = img.data;
  const st = o.state ?? {};
  const hc = o.contrast === 'high';
  const n = hc ? 3 : Math.max(2, o.steps || 5);
  const theme = resolveTheme(o.theme);
  const R = (r: Ramp) => resample(r, n);
  const neutralRamp = R(hc ? HIGH_CONTRAST.neutral : RAMPS.neutral);
  const ramps: (readonly Rgb[])[] = hc
    ? [neutralRamp, R(HIGH_CONTRAST.metal), R(HIGH_CONTRAST.accent), R(HIGH_CONTRAST.gem), R(HIGH_CONTRAST.metal), neutralRamp]
    : [neutralRamp, R(theme.metal), R(theme.accent), R(theme.gem), R(theme.metal), neutralRamp];
  if (o.neutral || st.disabled) ramps.fill(neutralRamp);
  const glowRamp = hc ? R(HIGH_CONTRAST.focus) : R(theme.gem);

  const az = (o.az * Math.PI) / 180, el = (o.el * Math.PI) / 180;
  const L = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)] as const;
  const hl = Math.hypot(L[0], L[1], L[2] + 1);
  const Hv = [L[0] / hl, L[1] / hl, (L[2] + 1) / hl] as const;
  const flatD = L[2];
  const specOn = !(o.neutral || o.flat);
  const aoK = o.ao ?? 0.35;
  const brush = o.brushed && !hc ? Math.max(0, Math.min(1, o.brush ?? 0.3)) : 0;
  const pulse = o.pulse ?? -1;
  const phase = pulse >= 0 ? PULSE[pulse & 3]! : -1;
  const bake = !!o.streakRows;
  const isMetal = (m: number) => m === MAT.METAL || m === MAT.ACCENT;
  // 50% checker for grime and glow; edge-relative in bake mode so 9-slices stay exact.
  const checker = (i: number, x: number, y: number) => {
    if (!bake) return (x + y) & 1;
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
    if (frame.src[i] === SRC.EDGE) return (frame.tx[i] !== 0 ? ey : ex) & 1;
    return (ex + ey) & 1;
  };

  const glowK = !hc && frame.hasGem && (st.focus || st.active) && !st.disabled && !o.neutral
    ? Math.max(0, o.glow ?? 0.6) * (phase < 0 ? 1 : GLOW_MOD[pulse & 3]!) : 0;
  const gemR = frame.gemR || 4;

  const wear = o.neutral || st.disabled || hc ? 0 : Math.max(0, Math.min(1, o.wear || 0));
  const patinaRamp: (readonly Rgb[] | null)[] = [null, theme.patina.metal ? R(theme.patina.metal) : null, theme.patina.accent ? R(theme.patina.accent) : null, null, null, null];
  const wearAt = (i: number, x: number, y: number): Wear | null => {
    const mat = frame.mat[i]!;
    if (!wear || !isMetal(mat)) return null;
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y);
    let a: number, b: number;
    if (frame.src[i] === SRC.EDGE) {
      const horiz = frame.tx[i] !== 0;
      a = bake ? 0 : Math.floor((horiz ? x : y) / 2);
      b = (horiz ? ey : ex) + (horiz ? 0 : 500);
    } else {
      a = ex + 2000;
      b = ey;
    }
    const ao = frame.ao[i]!;
    const grime = ao > 0.2 ? wear * 0.35 * ao : 0;
    const edge = frame.cvx[i]! > 0 && unit(a, b * 7 + 1) > 1 - wear * 0.9 * Math.min(1, frame.cvx[i]! * 1.5);
    const recess = ao > 0.12;
    const tarnish = o.tarnish !== false && !!patinaRamp[mat] && recess && unit(a + 31, b * 5 + 3) < wear * 0.75;
    return { grime, deep: ao > 0.45, edge, tarnish };
  };

  const put = (i: number, c: Rgb | readonly [number, number, number, number], a = 255) => {
    const p = i * 4;
    px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = a;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (frame.cov[i] !== COVERED) continue;
      const nx = frame.nx[i]!, ny = frame.ny[i]!, nz = frame.nz[i]!;
      const mat = frame.mat[i]!;
      const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let v = 0.5 + (d - flatD) * 0.95;
      const sp = specOn ? SPEC[mat]! : 0;
      const tx = frame.tx[i]!, ty = frame.ty[i]!;
      if (sp) {
        let spec = Math.pow(Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]), 28) * 0.5 * sp;
        if (frame.ridge[i]) spec += 0.08 * sp;
        if (brush > 0 && !frame.inset && (tx || ty) && isMetal(mat)) {
          const bx = bake ? Math.min(x, w - 1 - x) : x;
          const by = bake ? Math.min(y, h - 1 - y) : y;
          const u = x * tx + y * ty, row = Math.round(by * tx - bx * ty);
          const noise = streakNoise(bake ? 0 : u / 9, row + (Math.abs(ty) > Math.abs(tx) ? 1000 : 0));
          const nt = nx * tx + ny * ty;
          let px2 = nx - nt * tx, py2 = ny - nt * ty, pz2 = nz;
          const pl = Math.hypot(px2, py2, pz2) || 1;
          px2 /= pl; py2 /= pl; pz2 /= pl;
          const across = Math.pow(Math.max(0, px2 * Hv[0] + py2 * Hv[1] + pz2 * Hv[2]), 24);
          const th = tx * Hv[0] + ty * Hv[1];
          const along = Math.pow(Math.max(0, 1 - th * th), 4);
          let aniso = across * along * (0.7 + 0.6 * noise) * 0.6 * sp + 0.03 * noise;
          if (frame.ridge[i]) aniso += 0.08 * sp * along;
          spec += (aniso - spec) * brush;
        }
        v += spec;
      }
      v -= aoK * frame.ao[i]!;
      const wr = wearAt(i, x, y);
      if (wr) v -= wr.grime;
      if (st.hover) v += 0.08;
      v = Math.min(1, Math.max(0, v));
      let idx = o.dither && !hc ? Math.floor(v * (n - 1) + BAYER4[(y & 3) * 4 + (x & 3)]!) : Math.round(v * (n - 1));
      idx = Math.min(n - 1, Math.max(0, idx));
      let ramp = ramps[mat] ?? ramps[MAT.METAL]!;
      if (mat === MAT.DARK) idx = Math.max(0, idx - 2);
      if (wr) {
        if (wr.deep && checker(i, x, y)) idx = Math.max(0, idx - 1);
        if (wr.edge) idx = Math.min(n - 1, idx + 1);
        if (wr.tarnish) ramp = patinaRamp[mat] ?? ramp;
      }
      if (glowK && isMetal(mat) && frame.gemD[i]! <= gemR) {
        const gx = frame.gemDx[i]!, gy = frame.gemDy[i]!;
        const gl = Math.hypot(gx, gy, 0.6);
        const facing = Math.max(0.3, (nx * gx + ny * gy + nz * 0.6) / gl);
        const f = glowK * 1.5 * (1 - frame.gemD[i]! / (gemR + 1)) * facing;
        if (f >= 0.5) { ramp = glowRamp; idx = Math.min(n - 1, idx + 1); }
        else if (f >= 0.25 && checker(i, x, y)) ramp = glowRamp;
      }
      if (mat === MAT.GEM && (st.focus || st.active) && !st.disabled) idx = Math.min(n - 1, idx + (phase < 0 ? 2 : phase));
      if (st.focus && frame.ridge[i] && !st.disabled) {
        ramp = glowRamp;
        idx = hc ? n - 1 : Math.max(idx, phase > 0 && phase !== 2 ? n - 1 : n - 2);
      }
      if (st.disabled) idx = hc ? 1 : Math.round(1 + (idx / (n - 1)) * (n - 3));
      put(i, ramp[idx]!, st.disabled ? 190 : 255);
    }
  }

  // Outline and hard shadow on uncovered pixels.
  const outline = ramps[MAT.METAL]![0]!;
  const ca = Math.cos(az), sa = Math.sin(az);
  const sx = Math.abs(ca) > 0.38 ? -Math.sign(ca) : 0;
  const sy = Math.abs(sa) > 0.38 ? -Math.sign(sa) : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (frame.cov[i] === COVERED) continue;
      // A lit gem's glow spills one pixel onto the margin outside the box.
      if (glowK >= 0.4 && frame.gemD[i]! <= 1 && (x < frame.M || y < frame.M || x >= frame.M + frame.W || y >= frame.M + frame.H)) {
        put(i, glowRamp[Math.ceil((n - 1) / 2)]!, 255);
        continue;
      }
      if (o.outline && (frame.covered(x - 1, y) || frame.covered(x + 1, y) || frame.covered(x, y - 1) || frame.covered(x, y + 1))) {
        put(i, outline, st.disabled ? 190 : 255);
        continue;
      }
      if (o.shadow && (sx || sy)) {
        const reach = o.outline ? 2 : 1;
        if (frame.covered(x - sx * reach, y - sy * reach) || frame.covered(x - sx, y - sy)) put(i, SHADOW, SHADOW[3]);
      }
    }
  }
  return img;
}
