import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROOT, OUTPUTS, bakeAll } from '../../tools/skin-bake/skins.ts';

/**
 * Decision 0013 B3 acceptance: one command bakes all recipes; a broken recipe fails with its file and message and leaves
 * the other outputs untouched; --check catches a stale output. Also guards that the committed skins match their recipes.
 */
const root = mkdtempSync(path.join(tmpdir(), 'rpg-skin-batch-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function recipeFolder(name: string, recipe: string): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  cpSync(recipe, path.join(dir, 'recipe.json'));
  return dir;
}

describe('npm run skins (decision 0013 B3)', () => {
  const good = recipeFolder('a-thin', 'tests/fixtures/recipes/thin-silver.json');
  const iron = recipeFolder('b-iron', 'tests/fixtures/recipes/riveted-iron.json');
  const broken = path.join(root, 'c-broken');
  mkdirSync(broken);
  writeFileSync(path.join(broken, 'recipe.json'), JSON.stringify({ ...JSON.parse(readFileSync('tests/fixtures/recipes/thin-silver.json', 'utf8')), corner: { art: { library: 'dragon' } } }));
  writeFileSync(path.join(broken, 'Window.png'), 'an older bake');
  mkdirSync(path.join(root, 'd-no-recipe'));

  it('bakes every recipe, reports a broken one with its file and message, and leaves its outputs untouched', () => {
    const results = bakeAll(root);
    expect(results.map((r) => [r.name, r.status])).toEqual([['a-thin', 'baked'], ['b-iron', 'baked'], ['c-broken', 'failed']]);
    expect(results[2]!.message).toContain(`${path.join(broken, 'recipe.json')} /corner/art/library: unknown art "dragon"`);
    for (const dir of [good, iron]) for (const out of OUTPUTS) expect(existsSync(path.join(dir, out)), `${dir} ${out}`).toBe(true);
    expect(readFileSync(path.join(broken, 'Window.png'), 'utf8')).toBe('an older bake');
    expect(existsSync(path.join(broken, 'Window.manifest.json'))).toBe(false);
    const audit = JSON.parse(readFileSync(path.join(good, 'Window.audit.json'), 'utf8')) as { version: number; gutterNontransparent: number };
    expect(audit).toMatchObject({ version: 2, gutterNontransparent: 0 });
  });

  it('writes nothing when the skins are up to date, and --check catches a stale or missing output without writing', () => {
    expect(bakeAll(root).slice(0, 2).map((r) => r.status)).toEqual(['same', 'same']);
    expect(bakeAll(root, { check: true }).slice(0, 2).map((r) => r.status)).toEqual(['same', 'same']);

    const manifest = path.join(good, 'Window.manifest.json');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"Thin Silver (example)"', '"Hand edited"'));
    rmSync(path.join(iron, 'Window.audit.json'));
    const checked = bakeAll(root, { check: true });
    expect(checked.slice(0, 2).map((r) => r.message)).toEqual([
      'a-thin: Window.manifest.json is missing or out of date; run npm run skins',
      'b-iron: Window.audit.json is missing or out of date; run npm run skins',
    ]);
    expect(readFileSync(manifest, 'utf8')).toContain('"Hand edited"');
    expect(existsSync(path.join(iron, 'Window.audit.json'))).toBe(false);

    expect(bakeAll(root).slice(0, 2).map((r) => r.status)).toEqual(['baked', 'baked']);
    expect(bakeAll(root, { check: true }).slice(0, 2).map((r) => r.status)).toEqual(['same', 'same']);
  });

  it('keeps the committed skins in step with their recipes', () => {
    const results = bakeAll(DEFAULT_ROOT, { check: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.status !== 'same').map((r) => r.message)).toEqual([]);
  });
});
