/** Benchmark-only statistics. Never imported by the browser application. */
export interface Distribution {
  count: number;
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
  mean: number | null;
}

/** Nearest-rank quantiles. Empty measurements are unavailable, never fake zeroes. */
export function distribution(values: readonly number[]): Distribution {
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    throw new Error('Measurements must be finite, nonnegative numbers');
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return { count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null };
  const rank = (p: number): number => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
  return {
    count: sorted.length, min: sorted[0]!, p50: rank(0.5), p95: rank(0.95), p99: rank(0.99),
    max: sorted[sorted.length - 1]!, mean: sorted.reduce((sum, n) => sum + n, 0) / sorted.length,
  };
}

export function frameSummary(intervals: readonly number[]) {
  const ms = distribution(intervals);
  return {
    intervalMs: ms,
    meanCallbackHz: ms.mean !== null && ms.mean > 0 ? 1000 / ms.mean : null,
    over33_334Ms: intervals.filter(n => n > 33.334).length,
    over50Ms: intervals.filter(n => n > 50).length,
    // No inferred dropped/presented frames: callbacks are not display presentation.
  };
}
