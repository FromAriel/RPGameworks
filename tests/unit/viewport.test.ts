import { describe, expect, it } from 'vitest';
import { integerScale, viewportScale } from '../../src/domain/viewport';

describe('player viewport fit', () => {
  it.each([[1920,1080,5], [3840,2160,11], [1100,850,3], [740,850,2], [390,844,1], [844,390,2]])(
    'fits %i x %i using %ix without changing the logical canvas', (w,h,scale) => {
      expect(viewportScale(w,h,320,192)).toBe(scale);
      expect(320*scale).toBeLessThanOrEqual(w); expect(192*scale).toBeLessThanOrEqual(h);
    });
  it.each([[280,600,.875], [640,144,.75], [160,96,.5]])('fits undersized %i x %i without scrolling', (w,h,scale) => {
    expect(viewportScale(w,h,320,192)).toBe(scale);
  });
  it('has no former 4x enlargement ceiling', () => expect(integerScale(3200,1920,320,192)).toBe(10));
  it('handles a temporarily zero-sized parent without a zero zoom', () => expect(viewportScale(0,0,320,192)).toBe(1));
  it('rejects non-finite dimensions', () => expect(() => viewportScale(Infinity,800,320,192)).toThrow());
});
