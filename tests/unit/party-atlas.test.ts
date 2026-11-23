import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { PORTRAIT, bakePartyAtlas, memberActions } from '../../src/content/party-atlas.mjs';
import { reduceSheet, rgbaHash } from '../../src/content/lpc/bake.mjs';

/** Decision 0019 S1.5c: the party's LPC characters baked into one atlas by the content build, from committed files. */
const ROOT = 'assets/source/lpc';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8'));
const reduction = JSON.parse(readFileSync(`${ROOT}/reduction.json`, 'utf8'));
const party = JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')) as { members: { id: string; art?: string }[] };
const cache = new Map<string, ReturnType<typeof reduceSheet>>();
const reduced = (file: string) => {
  let sheet = cache.get(file);
  if (!sheet) {
    const png = PNG.sync.read(readFileSync(`${ROOT}/sheets/${file}`));
    sheet = reduceSheet({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }, manifest.files[file].cell, reduction);
    cache.set(file, sheet);
  }
  return sheet;
};
const members = party.members.filter(m => m.art).map(m => ({ id: m.id, character: m.art! }));
const bake = () => bakePartyAtlas(manifest, members, { reduced, threshold: reduction.finalAlphaThreshold, image: 'party-art.png' });
const baked = bake();
const opaque = (name: string) => {
  const r = baked.table.frames[name]!;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (baked.atlas.data[((r.y + y) * baked.atlas.width + r.x + x) * 4 + 3]) return true;
  return false;
};

describe('the party atlas', () => {
  it('draws every demo party member from an LPC character the recipes define', () => {
    expect(members.map(m => m.id)).toEqual(['hero', 'archer', 'lancer', 'mage']);
    for (const m of members) expect(manifest.characters[m.character], m.id).toBeDefined();
    expect(Object.keys(baked.table.members)).toEqual(['hero', 'archer', 'lancer', 'mage']);
  });

  it('is deterministic, and every frame lies inside the atlas and has pixels', () => {
    expect(rgbaHash(bake().atlas)).toBe(rgbaHash(baked.atlas));
    const { width, height } = baked.table.size;
    for (const [name, r] of Object.entries(baked.table.frames)) {
      expect(r.x >= 1 && r.y >= 1 && r.x + r.w < width && r.y + r.h < height, name).toBe(true);
      expect(opaque(name), name).toBe(true);
    }
  });

  it('gives each member a walk and an attack facing both ways, hurt, a standing frame each way and an upper-body portrait', () => {
    const expected = { hero: ['walk', 'slash_128', 96], archer: ['walk_128', 'shoot', 48], lancer: ['walk', 'slash_128', 96], mage: ['walk', 'spellcast', 48] } as const;
    for (const [id, [walk, attack, attackSize]] of Object.entries(expected)) {
      const art = baked.table.members[id]!;
      expect([art.walk.action, art.attack.action, art.attack.size], id).toEqual([walk, attack, attackSize]);
      for (const anim of [art.walk, art.attack]) {
        expect(anim.left!.length, `${id} ${anim.action}`).toBe(anim.right!.length);
        expect(anim.left!.length).toBeGreaterThan(0);
        expect(anim.anchor).toEqual({ x: anim.size / 2, y: anim.size / 2 + 16 }); // Feet at (24, 40) in a 48-pixel frame.
      }
      expect(art.hurt.front!.length, id).toBe(6); // LPC's hurt is a single row.
      expect([art.stand.left, art.stand.right]).toEqual([art.walk.left![0], art.walk.right![0]]); // No idle: the walk's first frame.
      expect(baked.table.frames[art.portrait]).toMatchObject({ w: PORTRAIT, h: PORTRAIT });
    }
  });

  it('needs one walk, one attack and hurt per character', () => {
    expect(memberActions('x', { walk: {}, shoot: {}, hurt: {} })).toEqual({ walk: 'walk', attack: 'shoot', hurt: 'hurt' });
    expect(() => memberActions('x', { walk: {}, hurt: {} })).toThrow('needs one walk, one attack and hurt');
    expect(() => memberActions('x', { walk: {}, slash_128: {}, shoot: {}, hurt: {} })).toThrow('needs one walk');
    expect(() => bakePartyAtlas(manifest, [{ id: 'thief', character: 'thief' }], { reduced, threshold: 128, image: 'x.png' })).toThrow('no LPC character thief');
  });
});
