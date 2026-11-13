import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { bakeCreatureAtlas, creatureKey } from '../../src/content/creature-atlas.mjs';
import type { MotionStyles, Rgba } from '../../src/content/creature-pose.mjs';
import { readEncounters } from '../../src/content/validation.mjs';
import { LIBRARY_ROOT, fileOf } from '../../tools/import-stone-soup.mjs';

/** Decision 0015 C3: the content build's creature atlas, and the encounter fields that ask for creatures. */
const styles = JSON.parse(readFileSync('assets/source/creatures/motion-styles.json', 'utf8')) as MotionStyles;
const assignments = (JSON.parse(readFileSync('assets/source/creatures/motion-assignments.json', 'utf8')) as { assignments: Record<string, string> }).assignments;
const tile = (id: string): Rgba => { const png = PNG.sync.read(readFileSync(fileOf(LIBRARY_ROOT, id))); return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }; };
const GOLEM = 'dcss/monster/nonliving/clay_golem', BAT = 'dcss/monster/animals/bat';
const bake = (wanted: { id: string; faces: 'left' | 'right' }[]) => bakeCreatureAtlas(wanted, { tile, styles, assignments, image: 'creatures.png' });

describe('creature atlas (decision 0015 C3)', () => {
  it('bakes a still frame, the walk and idle loops and a flash for each creature in use, merging duplicates', () => {
    const { atlas, table } = bake([{ id: GOLEM, faces: 'left' }, { id: BAT, faces: 'left' }, { id: GOLEM, faces: 'left' }]);
    expect(Object.keys(table.creatures)).toEqual([creatureKey(BAT, 'left'), creatureKey(GOLEM, 'left')]);
    const golem = table.creatures[creatureKey(GOLEM, 'left')]!, bat = table.creatures[creatureKey(BAT, 'left')]!;
    expect([golem.style, golem.walk.length, golem.idle.length, golem.idleMs]).toEqual(['walk', 4, 2, 650]);
    expect([bat.style, bat.walk.length, bat.idle.length, bat.idleMs]).toEqual(['hover', 4, 6, 200]);
    expect(Object.keys(table.frames)).toHaveLength(20);
    for (const r of Object.values(table.frames)) {
      expect([r.w, r.h]).toEqual([40, 40]);
      expect(r.x + r.w <= atlas.width && r.y + r.h <= atlas.height).toBe(true);
    }
    expect(table.size).toEqual({ width: atlas.width, height: atlas.height });
  });

  it('gives the same pixels every time, and a separate entry per facing', () => {
    const a = bake([{ id: GOLEM, faces: 'left' }]), b = bake([{ id: GOLEM, faces: 'left' }]);
    expect(Buffer.from(a.atlas.data).equals(Buffer.from(b.atlas.data))).toBe(true);
    expect(Object.keys(bake([{ id: BAT, faces: 'left' }, { id: BAT, faces: 'right' }]).table.creatures)).toHaveLength(2);
  });

  it('the flash is the body in white with no shadow, and the still frame is the tile itself', () => {
    const { atlas, table } = bake([{ id: BAT, faces: 'left' }]);
    const bat = table.creatures[creatureKey(BAT, 'left')]!, art = tile(BAT), pad = styles.pad;
    const pixel = (name: string, x: number, y: number) => { const r = table.frames[name]!; const i = ((r.y + y) * atlas.width + r.x + x) * 4; return [...atlas.data.subarray(i, i + 4)]; };
    let shadowSeen = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const source = [...art.data.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
      expect(pixel(bat.still, x + pad, y + pad)).toEqual(source);
      const flash = pixel(bat.flash, x + pad, y + pad);
      if (flash[3]) expect(flash.slice(0, 3)).toEqual([255, 255, 255]);
      else if (source[3]) shadowSeen += 1; // A drawn pixel left out of the flash: the planted shadow.
    }
    expect(shadowSeen).toBeGreaterThan(0);
  });

  it('refuses a creature with no motion assignment', () => {
    expect(() => bakeCreatureAtlas([{ id: GOLEM, faces: 'left' }], { tile, styles, assignments: {}, image: 'x.png' })).toThrow(`${GOLEM} has no motion assignment`);
  });

  it('content rejects creatures on the party, unknown creatures, and a facing without a creature', () => {
    const fighter = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, frame: 'sigil', hp: 10, attack: 3, defense: 0, speed: 5, ...extra });
    const errors = (party: unknown[], enemies: unknown[]) => {
      try { readEncounters({ schemaVersion: 2, encounters: [{ id: 'demo:encounter.c', name: 'c', seed: 1, party, enemies }] }, 'e.json', undefined, new Set([GOLEM])); return []; }
      catch (error) { return (error as { issues: { path: string; message: string }[] }).issues.map(i => `${i.path}: ${i.message}`); }
    };
    expect(errors([fighter('hero', { creature: GOLEM })], [fighter('x')])).toEqual(['/encounters/0/party/0/creature: Only enemies use Stone Soup creatures for now']);
    expect(errors([fighter('hero')], [fighter('x', { creature: BAT })])).toEqual(['/encounters/0/enemies/0/creature: Unknown creature: not in the Stone Soup library or without a motion assignment']);
    expect(errors([fighter('hero')], [fighter('x', { faces: 'right' })])).toEqual(['/encounters/0/enemies/0/faces: faces is only used with a creature']);
    expect(errors([fighter('hero')], [fighter('x', { creature: GOLEM, faces: 'right' })])).toEqual([]);
  });
});
