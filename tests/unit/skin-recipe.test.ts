import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { ART_LIBRARY, PNG_ART_MAX, readRecipe } from '../../tools/skin-bake/recipe.mjs';

const dir = 'tests/fixtures/recipes';
const load = (file: string) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Record<string, unknown>;
const errorsOf = (json: unknown, where: { dir?: string } = { dir }) => { const result = readRecipe(json, { ...where, file: 'r' }); return result.ok ? [] : result.errors; };

describe('skin recipes (decision 0013 B1)', () => {
  it('accepts the example recipes and fills in every default', () => {
    for (const [file, folder] of [['thin-silver.json', dir], ['riveted-iron.json', dir], ['carved-corner/recipe.json', path.join(dir, 'carved-corner')]] as const) {
      const result = readRecipe(load(file), { dir: folder, file });
      expect(result.ok ? [] : result.errors, file).toEqual([]);
    }
    const thin = readRecipe(load('thin-silver.json'), { dir });
    if (!thin.ok) throw new Error('unreachable');
    expect(thin.recipe.corner.size).toBe('medium');
    expect(thin.recipe.title.textGap).toBe(4);
    expect(thin.recipe.light).toEqual({ azimuth: 225, elevation: 45, steps: 5, outline: true, shadow: false });
    expect(thin.recipe.divider).toEqual({ band: 6, profile: [1, 2, 2, 1] }); // Defaults to the top band and the frame profile.
    expect(thin.recipe.contentMargin).toBe(4);
    const iron = readRecipe(load('riveted-iron.json'), { dir });
    if (!iron.ok) throw new Error('unreachable');
    expect(iron.recipe.motif).toEqual({ art: { library: 'rivet' }, period: 14, spacing: 'even', size: 'medium' });
    expect(iron.recipe.divider).toEqual({ band: 8, profile: [1, 2, 1] });
  });

  it('knows the twelve Pixel Frame art pieces and Pixel Frame’s PNG limit', () => {
    expect(ART_LIBRARY).toHaveLength(12);
    expect(PNG_ART_MAX).toBe(20);
  });

  it('reports each broken recipe with its place and reason', () => {
    const base = load('thin-silver.json');
    const cases: [string, Record<string, unknown>, string][] = [
      ['unknown art', { ...base, corner: { art: { library: 'dragon' } } }, 'r /corner/art/library: unknown art "dragon" (known: notch, rivet-boss'],
      ['art with both sources', { ...base, corner: { art: { library: 'notch', png: 'x.png' } } }, 'r /corner/art: needs exactly one of "library" or "png"'],
      ['profile thicker than a band', { ...base, band: { top: 6, right: 6, bottom: 3, left: 6 } }, 'r /profile: has 4 steps, thicker than the bottom band (3)'],
      ['divider profile too thick', { ...base, divider: { band: 2 } }, 'r /divider: profile has 4 steps, thicker than the divider band (2)'],
      ['two colour sources', { ...base, colors: { theme: 'iron', base: '#336699' } }, 'r /colors: needs exactly one of "theme" or "base"'],
      ['no colour source', { ...base, colors: {} }, 'r /colors: needs exactly one of "theme" or "base"'],
      ['impossible colour', { ...base, colors: { base: '#12345g' } }, 'r /colors/base: must match pattern'],
      ['flat fill without a colour', { ...base, fill: { type: 'flat' } }, 'r /fill: a flat fill needs "color"'],
      ['banded fill missing a part', { ...base, fill: { type: 'bands', top: '#3050b8', bottom: '#0c1854', bandHeight: 4 } }, 'r /fill: a banded fill needs "tileHeight"'],
      ['bands taller than the tile', { ...base, fill: { type: 'bands', top: '#3050b8', bottom: '#0c1854', bandHeight: 8, tileHeight: 4 } }, 'r /fill: bandHeight (8) is taller than tileHeight (4)'],
      ['light out of range', { ...base, light: { azimuth: 400, elevation: 45 } }, 'r /light/azimuth: must be <= 359'],
      ['unknown field', { ...base, glow: true }, 'r /: must NOT have additional properties'],
      ['missing PNG', { ...base, medallions: { bottom: { art: { png: 'missing.png' } } } }, 'r /medallions/bottom/art/png: missing.png does not exist beside the recipe'],
    ];
    for (const [name, json, message] of cases) {
      const errors = errorsOf(json);
      expect(errors.some((e) => e.startsWith(message)), `${name}: ${JSON.stringify(errors)}`).toBe(true);
    }
  });

  describe('PNG art', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'rpg-recipe-'));
    afterAll(() => rmSync(tmp, { recursive: true, force: true }));
    const png = (name: string, w: number, h: number) => { const image = new PNG({ width: w, height: h }); image.data.fill(255); writeFileSync(path.join(tmp, name), PNG.sync.write(image)); };
    const withCorner = (name: string) => ({ ...load('thin-silver.json'), corner: { art: { png: name } } });

    it('accepts art up to the limit and rejects larger art, non-PNG files and a recipe with no folder', () => {
      png('ok.png', 20, 20); png('big.png', 24, 18);
      writeFileSync(path.join(tmp, 'fake.png'), 'not a png');
      expect(errorsOf(withCorner('ok.png'), { dir: tmp })).toEqual([]);
      expect(errorsOf(withCorner('big.png'), { dir: tmp })).toEqual(['r /corner/art/png: big.png is 24 × 18; PNG art may be at most 20 × 20']);
      expect(errorsOf(withCorner('fake.png'), { dir: tmp })).toEqual(['r /corner/art/png: fake.png is not a PNG image']);
      expect(errorsOf(withCorner('ok.png'), {})).toEqual(["r /corner/art/png: ok.png cannot be checked without the recipe's folder"]);
    });
  });
});
