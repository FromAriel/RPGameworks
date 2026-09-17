/** Integer CSS scaling; narrow viewports scroll instead of silently blurring. */
export function integerScale(availableWidth: number, availableHeight: number, width: number, height: number): number {
  if (![availableWidth, availableHeight, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error('Viewport dimensions must be finite; logical dimensions must be positive.');
  }
  return Math.max(1, Math.min(4, Math.floor(Math.min(availableWidth / width, availableHeight / height))));
}
