/**
 * Test-only canvas stand-in for the window skin compositor (decision 0011 W3.2).
 *
 * SkinPainter draws with a 2D context: save/restore, translate, scale by ±1 and nine-argument drawImage with nearest
 * sampling. This records those calls and rasterizes them into an RGBA buffer, so composed frames can be compared
 * pixel for pixel in Node, before and after a change. It is a model of the canvas, not the browser's own pixels:
 * comparisons are only meaningful between two runs of this harness. The browser specs still exercise the real canvas.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

export interface FakeImage { naturalWidth: number; naturalHeight: number; pixels: Buffer }
export interface DrawCall { sx: number; sy: number; sw: number; sh: number; x0: number; y0: number; x1: number; y1: number; flipX: boolean; flipY: boolean }

export function loadAtlas(file: string): FakeImage {
  const png = PNG.sync.read(readFileSync(file));
  return { naturalWidth: png.width, naturalHeight: png.height, pixels: png.data };
}

class FakeContext {
  imageSmoothingEnabled = true;
  private matrix = { a: 1, d: 1, e: 0, f: 0 };
  private stack: (typeof this.matrix)[] = [];
  readonly calls: DrawCall[] = [];
  constructor(private readonly canvas: FakeCanvas) {}
  save(): void { this.stack.push({ ...this.matrix }); }
  restore(): void { this.matrix = this.stack.pop() ?? { a: 1, d: 1, e: 0, f: 0 }; }
  translate(x: number, y: number): void { this.matrix.e += this.matrix.a * x; this.matrix.f += this.matrix.d * y; }
  scale(x: number, y: number): void { this.matrix.a *= x; this.matrix.d *= y; }
  drawImage(image: FakeImage, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    const { a, d, e, f } = this.matrix;
    if (Math.abs(a) !== 1 || Math.abs(d) !== 1) throw new Error('The harness models only ±1 scales');
    const xa = a * dx + e, xb = a * (dx + dw) + e, ya = d * dy + f, yb = d * (dy + dh) + f;
    const call: DrawCall = { sx, sy, sw, sh, x0: Math.min(xa, xb), y0: Math.min(ya, yb), x1: Math.max(xa, xb), y1: Math.max(ya, yb), flipX: a < 0, flipY: d < 0 };
    this.calls.push(call);
    const { width, height, data } = this.canvas;
    for (let py = Math.max(0, Math.floor(call.y0)); py < Math.min(height, Math.ceil(call.y1)); py++) {
      for (let px = Math.max(0, Math.floor(call.x0)); px < Math.min(width, Math.ceil(call.x1)); px++) {
        const lx = (px + 0.5 - e) / a, ly = (py + 0.5 - f) / d; // Back into the drawImage destination space.
        const u = sx + Math.min(sw - 1, Math.floor(((lx - dx) * sw) / dw));
        const v = sy + Math.min(sh - 1, Math.floor(((ly - dy) * sh) / dh));
        const s = (v * image.naturalWidth + u) * 4, t = (py * width + px) * 4;
        const sa = image.pixels[s + 3]! / 255, da = data[t + 3]! / 255, oa = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++) {
          data[t + c] = oa === 0 ? 0 : Math.round((image.pixels[s + c]! * sa + data[t + c]! * da * (1 - sa)) / oa);
        }
        data[t + 3] = Math.round(oa * 255);
      }
    }
  }
}

export class FakeCanvas {
  private w = 0;
  private h = 0;
  data = new Uint8ClampedArray(0);
  readonly context = new FakeContext(this);
  get width(): number { return this.w; }
  set width(value: number) { this.w = value; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  get height(): number { return this.h; }
  set height(value: number) { this.h = value; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  getContext(): FakeContext { return this.context; }
  toDataURL(): string { return `data:image/x-test;${this.w}x${this.h}`; }
  hash(): string { return createHash('sha256').update(`${this.w}x${this.h}:`).update(this.data).digest('hex'); }
}

/** Install a document whose createElement('canvas') returns a FakeCanvas, and return the canvases it made. */
export function installFakeDocument(): FakeCanvas[] {
  const made: FakeCanvas[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`The harness only makes canvases, not ${tag}`);
      const canvas = new FakeCanvas();
      made.push(canvas);
      return canvas;
    },
  };
  return made;
}

export interface TitleCase { left: number; right: number; centerY: number; height: number; lineHeight: number }
/** Frames and dividers covering exact multiples, remainders, odd sizes, medallion thresholds and both title modes. */
export const GOLDEN_FRAMES: { name: string; width: number; height: number; title?: TitleCase }[] = [
  { name: 'min 32x32', width: 32, height: 32 },
  { name: 'odd 33x47', width: 33, height: 47 },
  { name: 'threshold 96x96', width: 96, height: 96 },
  { name: 'below threshold 95x97', width: 95, height: 97 },
  { name: 'remainder 200x120', width: 200, height: 120 },
  { name: 'odd 321x187', width: 321, height: 187 },
  { name: 'wide 1023x77', width: 1023, height: 77 },
  { name: 'tall 64x400', width: 64, height: 400 },
  { name: 'title 319x123', width: 319, height: 123, title: { left: 120, right: 198, centerY: 22, height: 14, lineHeight: 16 } },
  { name: 'title near left 300x150', width: 300, height: 150, title: { left: 36, right: 90, centerY: 8, height: 16, lineHeight: 16 } },
  { name: 'title odd edges 257x99', width: 257, height: 99, title: { left: 40.6, right: 211.2, centerY: 9.4, height: 16, lineHeight: 16 } },
  { name: 'title too wide 160x180', width: 160, height: 180, title: { left: 20, right: 140, centerY: 30, height: 16, lineHeight: 20 } },
  { name: 'title wrapped 160x180', width: 160, height: 180, title: { left: 20, right: 140, centerY: 30, height: 40, lineHeight: 20 } },
  { name: 'title low on short frame 200x60', width: 200, height: 60, title: { left: 60, right: 140, centerY: 30, height: 16, lineHeight: 16 } },
];
export const GOLDEN_DIVIDERS: { name: string; width: number; title?: TitleCase }[] = [
  { name: 'divider 32', width: 32 },
  { name: 'divider 200 untitled', width: 200 },
  { name: 'divider 301 titled', width: 301, title: { left: 100, right: 180, centerY: 8, height: 16, lineHeight: 16 } },
  { name: 'divider 120 title too wide', width: 120, title: { left: 10, right: 110, centerY: 8, height: 16, lineHeight: 16 } },
];
