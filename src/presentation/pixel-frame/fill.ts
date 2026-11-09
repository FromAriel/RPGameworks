/**
 * Window interior fill (new in RPGameworks, decision 0010 §3). The engine frames the border only;
 * a window also needs its inside.
 *
 * A flat fill stretches exactly as a 9-slice centre. A banded or gradient fill does not: its bands
 * depend on the window's height. So fills are a separate pure function of height, and a renderer
 * draws the column `fillColumn(fill, height)` stretched sideways, which is exact at any width.
 */
import { hexToRgb } from './palettes.ts';
import type { Rgb } from './palettes.ts';

export type Fill =
  | { readonly kind: 'none' }
  | { readonly kind: 'flat'; readonly color: string }
  /** Vertical blend from `top` to `bottom` in whole bands of `band` pixels (1 = a smooth gradient). */
  | { readonly kind: 'bands'; readonly top: string; readonly bottom: string; readonly band: number };

/** One colour per pixel row of a fill `height` pixels tall, or null when the window has no fill. */
export function fillColumn(fill: Fill, height: number): Rgb[] | null {
  if (!Number.isInteger(height) || height < 0) throw new RangeError(`fill height must be a whole number of pixels, got ${height}`);
  if (fill.kind === 'none') return null;
  if (fill.kind === 'flat') return new Array<Rgb>(height).fill(hexToRgb(fill.color));
  if (!Number.isInteger(fill.band) || fill.band < 1) throw new RangeError(`fill band must be a positive whole number, got ${fill.band}`);
  const top = hexToRgb(fill.top);
  const bottom = hexToRgb(fill.bottom);
  const bands = Math.ceil(height / fill.band);
  const out: Rgb[] = [];
  for (let y = 0; y < height; y++) {
    const band = Math.floor(y / fill.band);
    const t = bands > 1 ? band / (bands - 1) : 0;
    const at = (a: number, b: number) => Math.round(a + (b - a) * t);
    out.push([at(top[0], bottom[0]), at(top[1], bottom[1]), at(top[2], bottom[2])]);
  }
  return out;
}
