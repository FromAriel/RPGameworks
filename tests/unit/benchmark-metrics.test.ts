import { describe, expect, it } from 'vitest';
import { distribution, frameSummary } from '../benchmark/metrics';

describe('benchmark evidence statistics', () => {
  it('does not convert missing observations into zero measurements', () => {
    expect(distribution([])).toEqual({ count: 0, min: null, p50: null, p95: null, p99: null, max: null, mean: null });
    expect(frameSummary([]).meanCallbackHz).toBeNull();
  });
  it('uses nearest-rank quantiles for known samples', () => {
    const data = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(distribution(data)).toEqual({ count: 100, min: 1, p50: 50, p95: 95, p99: 99, max: 100, mean: 50.5 });
    expect(data[0]).toBe(100);
  });
  it('supports singleton and zero-duration measurements without infinity', () => {
    expect(distribution([2]).p99).toBe(2); expect(frameSummary([0]).meanCallbackHz).toBeNull();
  });
  it.each([NaN, Infinity, -Infinity, -1])('rejects invalid measurements: %s', invalid => {
    expect(() => distribution([16, invalid])).toThrow('finite');
  });
  it('retains long stalls instead of clamping them to the movement delta limit', () => {
    const result = frameSummary([16, 16, 16, 500]);
    expect(result.intervalMs.max).toBe(500); expect(result.over50Ms).toBe(1);
    expect(result.intervalMs.mean).toBe(137);
  });
  it('counts explicit interval thresholds without claiming dropped frames', () => {
    const result = frameSummary([16, 33.334, 34, 50, 51]);
    expect(result.over33_334Ms).toBe(3); expect(result.over50Ms).toBe(1);
    expect(result).not.toHaveProperty('droppedFrames');
  });
});
