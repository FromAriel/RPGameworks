import { describe, expect, it } from 'vitest';
import { fillGradient } from '../../src/presentation/ui/window-frames';
import { fillColumn } from '../../src/presentation/pixel-frame/index.ts';
import { DEFAULT_THEME, bakeAll, readTheme } from '../../tools/bake-frames.ts';

describe('Page window frames (decision 0010, W2.3)', () => {
  it('turns a fill column into hard stops in CSS pixels, merging equal rows', () => {
    expect(fillGradient([[1, 2, 3], [1, 2, 3], [4, 5, 6]], 2)).toBe('linear-gradient(to bottom, rgb(1 2 3) 0px 4px, rgb(4 5 6) 4px 6px)');
    expect(fillGradient([[9, 9, 9]], 1)).toBe('linear-gradient(to bottom, rgb(9 9 9) 0px 1px)');
  });

  it('keeps every band of a real window fill, in order, covering the whole height', () => {
    const column = fillColumn({ kind: 'bands', top: '#3050b8', bottom: '#0c1854', band: 4 }, 130)!;
    const gradient = fillGradient(column, 2);
    const stops = [...gradient.matchAll(/rgb\((\d+) (\d+) (\d+)\) (\d+)px (\d+)px/g)].map(m => m.slice(1).map(Number));
    expect(stops[0]!.slice(3)).toEqual([0, stops[0]![4]!]);
    for (let i = 1; i < stops.length; i++) expect(stops[i]![3]).toBe(stops[i - 1]![4]); // Contiguous.
    expect(stops.at(-1)![4]).toBe(260);
  });

  it('bakes page and nameplate surfaces from the demo theme', () => {
    const { manifest } = bakeAll(readTheme(DEFAULT_THEME));
    expect(Object.keys(manifest.frames)).toEqual(['battle', 'page', 'nameplate']);
    expect(manifest.frames.page!.fill.kind).toBe('bands');
    expect(manifest.frames.nameplate!.fill).toEqual({ kind: 'flat', color: '#24409a' });
  });
});
