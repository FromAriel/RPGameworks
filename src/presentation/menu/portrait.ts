/**
 * Placeholder portraits (decision 0016 Q4): a head-and-shoulders close-up cut from a party member's own placeholder
 * sprite and enlarged in whole pixels to fill the 40 × 40 portrait frame. Original art, replaced by LPC portraits (S1).
 */
export interface SpriteRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const PORTRAIT_SIZE = 40;

export function spritePortrait(image: CanvasImageSource, frame: SpriteRect): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE; canvas.height = PORTRAIT_SIZE;
  canvas.className = 'menu-portrait';
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.imageSmoothingEnabled = false;
  // The upper part of the sprite, centred: a square of side ⌈frame/32 × 20⌉ pixels, enlarged by a whole step.
  const side = Math.max(1, Math.round(frame.w * 0.625));
  const step = Math.max(1, Math.floor(PORTRAIT_SIZE / side));
  const sx = frame.x + Math.floor((frame.w - side) / 2), sy = frame.y + Math.max(0, Math.round(frame.h * 0.06));
  const drawn = side * step, offset = Math.floor((PORTRAIT_SIZE - drawn) / 2);
  g.drawImage(image, sx, sy, side, side, offset, offset, drawn, drawn);
  return canvas;
}
