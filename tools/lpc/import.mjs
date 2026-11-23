#!/usr/bin/env node
// Decision 0019 (roadmap S1.5a): import the LPC sheets our character recipes use.
//
//   npm run lpc:import -- [--lpc <folder>]
//
// <folder> is a prepared LPC folder in DanJen Delver's layout (tools/lpc/resolve.mjs), default $LPC_SOURCE or
// J:/Dungeonminusdelver/assets/lpc. Each recipe in assets/source/lpc/recipes.json is resolved with DanJen's rules. Every
// file it uses must offer an allowed licence (src/content/lpc/licences.mjs), or nothing is written. The tool then
// writes, under assets/source/lpc/:
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
import { checkLicences, lpcFolder, openLpc, resolveCharacters } from './resolve.mjs';
import { LPC_DIRECTIONS, rgbaHash } from '../../src/content/lpc/bake.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(repo, 'assets', 'source', 'lpc');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(`${path}.tmp`, text); renameSync(`${path}.tmp`, path); };
const rgba = (png) => ({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) });

const recipes = JSON.parse(readFileSync(join(out, 'recipes.json'), 'utf8'));
const lpc = openLpc(lpcFolder(process.argv.slice(2)));
const { characters, files, ramps, problems } = resolveCharacters(lpc, recipes.characters);
const licences = checkLicences(lpc, files);
problems.push(...licences.problems);

// Every file must offer an allowed licence (decision 0019), checked per file, and match the pinned source.
const fileEntries = {}, bytesOf = new Map();
const mismatched = new Set();
for (const [file, { credit, licence }] of licences.entries) {
  const { key, cell, danjenCell } = files.get(file);
  const bytes = readFileSync(join(lpc.folder, 'source', 'spritesheets', file));
  if (lpc.imported.get(`spritesheets/${file}`) !== sha256(bytes)) problems.push(`${file}: hash differs from the pinned import`);
  const png = PNG.sync.read(bytes);
  if (png.width % cell || png.height % cell) problems.push(`${file}: ${png.width}×${png.height} is not a whole number of ${cell}-pixel frames`);
  // DanJen's reduced sheet for this file, as RGBA, is what our reducer must reproduce, unless DanJen reduced it at the
  // wrong cell size: then there is no reference, and the tests check its geometry instead.
  let reference;
  if (danjenCell === cell) reference = { reducedRgbaSha256: rgbaHash(rgba(PNG.sync.read(readFileSync(join(lpc.folder, 'cache', 'sheets', `${key}.png`))))) };
  else { mismatched.add(file); reference = { note: `DanJen's cache reduced this sheet as ${danjenCell}-pixel cells, but its frames are ${cell} pixels; no cache reference` }; }
  fileEntries[file] = { sha256: sha256(bytes), width: png.width, height: png.height, cell, licence, offered: credit.licences,
    authors: credit.authors, urls: credit.urls, ...(credit.notes ? { notes: credit.notes } : {}), reference };
  bytesOf.set(file, bytes);
}
if (problems.length) { console.error(`LPC import refused (nothing written):\n  ${problems.join('\n  ')}`); process.exit(1); }

// Reference frames from DanJen's own generator, for the left and right rows (the battle's directions).
const { loadGenerator } = await import(pathToFileURL(join(lpc.folder, '..', '..', 'lib', 'lpc', 'node-generator.mjs')).href);
const generator = await loadGenerator(pathToFileURL(`${lpc.folder.replace(/[\\/]$/, '')}/`));
for (const character of recipes.characters) {
  const recipe = { bodyType: character.bodyType, selections: character.selections };
  for (const [action, spec] of Object.entries(characters[character.id].actions)) {
    // DanJen's generator draws a mis-sized sheet wrongly too, so an action using one has no generator reference.
    const layers = Array.isArray(spec.layers) ? spec.layers : Object.values(spec.layers).flat();
    const bad = layers.find(layer => mismatched.has(layer.file));
    if (bad) { spec.reference = { note: `uses ${bad.file}, which DanJen's cache and generator handle at the wrong cell size; no generator reference` }; continue; }
    const phases = spec.kind === 'standard' ? spec.cycle.length : (spec.frames[1] ?? spec.frames[0]).length;
    const frames = {};
    // Left and right where the action has them; an action with fewer rows (hurt has one) uses the rows it has.
    const rows = spec.kind === 'standard' ? spec.rows : spec.frames.length;
    const directions = rows >= 4 ? ['left', 'right'] : LPC_DIRECTIONS.slice(0, rows);
    for (const direction of directions) for (let phase = 0; phase < phases; phase++) {
      const { image } = await generator.frame(recipe, action, direction, phase);
      frames[`${direction}:${phase}`] = rgbaHash(rgba(image));
    }
    spec.reference = { frames };
  }
}

// Write the sheets, then remove any no longer used.
const sheetsRoot = join(out, 'sheets');
for (const [file, bytes] of bytesOf) { mkdirSync(dirname(join(sheetsRoot, file)), { recursive: true }); writeFileSync(join(sheetsRoot, file), bytes); }
const walk = (dir) => { try { return readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; }); } catch { return []; } };
for (const path of walk(sheetsRoot)) if (!fileEntries[relative(sheetsRoot, path).split('\\').join('/')]) rmSync(path);

const manifest = { schemaVersion: 1, about: 'Decision 0019: LPC sheets our character recipes use, written by tools/lpc/import.mjs. Do not edit; rerun the import.',
  generator: 'Universal LPC Spritesheet Character Generator', repository: 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator',
  revision: lpc.catalog.revision, directions: LPC_DIRECTIONS, files: fileEntries, ramps, characters };
write(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

// The shape the Credits screen reads (tools/library-credits.mjs): an introduction, source links, and "## Artists";
// then every file with its licence and authors.
const licencesUsed = [...new Set(Object.values(fileEntries).map(entry => entry.licence))].sort();
const artists = [...new Set(Object.values(fileEntries).flatMap(entry => entry.authors))].sort((a, b) => a.localeCompare(b));
const lines = ['# LPC art credits', '',
  'The party and the map characters are built from Liberated Pixel Cup (LPC) art, taken from the Universal LPC Spritesheet Character Generator. '
  + `Each file is used under ${licencesUsed.join(', ')}, never a share-alike licence. `
  + 'All of it is used in modified form: layers are composited, recoloured, and reduced to 48-pixel frames by the PixiPPL reducer. '
  + 'Every file\'s authors and licence are listed in the per-file credits.', '',
  `- ${manifest.repository}`, '',
  `Generated by \`tools/lpc/import.mjs\` (decision 0019) from revision \`${manifest.revision}\`. Do not edit by hand. Each file lists the licence we use first, then every licence it is offered under.`, '',
  '## Artists', '', ...artists.map(name => `- ${name}`), '', '## Files', ''];
for (const [file, entry] of Object.entries(fileEntries)) {
  lines.push(`- \`${file}\``, `  - Licence used: ${entry.licence} (offered: ${entry.offered.join(', ')})`, `  - Authors: ${entry.authors.join(', ')}`);
  if (entry.notes) lines.push(`  - Notes: ${entry.notes}`);
  if (entry.urls.length) lines.push(`  - Sources: ${entry.urls.join(', ')}`);
}
write(join(out, 'CREDITS.md'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ characters: Object.keys(characters), files: Object.keys(fileEntries).length, ramps: ramps.length }));
