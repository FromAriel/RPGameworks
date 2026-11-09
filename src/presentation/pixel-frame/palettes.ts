/**
 * Material ramps (dark -> light) and themes that map materials to ramps, ported from Pixel Frame
 * `palettes.js`. The original mutated a global "custom" theme; here every theme is a plain value.
 */
export type Rgb = readonly [number, number, number];
/** Hex colours, darkest first. */
export type Ramp = readonly string[];

export const RAMPS = {
  iron: ['#17191f', '#2a2e38', '#444a57', '#687183', '#99a2b3', '#d5dbe5'],
  brass: ['#25170a', '#4a3014', '#7a5420', '#b0802f', '#dcb35a', '#fbe7a4'],
  silver: ['#1f2229', '#3d424e', '#626a7a', '#8f98a8', '#c4cbd7', '#f4f7fb'],
  obsidian: ['#0b0a11', '#191726', '#2a2740', '#433d64', '#6c629e', '#a99be0'],
  copper: ['#29120c', '#512419', '#823c26', '#b65d36', '#df8a55', '#f8c08f'],
  gemRed: ['#2a0610', '#5a0c1f', '#96162f', '#d42c44', '#ff6a6a', '#ffc8bd'],
  gemBlue: ['#06122a', '#0c2a5a', '#154f96', '#2d82d4', '#6ab8ff', '#cdeeff'],
  gemGreen: ['#062a14', '#0c5a2a', '#169645', '#2cd46a', '#7affa4', '#d4ffe2'],
  neutral: ['#1c1c1c', '#2c2c2c', '#404040', '#575757', '#757575', '#9b9b9b'],
  rust: ['#1e0d07', '#3d1a0d', '#622b14', '#8a4220', '#b0663a', '#cf9466'],
  verdigris: ['#0f1d1a', '#1d342e', '#2f5046', '#467060', '#6d9783', '#a7c4b3'],
  blackened: ['#0d0e11', '#1a1c21', '#2b2e35', '#41454e', '#5d636e', '#878d98'],
} as const satisfies Record<string, Ramp>;

/** High contrast: three steps per material, black / mid / white. */
export const HIGH_CONTRAST = {
  metal: ['#000000', '#8c8c8c', '#ffffff'],
  accent: ['#000000', '#e0b000', '#ffffff'],
  gem: ['#000000', '#ff3030', '#ffffff'],
  neutral: ['#000000', '#808080', '#ffffff'],
  focus: ['#000000', '#ffd400', '#ffd400'],
} as const satisfies Record<string, Ramp>;

export interface Theme {
  readonly name: string;
  readonly metal: Ramp;
  readonly accent: Ramp;
  readonly gem: Ramp;
  /** Tarnish ramps for the wear pass; null = that material never tarnishes. */
  readonly patina: { readonly metal: Ramp | null; readonly accent: Ramp | null };
}

export const THEMES = {
  iron: { name: 'Iron', metal: RAMPS.iron, accent: RAMPS.brass, gem: RAMPS.gemRed, patina: { metal: RAMPS.rust, accent: RAMPS.verdigris } },
  brass: { name: 'Brass', metal: RAMPS.brass, accent: RAMPS.copper, gem: RAMPS.gemBlue, patina: { metal: RAMPS.verdigris, accent: RAMPS.verdigris } },
  silver: { name: 'Silver', metal: RAMPS.silver, accent: RAMPS.brass, gem: RAMPS.gemBlue, patina: { metal: RAMPS.blackened, accent: RAMPS.verdigris } },
  obsidian: { name: 'Obsidian', metal: RAMPS.obsidian, accent: RAMPS.silver, gem: RAMPS.gemGreen, patina: { metal: null, accent: RAMPS.blackened } },
} as const satisfies Record<string, Theme>;

export type ThemeId = keyof typeof THEMES;
export type ThemeRef = ThemeId | Theme;

export function resolveTheme(ref: ThemeRef | undefined): Theme {
  if (ref && typeof ref === 'object') return ref;
  return ref && Object.hasOwn(THEMES, ref) ? THEMES[ref] : THEMES.iron;
}

/** How strongly each material catches specular highlights (indexed by MAT). */
export const SPEC: readonly number[] = [0, 0.55, 0.8, 1, 0.1, 0];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const rampCache = new WeakMap<Ramp, Map<number, readonly Rgb[]>>();

/** Resample a ramp to n steps, always keeping the darkest and lightest. */
export function ramp(src: Ramp, n: number): readonly Rgb[] {
  let byN = rampCache.get(src);
  if (!byN) {
    byN = new Map();
    rampCache.set(src, byN);
  }
  let out = byN.get(n);
  if (!out) {
    const list: Rgb[] = [];
    for (let i = 0; i < n; i++) list.push(hexToRgb(src[Math.round((i * (src.length - 1)) / Math.max(1, n - 1))]!));
    out = list;
    byN.set(n, out);
  }
  return out;
}

// ---- One-colour themes: pixel-art hue shifting from a single base colour ----

export function rgbToHsl([r0, g0, b0]: Rgb): [number, number, number] {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h0: number, s: number, l: number): string {
  const h = ((h0 % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Rotate hue h toward target by at most `deg` degrees, the short way round. */
function toward(h: number, target: number, deg: number): number {
  const diff = ((target - h + 540) % 360) - 180;
  return h + Math.sign(diff) * Math.min(Math.abs(diff), deg);
}

/** Six steps: lightness rises; shadows lean cool, highlights warm; saturation peaks mid-ramp. */
export function shiftedRamp(h: number, s: number, lo = 0.08, hi = 0.92, shift = 22): string[] {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const hue = t < 0.5 ? toward(h, 240, shift * (1 - 2 * t)) : toward(h, 55, shift * (2 * t - 1));
    const sat = Math.min(1, s * (0.55 + 0.6 * Math.sin(Math.PI * t)));
    out.push(hslToHex(hue, sat, lo + (hi - lo) * t));
  }
  return out;
}

export function rampsFromBase(hex: string): { metal: string[]; accent: string[]; gem: string[] } {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  return {
    metal: shiftedRamp(h, s),
    accent: shiftedRamp(toward(42, h, 15), 0.55),
    gem: shiftedRamp(h + 180, Math.max(s, 0.75), 0.12, 0.95),
  };
}

/** A whole theme generated from one base colour. */
export function themeFromBase(hex: string): Theme {
  const r = rampsFromBase(hex);
  return { name: `Custom ${hex}`, metal: r.metal, accent: r.accent, gem: r.gem, patina: { metal: RAMPS.blackened, accent: RAMPS.verdigris } };
}
