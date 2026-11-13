import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { LIBRARY_ROOT, checkLibrary, fileOf, libraryIds } from '../../tools/import-stone-soup.mjs';

/** Decision 0015 C1: the committed public-domain Stone Soup monster library matches its manifest and its credits. */
describe('Stone Soup monster library (decision 0015 C1)', () => {
  it('matches library.json exactly: 1,282 monsters, none missing, extra or changed', () => {
    const result = checkLibrary();
    expect({ missing: result.missing, extra: result.extra, changed: result.changed }).toEqual({ missing: [], extra: [], changed: [] });
    expect(result.count).toBe(1282);
  });

  it('every monster is a 32 × 32 RGBA PNG with a Stone Soup ID', () => {
    const ids = libraryIds(LIBRARY_ROOT);
    expect(ids).toHaveLength(1282);
    expect(ids).toContain('dcss/monster/undead/skeletal_warrior_new');
    const bad = ids.filter((id) => {
      if (!/^dcss\/monster\/[a-z0-9_/-]+$/i.test(id)) return true;
      const png = PNG.sync.read(readFileSync(fileOf(LIBRARY_ROOT, id)));
      return png.width !== 32 || png.height !== 32 || png.data.length !== 32 * 32 * 4;
    });
    expect(bad).toEqual([]);
  });

  it('ships the CC0 licence, both pack readmes and the artist credits', () => {
    for (const file of ['licences/CC0-1.0.txt', 'licences/dcss-full-README.txt', 'licences/crawl-tiles-2010-README.txt', 'CREDITS.md', 'README.md']) {
      expect(existsSync(path.join(LIBRARY_ROOT, file)), file).toBe(true);
    }
    expect(readFileSync(path.join(LIBRARY_ROOT, 'licences/CC0-1.0.txt'), 'utf8')).toContain('Works under CC0 do not require attribution');
    expect(readFileSync(path.join(LIBRARY_ROOT, 'CREDITS.md'), 'utf8')).toContain('Eino Keskitalo');
    expect(readFileSync('NOTICE', 'utf8')).toContain('assets/source/creatures/stone-soup/');
  });
});
