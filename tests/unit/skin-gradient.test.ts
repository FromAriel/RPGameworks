import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRecipe } from '../../tools/skin-bake/recipe.mjs';
import { bakeSkin } from '../../tools/skin-bake/bake.ts';
import type { FilledRecipe } from '../../tools/skin-bake/bake.ts';
import { readSkinManifest } from '../../src/presentation/skin/skin-manifest.mjs';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';
import { installFakeDocument } from './skin-harness';
import { expectCleanComposition } from './skin-checks';
import { withFillColor, withFillType } from '../../tools/skin-studio/studio-model';
import type { Draft } from '../../tools/skin-studio/studio-model';

/**
 * W3.6 (Ariel, November 12, 2026): a soft gradient fill that bands once across the whole window, settable in recipes and
 * the studio. W1 gains manifest geometry.fill.stretch; the bake writes the gradient as a one-pixel line of bands.
 */
const file = 'tests/fixtures/recipes/thin-silver.json', dir = path.dirname(file);
const raw = JSON.parse(readFileSync(file, 'utf8')) as Draft;
const gradient = (fill: Record<string, unknown>) => ({ ...raw, fill: { type: 'gradient', from: '#2f4fb2', to: '#0b1650', ...fill } });
const read = (json: unknown) => { const r = readRecipe(json, { dir, file: 'r' }); return r.ok ? { recipe: r.recipe as FilledRecipe, errors: [] } : { recipe: null, errors: r.errors }; };

describe('gradient window fill (W3.6)', () => {
  it('reads a gradient with 16 bands top to bottom by default, and rejects mixed or missing fill settings', () => {
    expect(read(gradient({})).recipe?.fill).toEqual({ type: 'gradient', from: '#2f4fb2', to: '#0b1650', steps: 16, direction: 'down' });
    expect(read(gradient({ to: undefined })).errors).toEqual(['r /fill: a gradient fill needs "to"']);
    expect(read(gradient({ color: '#000000' })).errors).toEqual(['r /fill/color: is only used by a flat fill']);
    expect(read({ ...raw, fill: { type: 'flat', color: '#000000', steps: 4 } }).errors).toEqual(['r /fill/steps: is only used by a gradient fill']);
    expect(read(gradient({ steps: 1 })).errors[0]).toContain('/fill/steps');
  });

  it('bakes the bands as a one-pixel line the manifest stretches, in either direction', () => {
    for (const [direction, stretch, w, h] of [['down', 'vertical', 1, 6], ['up', 'vertical', 1, 6], ['right', 'horizontal', 6, 1], ['left', 'horizontal', 6, 1]] as const) {
      const { manifest, atlas } = bakeSkin(read(gradient({ steps: 6, direction })).recipe!, { dir });
      const result = readSkinManifest(manifest);
      expect(result.ok ? [] : result.errors).toEqual([]);
      const skin = manifest as unknown as WindowSkinManifestV2;
      expect(skin.geometry.fill).toEqual({ stretch });
      const r = skin.tiles.find((t) => t.id === 'fill.plain')!.rect!;
      expect([r.w, r.h], direction).toEqual([w, h]);
      const at = (i: number) => { const x = r.x + (w > 1 ? i : 0), y = r.y + (h > 1 ? i : 0), s = (y * atlas.width + x) * 4; return [...atlas.data.subarray(s, s + 3)]; };
      const [first, last] = direction === 'down' || direction === 'right' ? [at(0), at(5)] : [at(5), at(0)];
      expect(first).toEqual([0x2f, 0x4f, 0xb2]);
      expect(last).toEqual([0x0b, 0x16, 0x50]);
    }
  });

  it('stretches the fill across the whole window in W1, and the frame still composes cleanly', async () => {
    const { manifest, atlas } = bakeSkin(read(gradient({ steps: 8 })).recipe!, { dir });
    const skin = manifest as unknown as WindowSkinManifestV2;
    const image = { naturalWidth: atlas.width, naturalHeight: atlas.height, pixels: Buffer.from(atlas.data) };
    await expectCleanComposition(skin, image);
    const canvases = installFakeDocument();
    const { SkinPainter } = await import('../../src/presentation/skin/paint');
    const painter = new SkinPainter(image as unknown as HTMLImageElement, skin);
    const canvas = canvases.at(-1)!;
    canvas.context.calls.length = 0;
    painter.frame(120, 90);
    const fill = skin.tiles.find((t) => t.id === 'fill.plain')!.rect!;
    const fills = canvas.context.calls.filter((c) => c.sx === fill.x && c.sy === fill.y);
    const half = Math.floor(6 / 2); // thin-silver's bands are 6.
    expect(fills).toHaveLength(120 - 2 * half); // One stretched column per pixel of the interior width.
    for (const c of fills) expect([c.sw, c.sh, c.y0, c.y1]).toEqual([1, 8, half, 90 - half]);
  });

  it('leaves the frame pieces clear where the gradient shows through, so no fixed colour patches the corners', () => {
    const solid = bakeSkin(read({ ...raw, band: { top: 8, right: 8, bottom: 8, left: 8 } }).recipe!, { dir });
    const graded = bakeSkin(read({ ...gradient({}), band: { top: 8, right: 8, bottom: 8, left: 8 } }).recipe!, { dir });
    const clearIn = (baked: typeof solid) => {
      const r = (baked.manifest as unknown as WindowSkinManifestV2).tiles.find((t) => t.id === 'corner.tl')!.rect!;
      let clear = 0;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (baked.atlas.data[((r.y + y) * baked.atlas.width + r.x + x) * 4 + 3]! < 128) clear += 1;
      return clear;
    };
    expect(clearIn(graded)).toBeGreaterThan(clearIn(solid));
  });

  it('the studio switches fill kinds keeping the colours, and edits either end', () => {
    const flat = { ...raw, fill: { type: 'flat', color: '#112233' } } as Draft;
    const g = withFillType(flat, 'gradient');
    expect(g.fill).toEqual({ type: 'gradient', from: '#112233', to: '#112233', steps: 16, direction: 'down' });
    expect(withFillColor(g, 'to', '#000000').fill.to).toBe('#000000');
    expect(withFillType(withFillColor(g, 'to', '#000000'), 'bands').fill).toEqual({ type: 'bands', top: '#112233', bottom: '#000000', bandHeight: 4, tileHeight: 16 });
    expect(withFillType(g, 'flat').fill).toEqual({ type: 'flat', color: '#112233' });
  });
});
