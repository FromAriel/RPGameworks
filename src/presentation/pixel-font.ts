import Phaser from 'phaser';

/**
 * UNSCII 16 as a true bitmap font for canvas text (public/fonts/CREDITS.md).
 *
 * The TTF stores each 8 × 16 bitmap glyph as outlines, and browsers anti-alias those outlines at every size and
 * position (measured: most inked pixels come out partial at 16 px), which then looks blurry once the 640 × 360 view is
 * upscaled. So the glyphs are rasterised once at 8× and sampled at each pixel cell's centre, which recovers the exact
 * one-bit design, and drawn with BitmapText at 1:1 with nearest-neighbour filtering. Nothing is smoothed afterwards.
 */
export const PIXEL_FONT_KEY = 'ui:font.unscii16';
export const PIXEL_FONT_SIZE = 16;
/** Character cell width at 16 px; UNSCII 16 is monospaced. */
export const PIXEL_FONT_ADVANCE = 8;
const FAMILY = 'RPGameworks UNSCII 16';
const CELL_W = 8;
const CELL_H = 16;
const PER_ROW = 16;
const OVERSAMPLE = 8;
/** Printable ASCII; anything else renders as a gap. */
export const PIXEL_FONT_CHARS = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('');

let loading: Promise<HTMLCanvasElement | null> | null = null;
let sheet: HTMLCanvasElement | null = null;

/**
 * Load the font file and build the one-bit glyph sheet once. Resolves false instead of rejecting, so a missing font
 * never blocks a battle: callers fall back to ordinary canvas text.
 */
export async function loadPixelFont(base: string): Promise<boolean> {
  loading ??= (async () => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return null;
    try {
      const face = await new FontFace(FAMILY, `url(${base}fonts/unscii/unscii-16.ttf) format("truetype")`).load();
      document.fonts.add(face);
      return rasterise(FAMILY);
    } catch { return null; }
  })();
  sheet = await loading;
  return sheet !== null;
}

function rasterise(family: string): HTMLCanvasElement | null {
  const big = document.createElement('canvas');
  big.width = CELL_W * OVERSAMPLE; big.height = CELL_H * OVERSAMPLE;
  const draw = big.getContext('2d', { willReadFrequently: true });
  const out = document.createElement('canvas');
  const rows = Math.ceil(PIXEL_FONT_CHARS.length / PER_ROW);
  out.width = CELL_W * PER_ROW; out.height = CELL_H * rows;
  const target = out.getContext('2d');
  if (!draw || !target) return null;
  draw.font = `${CELL_H * OVERSAMPLE}px "${family}"`;
  if (!draw.font.includes(family)) return null; // The font did not apply; fall back rather than bake the wrong glyphs.
  draw.textBaseline = 'alphabetic';
  draw.fillStyle = '#fff';
  const ascent = draw.measureText('H').fontBoundingBoxAscent;
  const pixels = target.createImageData(out.width, out.height);
  [...PIXEL_FONT_CHARS].forEach((char, index) => {
    draw.clearRect(0, 0, big.width, big.height);
    draw.fillText(char, 0, ascent);
    const alpha = draw.getImageData(0, 0, big.width, big.height).data;
    const cellX = (index % PER_ROW) * CELL_W, cellY = Math.floor(index / PER_ROW) * CELL_H;
    for (let y = 0; y < CELL_H; y += 1) for (let x = 0; x < CELL_W; x += 1) {
      const centre = ((y * OVERSAMPLE + OVERSAMPLE / 2) * big.width + x * OVERSAMPLE + OVERSAMPLE / 2) * 4 + 3;
      if (alpha[centre]! < 128) continue;
      const at = ((cellY + y) * out.width + cellX + x) * 4;
      pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = pixels.data[at + 3] = 255;
    }
  });
  target.putImageData(pixels, 0, 0);
  return out;
}

/**
 * Register the bitmap font with `scene` and return its key, or null when the font is unavailable. The caller owns the
 * registration and must call releasePixelFont when it no longer draws with it.
 */
export function addPixelFont(scene: Phaser.Scene): string | null {
  if (!sheet) return null;
  if (scene.cache.bitmapFont.exists(PIXEL_FONT_KEY)) return PIXEL_FONT_KEY;
  const copy = document.createElement('canvas');
  copy.width = sheet.width; copy.height = sheet.height;
  copy.getContext('2d')?.drawImage(sheet, 0, 0);
  const texture = scene.textures.addCanvas(PIXEL_FONT_KEY, copy);
  if (!texture) return null;
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  scene.cache.bitmapFont.add(PIXEL_FONT_KEY, Phaser.GameObjects.RetroFont.Parse(scene, {
    image: PIXEL_FONT_KEY, width: CELL_W, height: CELL_H, chars: PIXEL_FONT_CHARS, charsPerRow: PER_ROW,
    'spacing.x': 0, 'spacing.y': 0, 'offset.x': 0, 'offset.y': 0, lineSpacing: 0,
  }));
  return PIXEL_FONT_KEY;
}

export function releasePixelFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(PIXEL_FONT_KEY)) scene.cache.bitmapFont.remove(PIXEL_FONT_KEY);
  if (scene.textures.exists(PIXEL_FONT_KEY)) scene.textures.remove(PIXEL_FONT_KEY);
}

/** The BitmapText size that draws glyphs 1:1. RetroFont records the cell width (8), not the 16 px height, as its size. */
export const PIXEL_FONT_BITMAP_SIZE = CELL_W;
