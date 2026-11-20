#!/usr/bin/env node
// Decision 0019 (roadmap S1.5a): import the LPC sheets our character recipes use.
//
//   npm run lpc:import -- [--lpc <folder>]
//
// <folder> is a prepared LPC folder in DanJen Delver's layout, default $LPC_SOURCE or J:/Dungeonminusdelver/assets/lpc:
// source/ (the Universal LPC Spritesheet Character Generator at the pinned revision), generated/catalog.json and
// generated/custom-animations.json (its parts, indexed), cache/ (its PixiPPL-reduced sheets) and IMPORT.json (source
// hashes). Each recipe in assets/source/lpc/recipes.json is resolved here with DanJen's rules. Every file it uses must
// offer an allowed licence (src/content/lpc/licences.mjs), or nothing is written. The tool then writes, under
// assets/source/lpc/:
//   sheets/<path>   the source sheets used, byte for byte
//   manifest.json   per file: hash, size, cell, chosen licence and credits; per character and action: the resolved
//                   layers and colour ramps; references from DanJen's reduced cache and generator, which the tests
//                   compare our bake against
//   CREDITS.md      the credits, per file
// The generator's own part definitions (GPL-3.0) stay in the local checkout; only what our recipes resolve to is kept.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { resolveRecipe } from './rules.mjs';
import { chooseLicence, creditFor, parseCredits } from '../../src/content/lpc/licences.mjs';
import { LPC_DIRECTIONS, rgbaHash } from '../../src/content/lpc/bake.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(repo, 'assets', 'source', 'lpc');
const args = process.argv.slice(2);
const flag = (name) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const lpc = flag('--lpc') ?? process.env.LPC_SOURCE ?? 'J:/Dungeonminusdelver/assets/lpc';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, text); renameSync(`${path}.tmp`, path); };

const recipes = json(join(out, 'recipes.json'));
const catalog = json(join(lpc, 'generated', 'catalog.json'));
catalog.customAnimations = json(join(lpc, 'generated', 'custom-animations.json')).animations;
const records = json(join(lpc, 'cache', 'manifest.json'));
const imported = new Map(json(join(lpc, 'IMPORT.json')).source_files.map(f => [f.path, f.sha256]));
const credits = parseCredits(readFileSync(join(lpc, 'source', 'CREDITS.csv'), 'utf8'));
if (catalog.revision !== '4963a69795255fb15a934c47f478a8bdcf3668f5') throw new Error(`Unexpected LPC revision ${catalog.revision}`);

