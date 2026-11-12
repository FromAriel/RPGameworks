import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readRecipe } from '../../tools/skin-bake/recipe.mjs';
import { bakeSkin } from '../../tools/skin-bake/bake.ts';
import type { FilledRecipe } from '../../tools/skin-bake/bake.ts';
import { readSkinManifest } from '../../src/presentation/skin/skin-manifest.mjs';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';
import { expectCleanComposition } from './skin-checks';

/**
 * Decision 0013 B2 acceptance: every example recipe bakes to a skin that passes the v2 reader and the audit tool,
 * baking twice gives identical bytes, and the baked skin composes cleanly at odd and even sizes (W3.2's checks).
 * Set BAKE_PREVIEW_DIR to also write each baked atlas and manifest there for a look.
 */
const RECIPES = [
  ['thin-silver', 'tests/fixtures/recipes/thin-silver.json'],
  ['riveted-iron', 'tests/fixtures/recipes/riveted-iron.json'],
  ['carved-corner', 'tests/fixtures/recipes/carved-corner/recipe.json'],
  ['white-silver', 'tests/fixtures/recipes/white-silver/recipe.json'],
] as const;
const out = mkdtempSync(path.join(tmpdir(), 'rpg-bake-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

function load(file: string): FilledRecipe {
  const result = readRecipe(JSON.parse(readFileSync(file, 'utf8')), { dir: path.dirname(file), file });
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.recipe as FilledRecipe;
}

describe('skin bake (decision 0013 B2)', () => {
  for (const [name, file] of RECIPES) {
    it(`bakes ${name} into a valid, audited, deterministic v2 skin that composes cleanly`, async () => {
      const recipe = load(file);
      const first = bakeSkin(recipe, { dir: path.dirname(file), image: `${name}.png` });
      const second = bakeSkin(load(file), { dir: path.dirname(file), image: `${name}.png` });
      expect(first.png.equals(second.png), 'identical PNG bytes').toBe(true);
      expect(JSON.stringify(first.manifest)).toBe(JSON.stringify(second.manifest));

      const read = readSkinManifest(first.manifest);
      expect(read.ok ? [] : read.errors).toEqual([]);
      const skin = first.manifest as unknown as WindowSkinManifestV2;
      expect(skin.theme).toBe(recipe.name);
      expect(skin.geometry.band).toEqual(recipe.band);

      writeFileSync(path.join(out, `${name}.png`), first.png);
      const manifestFile = path.join(out, `${name}.manifest.json`);
      writeFileSync(manifestFile, JSON.stringify(first.manifest));
      const audit = JSON.parse(execFileSync(process.execPath, ['tools/audit-windowskin.mjs', '--manifest', manifestFile], { encoding: 'utf8' })) as { version: number; gutterNontransparent: number };
      expect(audit).toMatchObject({ version: 2, gutterNontransparent: 0 });
      if (process.env.BAKE_PREVIEW_DIR) {
        writeFileSync(path.join(process.env.BAKE_PREVIEW_DIR, `${name}.png`), first.png);
        writeFileSync(path.join(process.env.BAKE_PREVIEW_DIR, `${name}.manifest.json`), JSON.stringify(first.manifest, null, 2));
      }

      await expectCleanComposition(skin, { naturalWidth: first.atlas.width, naturalHeight: first.atlas.height, pixels: Buffer.from(first.atlas.data) });
    });
  }

  it('lights the four corners individually: light from the top left makes them differ', () => {
    const file = RECIPES[0][1];
    const { manifest, atlas } = bakeSkin(load(file), { dir: path.dirname(file) });
    const tiles = (manifest as unknown as WindowSkinManifestV2).tiles;
    const pixels = (id: string) => {
      const r = tiles.find((t) => t.id === id)!.rect!;
      const rows: number[] = [];
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) rows.push(...atlas.data.subarray(((r.y + y) * atlas.width + r.x + x) * 4, ((r.y + y) * atlas.width + r.x + x) * 4 + 4));
      return rows.join(',');
    };
    const corners = ['corner.tl', 'corner.tr', 'corner.bl', 'corner.br'].map(pixels);
    expect(new Set(corners).size).toBe(4);
  });

  it('bakes medallions on all four sides (left and right from a transposed, re-lit frame) that compose cleanly', async () => {
    const file = RECIPES[1][1];
    const medal = { art: { library: 'medal' } } as const;
    const recipe = { ...load(file), medallions: { top: medal, right: medal, bottom: medal, left: medal } };
    const { manifest, atlas } = bakeSkin(recipe, { dir: path.dirname(file) });
    const read = readSkinManifest(manifest);
    expect(read.ok ? [] : read.errors).toEqual([]);
    const skin = manifest as unknown as WindowSkinManifestV2;
    expect(Object.keys(skin.geometry.midpoints ?? {}).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    const mid = (side: string) => skin.tiles.find((t) => t.id === `mid.${side}`)!.rect!;
    expect([mid('left').w, mid('left').h]).toEqual([mid('top').h, mid('top').w]); // The side pieces are the top piece turned.
    if (process.env.BAKE_PREVIEW_DIR) {
      writeFileSync(path.join(process.env.BAKE_PREVIEW_DIR, 'four-medals.png'), bakeSkin(recipe, { dir: path.dirname(file) }).png);
      writeFileSync(path.join(process.env.BAKE_PREVIEW_DIR, 'four-medals.manifest.json'), JSON.stringify(manifest, null, 2));
    }
    await expectCleanComposition(skin, { naturalWidth: atlas.width, naturalHeight: atlas.height, pixels: Buffer.from(atlas.data) });
  });

  it('paints the frame in the recipe frame ramp and accent pieces in the accent ramp', () => {
    const file = RECIPES[3][1], dir = path.dirname(file);
    const white = load(file);
    // Mean brightness of a tile's opaque pixels.
    const brightness = (recipe: FilledRecipe, id: string) => {
      const { manifest, atlas } = bakeSkin(recipe, { dir });
      const r = (manifest as unknown as WindowSkinManifestV2).tiles.find((t) => t.id === id)!.rect!;
      let sum = 0, n = 0;
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const i = ((r.y + y) * atlas.width + r.x + x) * 4;
        if (atlas.data[i + 3]! < 128) continue;
        sum += 0.2126 * atlas.data[i]! + 0.7152 * atlas.data[i + 1]! + 0.0722 * atlas.data[i + 2]!; n += 1;
      }
      return sum / n;
    };
    const { frame: _frame, ...plainColors } = white.colors;
    expect(brightness(white, 'edge.top.rail')).toBeGreaterThan(brightness({ ...white, colors: plainColors }, 'edge.top.rail') + 20);
    expect(brightness(white, 'corner.tl')).toBeLessThan(brightness({ ...white, corner: { ...white.corner, material: 'as-drawn' } }, 'corner.tl') - 20);
  });

  it('refuses a band with no room for the outline and the profile', () => {
    const recipe = load(RECIPES[0][1]);
    expect(() => bakeSkin({ ...recipe, band: { ...recipe.band, left: 4 } }, { dir: '.' }))
      .toThrow('The left band (4) has no room for the outline and the 4-step profile; make it at least 5');
  });
});
