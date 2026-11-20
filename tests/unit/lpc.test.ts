import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { ALLOWED_LICENCES, chooseLicence, creditFor, parseCredits } from '../../src/content/lpc/licences.mjs';
import { bakeFrame, reduceSheet, rgbaHash } from '../../src/content/lpc/bake.mjs';

/**
 * Decision 0019 S1.5a: the committed LPC sheets, their licences and credits, and our port of DanJen Delver's reducer
 * and compositing, checked against references taken from DanJen's own reduced cache and generator at import time.
 * Everything here reads committed files only.
 */
const ROOT = 'assets/source/lpc';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8'));
const reduction = JSON.parse(readFileSync(`${ROOT}/reduction.json`, 'utf8'));
const decode = (file: string) => { const png = PNG.sync.read(readFileSync(`${ROOT}/sheets/${file}`)); return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }; };
const reducedCache = new Map<string, ReturnType<typeof reduceSheet>>();
const reduced = (file: string) => {
  let sheet = reducedCache.get(file);
  if (!sheet) { sheet = reduceSheet(decode(file), manifest.files[file].cell, reduction); reducedCache.set(file, sheet); }
  return sheet;
};

describe('LPC licences', () => {
  it('allows CC0, CC-BY and OGA-BY, picking the most permissive offered, and refuses share-alike or GPL only', () => {
    expect(chooseLicence(['OGA-BY 3.0', 'CC-BY-SA 3.0', 'GPL 3.0'])).toBe('OGA-BY 3.0');
    expect(chooseLicence(['CC-BY 4.0', 'CC0'])).toBe('CC0');
    expect(chooseLicence(['GPL 3.0', ' CC-BY 3.0 '])).toBe('CC-BY 3.0');
    expect(chooseLicence(['CC-BY-SA 3.0'])).toBeNull();
    expect(chooseLicence(['CC-BY-SA 3.0', 'GPL 3.0'])).toBeNull();
    expect(ALLOWED_LICENCES).not.toContain('CC-BY-SA 3.0');
  });

  it('reads the generator\'s per-file credits, with quoted commas, and finds a variant\'s credit through its sheet or agreeing folder rows', () => {
    const credits = parseCredits([
      'filename,notes,authors,licenses,urls',
      '"body/walk.png","a note, with a comma" ,"A, B" ,"OGA-BY 3.0,GPL 3.0" ,"https://a,https://b"',
      '"sword/big/bg/walk.png","" ,"C" ,"OGA-BY 3.0" ,""',
      '"sword/big/bg/slash.png","" ,"C" ,"OGA-BY 3.0" ,""',
      '"mixed/fg/walk.png","" ,"D" ,"OGA-BY 3.0" ,""',
      '"mixed/fg/slash.png","" ,"E" ,"CC-BY-SA 3.0" ,""',
    ].join('\r\n'));
    expect(credits.get('body/walk.png')).toEqual({ notes: 'a note, with a comma', authors: ['A', 'B'], licences: ['OGA-BY 3.0', 'GPL 3.0'], urls: ['https://a', 'https://b'] });
    expect(creditFor(credits, 'body/walk/iron.png')?.authors).toEqual(['A', 'B']); // A colour variant of an animation.
    expect(creditFor(credits, 'sword/big/bg/iron.png')?.authors).toEqual(['C']); // An oversized action's variant: its folder agrees.
    expect(creditFor(credits, 'mixed/fg/iron.png')).toBeNull(); // Folder rows disagree: refused.
    expect(creditFor(credits, 'nowhere/x.png')).toBeNull();
  });
});

describe('the committed LPC sheets', () => {
  const files = Object.entries(manifest.files) as [string, { sha256: string; licence: string; offered: string[]; authors: string[]; cell: number; width: number; height: number }][];
  it('come from the pinned revision, each with its hash, an allowed licence it is offered under, and authors', () => {
    expect(manifest.revision).toBe('4963a69795255fb15a934c47f478a8bdcf3668f5');
    expect(files.length).toBeGreaterThan(0);
    for (const [file, entry] of files) {
      const bytes = readFileSync(`${ROOT}/sheets/${file}`);
      expect(createHash('sha256').update(bytes).digest('hex'), file).toBe(entry.sha256);
      expect(ALLOWED_LICENCES, file).toContain(entry.licence);
      expect(entry.offered, file).toContain(entry.licence);
      expect(entry.authors.length, file).toBeGreaterThan(0);
      expect(entry.width % entry.cell + entry.height % entry.cell, file).toBe(0);
    }
  });

  it('are all credited in CREDITS.md, and every layer of every character names a committed sheet and real ramps', () => {
    const creditsText = readFileSync(`${ROOT}/CREDITS.md`, 'utf8');
    for (const [file, entry] of files) {
      expect(creditsText, file).toContain(`\`${file}\``);
      expect(creditsText, file).toContain(`Licence used: ${entry.licence}`);
    }
    for (const character of Object.values(manifest.characters) as { actions: Record<string, { layers: unknown }> }[]) {
      for (const spec of Object.values(character.actions)) {
        const layers = (Array.isArray(spec.layers) ? spec.layers : Object.values(spec.layers as object).flat()) as { file: string; ramps: number[] }[];
        for (const layer of layers) {
          expect(existsSync(`${ROOT}/sheets/${layer.file}`), layer.file).toBe(true);
          for (const ramp of layer.ramps) expect(manifest.ramps[ramp], layer.file).toBeDefined();
        }
      }
    }
    // Only what recipes resolve to: no generator part definitions.
    expect(JSON.stringify(manifest)).not.toContain('"raw"');
  });
});

describe('reduction and compositing (ports of DanJen Delver\'s)', () => {
  it('reduces every committed sheet exactly as DanJen\'s cache did', () => {
    for (const [file, entry] of Object.entries(manifest.files) as [string, { reference: { reducedRgbaSha256: string } }][]) {
      expect(rgbaHash(reduced(file)), file).toBe(entry.reference.reducedRgbaSha256);
    }
  }, 120_000);

  it('composites every reference frame exactly as DanJen\'s generator did, including recoloured and oversized ones', () => {
    let checked = 0;
    for (const [id, character] of Object.entries(manifest.characters) as [string, { actions: Record<string, { reference: { frames: Record<string, string> } }> }][]) {
      for (const [action, spec] of Object.entries(character.actions)) {
        for (const [key, expected] of Object.entries(spec.reference.frames)) {
          const [direction, phase] = key.split(':');
          expect(rgbaHash(bakeFrame(manifest, id, action, direction!, Number(phase), reduced, reduction.finalAlphaThreshold)), `${id} ${action} ${key}`).toBe(expected);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(manifest.ramps.length).toBeGreaterThan(0); // The probe is recoloured, so ramps are exercised.
    expect(manifest.characters.probe.actions.slash_128).toMatchObject({ kind: 'custom', size: 96 });
  }, 120_000);
});
