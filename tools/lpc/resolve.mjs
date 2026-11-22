// Decision 0019: resolving character recipes against a local LPC folder, shared by the import tool and the design
// preview tool. The folder is in DanJen Delver's layout: source/ (the generator at the pinned revision),
// generated/catalog.json and custom-animations.json (its parts), cache/ (its PixiPPL-reduced sheets) and IMPORT.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRecipe } from './rules.mjs';
import { chooseLicence, creditFor, parseCredits } from '../../src/content/lpc/licences.mjs';

export const LPC_REVISION = '4963a69795255fb15a934c47f478a8bdcf3668f5';
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The LPC folder to read: `--lpc <folder>`, else $LPC_SOURCE, else DanJen Delver's on Ariel's machine. */
export function lpcFolder(args) {
  const at = args.indexOf('--lpc');
  return (at >= 0 ? args[at + 1] : undefined) ?? process.env.LPC_SOURCE ?? 'J:/Dungeonminusdelver/assets/lpc';
}

/** The parts catalog, reduced-cache records, pinned source hashes and per-file credits of an LPC folder. */
export function openLpc(folder) {
  const catalog = json(join(folder, 'generated', 'catalog.json'));
  if (catalog.revision !== LPC_REVISION) throw new Error(`Unexpected LPC revision ${catalog.revision}`);
  catalog.customAnimations = json(join(folder, 'generated', 'custom-animations.json')).animations;
  return {
    folder, catalog,
    records: json(join(folder, 'cache', 'manifest.json')),
    imported: new Map(json(join(folder, 'IMPORT.json')).source_files.map(f => [f.path, f.sha256])),
    credits: parseCredits(readFileSync(join(folder, 'source', 'CREDITS.csv'), 'utf8')),
  };
}

/**
 * Resolve characters ({ id, bodyType, selections, actions }) into what the manifest keeps: for each action its layers
 * (file relative to spritesheets/, the colour ramps that apply, and for oversized actions which layers are the base
 * action's), plus every file used and the ramps. A recipe the rules reject is reported as a problem, not thrown.
 */
export function resolveCharacters(lpc, list) {
  const { catalog, records } = lpc;
  const ramps = [], rampIndex = new Map(), files = new Map(), problems = [];
  // A file's cell size comes from the action that uses it: an oversized action's own layers have its frame size, every
  // other layer 64. DanJen's cache records a cell too, but it is wrong for the bow's walk_128 sheets (128-pixel frames
  // recorded and reduced as 64), so it is kept only for comparison.
  const layerRef = (call, base, cell = 64) => {
    const file = call.path.replace(/^spritesheets\//, '');
    const record = records[call.key];
    if (!record) problems.push(`${file}: not in DanJen's reduced cache`);
    const seen = files.get(file);
    if (seen && seen.cell !== cell) problems.push(`${file}: used with both ${seen.cell}- and ${cell}-pixel frames`);
    files.set(file, { key: call.key, cell, danjenCell: record?.cell ?? null });
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
  for (const character of list) {
    const recipe = { bodyType: character.bodyType, selections: character.selections };
    const actions = {};
    try {
      for (const action of character.actions) {
        const custom = catalog.customAnimations[action];
        if (custom) {
          // An oversized action (DanJen node-generator frame): each frame names a base action and column. Base layers
          // come from that action without the parts that bring their own layers for this one.
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
            layers[base] = merged.map(({ c, base: isBase }) => layerRef(c, isBase, isBase ? 64 : custom.frameSize));
          }
          actions[action] = { kind: 'custom', size: custom.frameSize / 64 * 48, sourceSingleAnimation: !!custom.sourceSingleAnimation, frames, layers };
        } else {
          const config = catalog.controls.animation_configs.find(c => c.id === action);
          if (!config) throw new Error(`unknown action ${action}`);
          actions[action] = { kind: 'standard', size: 48, rows: config.direction_rows, cycle: config.cycle, layers: resolveRecipe(catalog, recipe, action).map(c => layerRef(c, false)) };
        }
      }
    } catch (error) { problems.push(`${character.id}: ${error instanceof Error ? error.message : String(error)}`); continue; }
    characters[character.id] = { bodyType: character.bodyType, selections: character.selections, actions };
  }
  return { characters, files, ramps, problems };
}

/**
 * Each file's credit and the licence we would use, by decision 0019's rule: problems for a file with no credit row or
 * no allowed licence.
 */
export function checkLicences(lpc, files) {
  const entries = new Map(), problems = [];
  for (const file of [...files.keys()].sort()) {
    const credit = creditFor(lpc.credits, file);
    if (!credit) { problems.push(`${file}: no entry in CREDITS.csv`); continue; }
    const licence = chooseLicence(credit.licences);
    if (!licence) { problems.push(`${file}: only ${credit.licences.join(' / ')} (not allowed by decision 0019)`); continue; }
    entries.set(file, { credit, licence });
  }
  return { entries, problems };
}
