/** Validate everything first, then emit independently loadable, content-addressed maps. */
import { readFileSync, statSync, realpathSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { dirname, resolve, relative, sep, join, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readGame, readMap, readItems, readFacts, readQuests, validateMapFacts, validateMapDialogues, validateWorld } from '../src/content/validation.mjs';
import { createAuthoringReport } from './authoring-report.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) { const index = args.indexOf(name); if (index < 0) return fallback; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a path`); return resolve(args[index + 1]); }
function within(parent, child) { const rel = relative(parent, child); return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)); }
function readJSON(file) {
  if (statSync(file).size > 262144) throw new Error(`${file}: exceeds the 256 KiB content limit`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${file}: invalid JSON: ${error.message}`); }
}
try {
  const source = realpathSync(option('--source', join(repo, 'content/games/demo')));
  const output = option('--output', join(repo, 'public/generated/content'));
  const reportPath = option('--report-json', undefined);
  if (reportPath && !args.includes('--check')) throw new Error('--report-json requires --check');
  if (reportPath && [source, output, join(repo, 'public'), join(repo, 'dist')].some(root => within(root, reportPath))) throw new Error('--report-json must be outside source, generated content, public, and dist');
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
  let catalogData = {schemaVersion:1, capacity:32, items:[], strings:{en:{}}};
  if (game.itemsFile) {
    const file = realpathSync(join(source,game.itemsFile));
    const rel = relative(source,file);
    if (rel === '..' || rel.startsWith('..' + sep)) throw new Error(`${game.itemsFile}: file escapes the content root`);
    catalogData = readJSON(file);
  }
  const catalog = readItems(catalogData);
  let factsData={schemaVersion:1,facts:[]};
  if(game.factsFile){
    const file=realpathSync(join(source,game.factsFile));const rel=relative(source,file);
    if(rel==='..'||rel.startsWith('..'+sep))throw new Error(`${game.factsFile}: file escapes the content root`);
    factsData=readJSON(file);
  }
  const facts=readFacts(factsData);
  let questsData={schemaVersion:1,quests:[]};
  if(game.questsFile){const file=realpathSync(join(source,game.questsFile));const rel=relative(source,file);if(rel==='..'||rel.startsWith('..'+sep))throw new Error(`${game.questsFile}: file escapes the content root`);questsData=readJSON(file);}
  const quests=readQuests(questsData);
  for(const [id,map] of maps){validateMapFacts(map,facts,game.maps.find(entry=>entry.id===id)?.file??id);}
  for(const [id,map] of maps){validateMapDialogues(map,quests.quests,catalog,facts,game.maps.find(entry=>entry.id===id)?.file??id);}
  validateWorld(game, maps, catalog);
  let tileCount = 0;
  for (const map of maps.values()) tileCount += map.width * map.height;
  console.log(`Validated ${maps.size} maps, ${tileCount} cells, ${[...maps.values()].reduce((n, m) => n + m.exits.length, 0)} exits. All spawn, frame and cross-map references resolve.`);
  if (args.includes('--check')) {
    const report = createAuthoringReport(game, maps, catalog, facts, quests);
    console.log(`Authoring report: ${report.summary.definitions} definitions, ${report.summary.references} references, ${report.summary.warnings} advisory findings. Structural paths do not prove gameplay solvability.`);
    for (const warning of report.warnings.slice(0, 20)) console.log(`  warning ${warning.file} [${warning.id}] ${warning.path}: ${warning.message}`);
    if (report.warnings.length > 20) console.log(`  ... ${report.warnings.length - 20} more advisory findings in the JSON report`);
    if (reportPath) {
      mkdirSync(dirname(reportPath), {recursive: true});
      writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
      console.log(`Wrote authoring report to ${reportPath}`);
    }
  }
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
      let itemsFile;
      if (game.itemsFile) {
        const text = JSON.stringify(catalog) + '\n';
        itemsFile = `items.${createHash('sha256').update(text).digest('hex').slice(0,12)}.json`;
        writeFileSync(join(staging, itemsFile), text);
      }
      let factsFile;
      if(game.factsFile){const text=JSON.stringify(facts)+'\n';factsFile=`facts.${createHash('sha256').update(text).digest('hex').slice(0,12)}.json`;writeFileSync(join(staging,factsFile),text);}
      let questsFile;
      if(game.questsFile){const text=JSON.stringify(quests)+'\n';questsFile=`quests.${createHash('sha256').update(text).digest('hex').slice(0,12)}.json`;writeFileSync(join(staging,questsFile),text);}
      const stateIndex={schemaVersion:game.questsFile?2:1,gameId:game.id,saveCompatibilityVersion:game.saveCompatibilityVersion??1,
        maps:[...maps.values()].map(map=>({id:map.id,name:map.name,width:map.width,height:map.height,spawns:map.spawns.map(spawn=>spawn.id)})),
        itemIds:catalog.items.map(item=>item.id),factIds:facts.facts.map(fact=>fact.id),placementIds:[...maps.values()].flatMap(map=>map.objects.map(object=>object.id)),...(game.questsFile?{questIds:quests.quests.map(quest=>quest.id)}:{})};
      const stateText=JSON.stringify(stateIndex)+'\n';const stateIndexFile=`state-index.${createHash('sha256').update(stateText).digest('hex').slice(0,12)}.json`;writeFileSync(join(staging,stateIndexFile),stateText);
      writeFileSync(join(staging, 'game.json'), JSON.stringify({...game,...(itemsFile?{itemsFile}:{}),...(factsFile?{factsFile}:{}),...(questsFile?{questsFile}:{}),stateIndexFile,maps:entries}) + '\n');
      rmSync(output, {recursive: true, force: true});
      renameSync(staging, output);
    } finally { rmSync(staging, {recursive: true, force: true}); }
    console.log('Emitted a compact manifest and individual hashed map files; no world bundle.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
