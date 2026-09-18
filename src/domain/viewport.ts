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
