/**
 * Corner art <-> PNG pixels, ported from Pixel Frame `artio.js`, so ornaments drawn in the
 * pixelstudio workbench (or any pixel editor) can come across as PNG files.
 *
 * "height + material" convention (default):
 *   transparent (alpha < 128)   empty
 *   #FF00FF (magenta)           cut: clears the bar underneath
 *   grey / low saturation       metal; brightness = height
 *   red / pink   (330°-20°)     gem
 *   orange/yellow (20°-70°)     accent (brass)
 *   blue / teal  (170°-260°)    dark
 * Height from brightness: darkest = 1 ... brightest = 9.
 * "silhouette": any opaque pixel is covered; heights come from distance to the edge.
 */
import type { ArtDef } from './bitmap.ts';
import { createImage } from './shade.ts';
import type { RgbaImage } from './shade.ts';

export const ART_MAX = 20;
const MARKER: Readonly<Record<string, number>> = { g: 0, a: 42, d: 215 };
const SAT = 0.85;
const V0 = 0.12;

export function rgbToHsv(r0: number, g0: number, b0: number): [number, number, number] {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, max ? d / max : 0, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function materialOf(h: number, s: number): string {
  if (s < 0.25) return 'm';
  if (h >= 330 || h < 20) return 'g';
  if (h < 70) return 'a';
  if (h >= 170 && h < 260) return 'd';
  return 'm';
}

export interface ArtImportOptions {
  readonly mode?: 'height' | 'silhouette';
  readonly ox?: number;
  readonly oy?: number;
}

export function artFromImage(img: RgbaImage, opts: ArtImportOptions = {}): { readonly def: ArtDef } | { readonly error: string } {
  const { width: w, height: h, data } = img;
  if (!w || !h) return { error: 'The image is empty.' };
  if (w > ART_MAX || h > ART_MAX) return { error: `Corner art is limited to ${ART_MAX}×${ART_MAX} px; this image is ${w}×${h}.` };
  const mode = opts.mode ?? 'height';
  const ox = Number.isInteger(opts.ox) ? opts.ox! : Math.round(Math.min(w, h) / 3);
  const oy = Number.isInteger(opts.oy) ? opts.oy! : Math.round(Math.min(w, h) / 3);
  const height: string[] = [];
  const mat: string[] = [];
  let filled = 0;
  for (let y = 0; y < h; y++) {
    let hr = '';
    let mr = '';
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const r = data[p]!, g = data[p + 1]!, b = data[p + 2]!, a = data[p + 3]!;
      if (a < 128) { hr += '.'; mr += '.'; continue; }
      if (r === 255 && g === 0 && b === 255) { hr += 'x'; mr += '.'; continue; }
      filled++;
      if (mode === 'silhouette') { hr += '#'; mr += 'a'; continue; }
      const [hue, sat, val] = rgbToHsv(r, g, b);
      hr += String(Math.max(1, Math.min(9, 1 + Math.round((8 * (val - V0)) / (1 - V0)))));
      mr += materialOf(hue, sat);
    }
    height.push(hr);
    mat.push(mr);
  }
  if (!filled) return { error: 'No opaque pixels found (transparent pixels are treated as empty).' };
  return { def: { name: 'Imported corner', ox, oy, height, mat, autoCap: 4, autoBase: 1 } };
}

/** Inverse of the "height + material" convention, for exporting a corner to edit elsewhere. */
export function artToImage(def: Pick<ArtDef, 'height' | 'mat'>): RgbaImage {
  const h = def.height.length;
  const w = Math.max(...def.height.map(r => r.length));
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = def.height[y]![x] ?? '.';
      const p = (y * w + x) * 4;
      if (ch === '.') continue;
      if (ch === 'x') { img.data.set([255, 0, 255, 255], p); continue; }
      const hgt = Math.max(1, Math.min(9, Number(ch) || 1));
      const v = V0 + ((1 - V0) * (hgt - 1)) / 8;
      const m = def.mat?.[y]?.[x] || 'a';
      const marker = MARKER[m];
      const rgb = marker !== undefined ? hsvToRgb(marker, SAT, v) : hsvToRgb(0, 0, v);
      img.data.set([...rgb, 255], p);
    }
  }
  return img;
}
