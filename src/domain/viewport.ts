/** Whole-number enlargement for logical pixels; no arbitrary desktop zoom cap. */
export function integerScale(availableWidth: number, availableHeight: number, width: number, height: number): number {
  if (![availableWidth, availableHeight, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Viewport dimensions must be finite; logical dimensions must be positive.');
  }
  return Math.max(1, Math.floor(Math.min(availableWidth / width, availableHeight / height)));
}

/** Fill the available viewport without cropping. Below 1x, fit proportionally.
 * Fractional downscaling is an explicit last-resort fallback, not pixel-perfect enlargement.
 */
export function viewportScale(availableWidth: number, availableHeight: number, width: number, height: number): number {
  const whole = integerScale(availableWidth, availableHeight, width, height);
  const fit = Math.min(availableWidth / width, availableHeight / height);
  return fit > 0 && fit < 1 ? fit : whole;
}

/** Camera bounds along one axis. A world smaller than the view is centered on whole pixels; a larger world is scrolled within its edges. */
export function cameraAxis(worldLength: number, viewLength: number): { offset: number; length: number } {
  if (![worldLength, viewLength].every(Number.isFinite) || worldLength <= 0 || viewLength <= 0) {
    throw new Error('World and view lengths must be finite and positive.');
  }
  if (worldLength >= viewLength) return { offset: 0, length: worldLength };
  return { offset: -Math.floor((viewLength - worldLength) / 2), length: viewLength };
}

/**
 * Whole-number multiplier for interface text, following the game's pixel scale so DOM windows grow with the canvas.
 * UNSCII 16 stays on its design grid only at whole multiples of 16 px, and very large text crowds the menus, so the
 * result is clamped to 1–2.
 */
export function uiTextScale(gameScale: number): number {
  if (!Number.isFinite(gameScale) || gameScale <= 0) return 1;
  return Math.min(2, Math.max(1, Math.floor(gameScale)));
}