const ramps = [], rampIndex = new Map(), files = new Map(), problems = [];
/** A resolved call as a layer reference: its file (relative to spritesheets/) and the ramps that recolour it. */
const layerRef = (call, base) => {
  const file = call.path.replace(/^spritesheets\//, '');
  const record = records[call.key];
  if (!record) problems.push(`${file}: not in DanJen's reduced cache`);
  files.set(file, { key: call.key, cell: record?.cell ?? 64 });
  const used = [];
  for (const m of call.mappings) {
    if (JSON.stringify(m.source) === JSON.stringify(m.target)) continue; // No change of colour.
    const key = JSON.stringify([m.source, m.target]);
    if (!rampIndex.has(key)) { rampIndex.set(key, ramps.length); ramps.push({ source: m.source, target: m.target }); }
    used.push(rampIndex.get(key));
  }
  return { file, ramps: used, ...(base ? { base: true } : {}) };
};

const characters = {};
for (const character of recipes.characters) {
  const recipe = { bodyType: character.bodyType, selections: character.selections };
  const actions = {};
  for (const action of character.actions) {
    const custom = catalog.customAnimations[action];
    if (custom) {
      // An oversized action (DanJen node-generator frame): each frame names a base action and column. Base layers come
      // from that action without the parts that bring their own layers for this one.
      const own = resolveRecipe(catalog, recipe, action);
      const baseRecipe = { ...recipe, selections: recipe.selections.filter(s => !Object.values(catalog.components[s.id]?.raw ?? {}).some(layer => layer?.custom_animation === action)) };
      const frames = custom.frames.map(row => row.map(entry => {
        const [command, column] = entry.split(',');
        const folder = command.split('-')[0];
        const base = catalog.controls.animations.find(a => (a.folder_name || a.id) === folder)?.id;
        if (!base) throw new Error(`${action}: unknown base action ${folder}`);
        return [base, Number(column)];
      }));
      const layers = {};
      for (const base of new Set(frames.flat().map(([b]) => b))) {
        const merged = [...resolveRecipe(catalog, baseRecipe, base).map(c => ({ c, base: true })), ...own.map(c => ({ c, base: false }))]
          .sort((a, b) => a.c.z - b.c.z || a.c.order - b.c.order);
        layers[base] = merged.map(({ c, base: isBase }) => layerRef(c, isBase));
      }
      actions[action] = { kind: 'custom', size: custom.frameSize / 64 * 48, sourceSingleAnimation: !!custom.sourceSingleAnimation, frames, layers };
    } else {
      const config = catalog.controls.animation_configs.find(c => c.id === action);
      if (!config) throw new Error(`${character.id}: unknown action ${action}`);
      actions[action] = { kind: 'standard', size: 48, rows: config.direction_rows, cycle: config.cycle, layers: resolveRecipe(catalog, recipe, action).map(c => layerRef(c, false)) };
    }
  }
  characters[character.id] = { bodyType: character.bodyType, selections: character.selections, actions };
}

// Every file must offer an allowed licence (decision 0019), checked per file.
const fileEntries = {};
for (const [file, { key, cell }] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
  const credit = creditFor(credits, file);
  if (!credit) { problems.push(`${file}: no entry in CREDITS.csv`); continue; }
  const licence = chooseLicence(credit.licences);
  if (!licence) { problems.push(`${file}: only ${credit.licences.join(' / ')} (not allowed by decision 0019)`); continue; }
  const bytes = readFileSync(join(lpc, 'source', 'spritesheets', file));
  const expected = imported.get(`spritesheets/${file}`);
  if (expected !== sha256(bytes)) problems.push(`${file}: hash differs from the pinned import`);
  const png = PNG.sync.read(bytes);
  // DanJen's reduced sheet for this file, as RGBA, is what our reducer must reproduce.
  const reduced = PNG.sync.read(readFileSync(join(lpc, 'cache', 'sheets', `${key}.png`)));
  fileEntries[file] = { sha256: sha256(bytes), width: png.width, height: png.height, cell, licence, offered: credit.licences,
    authors: credit.authors, urls: credit.urls, ...(credit.notes ? { notes: credit.notes } : {}),
    reference: { reducedRgbaSha256: rgbaHash({ width: reduced.width, height: reduced.height, data: new Uint8ClampedArray(reduced.data) }) } };
  fileEntries[file].bytes = bytes;
}
if (problems.length) { console.error(`LPC import refused (nothing written):\n  ${problems.join('\n  ')}`); process.exit(1); }

// Reference frames from DanJen's own generator, for the left and right rows (the battle's directions).
const generatorUrl = pathToFileURL(join(lpc, '..', '..', 'lib', 'lpc', 'node-generator.mjs'));
const { loadGenerator } = await import(generatorUrl.href);
const generator = await loadGenerator(pathToFileURL(`${lpc.replace(/[\\/]$/, '')}/`));
for (const character of recipes.characters) {
  const recipe = { bodyType: character.bodyType, selections: character.selections };
  for (const [action, spec] of Object.entries(characters[character.id].actions)) {
    const phases = spec.kind === 'standard' ? spec.cycle.length : (spec.frames[1] ?? spec.frames[0]).length;
    const frames = {};
    // Left and right where the action has them; an action with fewer rows (hurt has one) uses the rows it has.
    const rows = spec.kind === 'standard' ? spec.rows : spec.frames.length;
    const directions = rows >= 4 ? ['left', 'right'] : LPC_DIRECTIONS.slice(0, rows);
    for (const direction of directions) for (let phase = 0; phase < phases; phase++) {
      const { image } = await generator.frame(recipe, action, direction, phase);
      frames[`${direction}:${phase}`] = rgbaHash({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) });
    }
    spec.reference = { frames };
  }
}

// Write the sheets, then remove any no longer used.
const sheetsRoot = join(out, 'sheets');
for (const [file, entry] of Object.entries(fileEntries)) { mkdirSync(dirname(join(sheetsRoot, file)), { recursive: true }); writeFileSync(join(sheetsRoot, file), entry.bytes); delete entry.bytes; }
const walk = (dir) => { try { return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; }); } catch { return []; } };
for (const path of walk(sheetsRoot)) if (!fileEntries[relative(sheetsRoot, path).split('\\').join('/')]) rmSync(path);

const manifest = { schemaVersion: 1, about: 'Decision 0019: LPC sheets our character recipes use, written by tools/lpc/import.mjs. Do not edit; rerun the import.',
  generator: 'Universal LPC Spritesheet Character Generator', repository: 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator',
  revision: catalog.revision, directions: LPC_DIRECTIONS, files: fileEntries, ramps, characters };
write(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

const lines = ['# LPC art credits', '',
  'Generated by `tools/lpc/import.mjs` (decision 0019). Do not edit by hand.', '',
  `Source: the [Universal LPC Spritesheet Character Generator](${manifest.repository}) at revision \`${catalog.revision}\`. `
  + 'Every file below is used in modified form: its layers are composited with others, recoloured, and reduced to 48-pixel frames by the PixiPPL reducer. '
  + 'Each file is used under the licence named first; the other licences it is offered under are listed for reference.', ''];
for (const [file, entry] of Object.entries(fileEntries)) {
  lines.push(`- \`${file}\``, `  - Licence used: ${entry.licence} (offered: ${entry.offered.join(', ')})`, `  - Authors: ${entry.authors.join(', ')}`);
  if (entry.notes) lines.push(`  - Notes: ${entry.notes}`);
  if (entry.urls.length) lines.push(`  - Sources: ${entry.urls.join(', ')}`);
}
write(join(out, 'CREDITS.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ characters: Object.keys(characters), files: Object.keys(fileEntries).length, ramps: ramps.length }));
