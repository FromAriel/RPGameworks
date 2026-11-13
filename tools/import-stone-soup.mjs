/**
 * Stone Soup monster library (decision 0015 C1). Dungeon Crawl Stone Soup's 32 × 32 monster tiles are public domain
 * (CC0 1.0) and are the one exception to decision 0007: they are committed under assets/source/creatures/stone-soup/.
 *
 *   node tools/import-stone-soup.mjs --from <library root> [--compare <library root>]
 *       copy every PNG under <root>/dcss/monster/ and write library.json (one SHA-256 per monster ID); with
 *       --compare, also require every file to match a second copy (for example Ariel's DanJen Delver library)
 *   node tools/import-stone-soup.mjs --check
 *       verify the committed library against library.json: no file missing, extra or changed
 *
 * Monster IDs keep the Stone Soup paths, for example dcss/monster/undead/skeletal_warrior_new, so Ariel's motion
 * assignments from Splurt line up. Tool code: the game never imports it.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIBRARY_ROOT = path.join(REPO, 'assets/source/creatures/stone-soup');
export const MANIFEST = path.join(LIBRARY_ROOT, 'library.json');
const MONSTERS = 'dcss/monster';

const sha256 = (/** @type {Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex');
/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
/** Monster IDs (path without .png, forward slashes) under a library root, sorted. @param {string} root */
export function libraryIds(root) {
  const base = path.join(root, MONSTERS);
  return walk(base).filter((f) => f.endsWith('.png'))
    .map((f) => `${MONSTERS}/${path.relative(base, f).split(path.sep).join('/').replace(/\.png$/, '')}`).sort();
}
/** @param {string} root @param {string} id */
export const fileOf = (root, id) => path.join(root, `${id}.png`);

/**
 * Compare the committed library with its manifest.
 * @returns {{ missing: string[], extra: string[], changed: string[], count: number }}
 */
export function checkLibrary(root = LIBRARY_ROOT) {
  const manifest = /** @type {{ files: Record<string, string> }} */ (JSON.parse(readFileSync(path.join(root, 'library.json'), 'utf8')));
  const listed = Object.keys(manifest.files), present = new Set(libraryIds(root));
  return {
    missing: listed.filter((id) => !present.has(id)),
    extra: [...present].filter((id) => !(id in manifest.files)),
    changed: listed.filter((id) => present.has(id) && sha256(readFileSync(fileOf(root, id))) !== manifest.files[id]),
    count: listed.length,
  };
}

/** @param {string} from @param {string | undefined} compare */
function importLibrary(from, compare) {
  const ids = libraryIds(from);
  if (!ids.length) throw new Error(`No PNGs under ${path.join(from, MONSTERS)}`);
  /** @type {Record<string, string>} */ const files = {};
  for (const id of ids) {
    const bytes = readFileSync(fileOf(from, id));
    files[id] = sha256(bytes);
    if (compare) {
      const other = fileOf(compare, id);
      if (!existsSync(other)) throw new Error(`${id} is missing from ${compare}`);
      if (sha256(readFileSync(other)) !== files[id]) throw new Error(`${id} differs between ${from} and ${compare}`);
    }
  }
  if (compare && libraryIds(compare).length !== ids.length) throw new Error(`${compare} has a different number of monsters`);
  for (const id of ids) {
    const target = fileOf(LIBRARY_ROOT, id);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(fileOf(from, id), target);
  }
  const manifest = {
    format: 'rpgameworks.stone-soup-library', formatVersion: 1,
    licence: 'CC0-1.0', source: 'Dungeon Crawl Stone Soup 32x32 tiles (Full pack and October 2010 crawl-tiles release); see CREDITS.md',
    count: ids.length, files,
  };
  writeFileSync(`${MANIFEST}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(`${MANIFEST}.tmp`, MANIFEST);
  return ids.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (/** @type {string} */ name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--check')) {
    const result = checkLibrary();
    const problems = [...result.missing.map((id) => `missing ${id}`), ...result.extra.map((id) => `not in library.json: ${id}`), ...result.changed.map((id) => `changed ${id}`)];
    for (const problem of problems.slice(0, 20)) console.error(problem);
    console.log(problems.length ? `${problems.length} problem(s) in the Stone Soup library.` : `Stone Soup library verified: ${result.count} monsters match library.json.`);
    process.exitCode = problems.length ? 1 : 0;
  } else {
    const from = option('--from');
    if (!from) { console.error('Usage: node tools/import-stone-soup.mjs --from <library root> [--compare <library root>] | --check'); process.exitCode = 1; }
    else console.log(`Imported ${importLibrary(path.resolve(from), option('--compare') && path.resolve(/** @type {string} */ (option('--compare'))))} Stone Soup monsters into ${path.relative(REPO, LIBRARY_ROOT)}.`);
  }
}
