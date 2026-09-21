import { describe, expect, test } from 'vitest';
import { resolveMeter, resolveScrollAvailability } from '../../src/presentation/ui/components';

describe('shared UI component models', () => {
  test('meters validate finite values and positive maxima', () => {
    expect(() => resolveMeter({ current: Number.NaN, maximum: 10 })).toThrow('current value must be finite');
    expect(() => resolveMeter({ current: 1, maximum: 0 })).toThrow('maximum must be finite and positive');
    expect(() => resolveMeter({ current: 1, maximum: Number.POSITIVE_INFINITY })).toThrow('maximum must be finite and positive');
  });

  test('meters clamp presentation without hiding the supplied numeric value', () => {
    expect(resolveMeter({ current: 14, maximum: 10 })).toEqual({
      current: 14, maximum: 10, clamped: 10, percentage: 100, text: '14 / 10',
    });
    expect(resolveMeter({ current: -2, maximum: 8 })).toEqual({
      current: -2, maximum: 8, clamped: 0, percentage: 0, text: '-2 / 8',
    });
  });

  test('scroll availability reports every bounded state', () => {
    expect(resolveScrollAvailability(0, 100, 100)).toBe('none');
    expect(resolveScrollAvailability(0, 100, 220)).toBe('below');
    expect(resolveScrollAvailability(50, 100, 220)).toBe('both');
    expect(resolveScrollAvailability(120, 100, 220)).toBe('above');
  });
});
