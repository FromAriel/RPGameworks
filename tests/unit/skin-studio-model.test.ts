import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyFlair, parseProfile, parseRamp, recipeText, withBand } from '../../tools/skin-studio/studio-model';
import type { Draft } from '../../tools/skin-studio/studio-model';
import { readRecipe } from '../../tools/skin-bake/recipe.mjs';

/** Decision 0013 B4: the studio's edits keep the recipe an ordinary, explicit recipe (flair is a shortcut, B4-Q2). */
const iron = JSON.parse(readFileSync('tests/fixtures/recipes/riveted-iron.json', 'utf8')) as Draft;

describe('skin studio edits (decision 0013 B4)', () => {
  it('flair subtle drops the motif and medallions, off also plain corners, and full restores the recipe’s own', () => {
    const subtle = applyFlair(iron, iron, 'subtle');
    expect(subtle.motif).toBeUndefined();
    expect(subtle.medallions).toBeUndefined();
    expect(subtle.corner).toEqual(iron.corner);
    const off = applyFlair(subtle, iron, 'off');
    expect(off.corner).toEqual({ art: { library: 'notch' }, size: 'small' });
    expect(applyFlair(off, iron, 'full')).toEqual(iron);
    for (const draft of [subtle, off]) {
      const read = readRecipe(draft, { dir: 'tests/fixtures/recipes' });
      expect(read.ok ? [] : read.errors).toEqual([]);
    }
    expect(iron.motif, 'the original is not changed').toBeDefined();
  });

  it('parses bevels and colour ramps, and rejects what a recipe cannot hold', () => {
    expect(parseProfile('3 2')).toEqual([3, 2]);
    expect(parseProfile(' 1, 3,4 ')).toEqual([1, 3, 4]);
    for (const bad of ['', '3 x', '10', '-1']) expect(parseProfile(bad), bad).toBeNull();
    expect(parseRamp('')).toBeUndefined();
    expect(parseRamp('#A9B0BA, #ffffff')).toEqual(['#a9b0ba', '#ffffff']);
    expect(parseRamp('#fff #000000')).toBeNull();
  });

  it('sets every side’s band and saves two-space JSON with a final newline', () => {
    expect(withBand(iron, 5).band).toEqual({ top: 5, right: 5, bottom: 5, left: 5 });
    expect(recipeText(iron)).toBe(`${JSON.stringify(iron, null, 2)}\n`);
  });
});
