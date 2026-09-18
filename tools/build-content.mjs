/** Validate everything first, then emit independently loadable, content-addressed maps. */
import { readFileSync, statSync, realpathSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { dirname, resolve, relative, sep, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGame, readMap, validateWorld } from '../src/content/validation.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) { const index = args.indexOf(name); if (index < 0) return fallback; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a path`); return resolve(args[index + 1]); }
function readJSON(file) {
  if (statSync(file).size > 262144) throw new Error(`${file}: exceeds the 256 KiB content limit`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${file}: invalid JSON: ${error.message}`); }
}
try {
  const source = realpathSync(option('--source', join(repo, 'content/games/demo')));
  const output = option('--output', join(repo, 'public/generated/content'));
  const game = readGame(readJSON(join(source, 'game.json')), 'game.json');
  const frames = Object.keys(readJSON(join(repo, 'assets/source/foundation.json')).frames);
  const maps = new Map();
  for (const entry of game.maps) {
    const file = realpathSync(resolve(source, entry.file));
    const rel = relative(source, file);
    if (rel === '..' || rel.startsWith('..' + sep) || resolve(source, rel) !== file) throw new Error(`${entry.file}: file escapes the content root`);
    const map = readMap(readJSON(file), entry.file, frames);
    if (map.id !== entry.id) throw new Error(`${entry.file} /id: expected ${entry.id}, found ${map.id}`);
    maps.set(entry.id, map);
  }
  validateWorld(game, maps);
  let tileCount = 0;
  for (const map of maps.values()) tileCount += map.width * map.height;
  console.log(`Validated ${maps.size} maps, ${tileCount} cells, ${[...maps.values()].reduce((n, m) => n + m.exits.length, 0)} exits. All spawn, frame and cross-map references resolve.`);
  if (!args.includes('--check')) {
    if (source === output || source.startsWith(output + sep) || repo === output || repo.startsWith(output + sep)) throw new Error('Output may not replace the source directory or its ancestors');
    // A validation failure above leaves the previously generated pack untouched.
    mkdirSync(dirname(output), {recursive: true});
    const staging = mkdtempSync(join(dirname(output), '.content-'));
    try {
      mkdirSync(join(staging, 'maps'));
      const entries = game.maps.map((entry) => {
        const text = JSON.stringify(maps.get(entry.id)) + '\n';
        const hash = createHash('sha256').update(text).digest('hex').slice(0, 12);
        const stem = basename(entry.file).replace(/(?:\.[a-f0-9]{12})?\.json$/, '');
        const file = `maps/${stem}.${hash}.json`;
        writeFileSync(join(staging, file), text);
        return {id: entry.id, file};
      });
      writeFileSync(join(staging, 'game.json'), JSON.stringify({...game, maps: entries}) + '\n');
      rmSync(output, {recursive: true, force: true});
      renameSync(staging, output);
    } finally { rmSync(staging, {recursive: true, force: true}); }
    console.log('Emitted a compact manifest and individual hashed map files; no world bundle.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
