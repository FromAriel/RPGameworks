import { describe, expect, it } from 'vitest';
import { cameraAxis, integerScale, viewportScale } from '../../src/domain/viewport';

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

describe('640 x 360 logical view (decision 0008)', () => {
  it.each([[1280,720,2], [1920,1080,3], [2560,1440,4], [3840,2160,6], [1100,850,1], [844,390,1]])(
    'enlarges %i x %i by whole pixels (%ix)', (w,h,scale) => expect(viewportScale(w,h,640,360)).toBe(scale));
  it('falls back to proportional fit only where 640 x 360 cannot fit at 1x', () => {
    expect(viewportScale(390,844,640,360)).toBeCloseTo(390/640, 10);
    expect(viewportScale(280,160,640,360)).toBeCloseTo(280/640, 10);
  });
});

describe('camera bounds per axis', () => {
  it('scrolls a world at least as large as the view within its edges', () => {
    expect(cameraAxis(640,640)).toEqual({offset:0,length:640});
    expect(cameraAxis(704,360)).toEqual({offset:0,length:704});
  });
  it('centers a smaller world on whole pixels', () => {
    expect(cameraAxis(320,640)).toEqual({offset:-160,length:640});
    expect(cameraAxis(192,360)).toEqual({offset:-84,length:360});
    expect(cameraAxis(128,361)).toEqual({offset:-116,length:361});
  });
  it('rejects empty or non-finite lengths', () => {
    for (const [world,view] of [[0,360],[320,0],[Infinity,360],[320,Number.NaN]]) expect(() => cameraAxis(world!,view!)).toThrow();
  });
});
