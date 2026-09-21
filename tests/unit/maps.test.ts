import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readMap, readGame, readItems, readFacts, validateMapItems, validateMapFacts, validateWorld, ContentError } from '../../src/content/validation.mjs';
import { createCollision } from '../../src/domain/map.mjs';
import { createActor, advanceActor } from '../../src/domain/movement';
import type { MapDefinition } from '../../src/content/generated/map';
import type { GameManifest } from '../../src/content/generated/game';

const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const workshop = (): MapDefinition => structuredClone(readMap(json('content/games/demo/maps/workshop.json')));
const gallery = (): MapDefinition => structuredClone(readMap(json('content/games/demo/maps/gallery.json')));
const manifest = (): GameManifest => structuredClone(readGame(json('content/games/demo/game.json')));
const frames = Object.keys((json('assets/source/foundation.json') as { frames: Record<string, unknown> }).frames);

const badMaps: [string, (map: MapDefinition) => void, string][] = [
  ['mismatched width', m => { m.width = 21; }, 'Expected 21 cells'],
  ['missing visual row', m => { m.layers[0]!.rows.pop(); }, 'Expected 12 rows'],
  ['short collision row', m => { m.collision[1] = '.'; }, 'Expected 20 cells'],
  ['unknown symbol', m => { m.layers[0]!.rows[1] = 'q' + m.layers[0]!.rows[1]!.slice(1); }, 'Unknown legend symbol'],
  ['unknown frame', m => { m.legend['a'] = 'nonexistent'; }, 'Atlas frame does not exist'],
  ['invalid default spawn', m => { m.defaultSpawn = 'missing'; }, 'Default spawn does not exist'],
  ['blocked spawn', m => { m.spawns[0]!.x = 0; }, 'Spawn outside map or on a blocked cell'],
  ['out-of-bounds spawn', m => { m.spawns[0]!.x = 25; }, 'Spawn outside map or on a blocked cell'],
  ['solid object blocks spawn', m => { Object.assign(m.objects[0]!, {x:10, y:6, solid:true}); }, 'Spawn outside map or on a blocked cell'],
  ['object outside map', m => { m.objects[0]!.x = 25; }, 'Object outside map bounds'],
  ['unknown object frame', m => { m.objects[0]!.frame = 'missing'; }, 'Atlas frame does not exist'],
  ['duplicate spawn ID', m => { m.spawns.push({...m.spawns[0]!}); }, 'Duplicate scoped ID'],
  ['duplicate layer ID', m => { m.layers.push(structuredClone(m.layers[0]!)); }, 'Duplicate scoped ID'],
  ['duplicate object ID', m => { m.objects.push({...m.objects[0]!}); }, 'Duplicate scoped ID'],
  ['duplicate exit ID', m => { m.exits.push({...m.exits[0]!}); }, 'Duplicate scoped ID'],
  ['overlapping solids', m => { m.objects[0]!.solid=true; m.objects.push({...m.objects[0]!,id:'demo:object.second'}); }, 'Overlapping solid objects'],
  ['exit extends out of bounds', m => { m.exits[0]!.width = 3; }, 'Exit rectangle outside map bounds'],
  ['exit on blocked cell', m => { m.exits[0]!.x = 19; }, 'Exit contains a blocked cell'],
  ['overlapping exits', m => { m.exits.push({...m.exits[0]!, id:'another'}); }, 'Overlapping exit rectangles'],
];

describe('canonical map schema and local semantics', () => {
  it('accepts both authored maps and resolves the complete world', () => {
    const a = readMap(workshop(), 'maps/workshop.json', frames);
    const b = readMap(gallery(), 'maps/gallery.json', frames);
    expect(() => validateWorld(manifest(), new Map([[a.id,a],[b.id,b]]))).not.toThrow();
  });
  it.each(badMaps)('rejects %s', (_name, change, expected) => {
    const map = workshop(); change(map);
    expect(() => readMap(map, 'bad.json', frames)).toThrow(expected);
  });
  it.each([
    ['future version', 'schemaVersion', 2], ['non-orthogonal map', 'orientation', 'isometric'],
    ['fractional width', 'width', 2.5], ['infinite dimensions', 'width', Infinity],
    ['oversize dimensions', 'height', 129], ['incompatible tile size', 'tileSize', 32],
    ['unknown property', 'widht', 20], ['bad map namespace', 'id', 'Workshop'],
  ])('rejects structural error: %s', (_name, key, value) => {
    const map = {...workshop(), [key]:value};
    expect(() => readMap(map, 'bad.json')).toThrow(ContentError);
  });
  it('reports the source, record, field and offending coordinate', () => {
    const map = workshop(); map.spawns[0]!.x = 25;
    try { readMap(map, 'maps/broken.json'); throw new Error('Expected rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(ContentError);
      expect((error as Error).message).toContain('maps/broken.json [demo:map.workshop] /spawns/0');
      expect((error as Error).message).toContain('"x":25');
    }
  });
  it('limits semantic error reports and never mutates caller data', () => {
    const map = workshop(); map.layers[0]!.rows.fill('q'.repeat(20));
    try { readMap(map); } catch (error) { expect((error as ContentError).issues).toHaveLength(20); }
    const original = workshop(); const copy = readMap(original);
    expect(copy).not.toBe(original); expect(Object.isFrozen(copy.spawns[0])).toBe(true);
    original.spawns[0]!.x = 11; expect(copy.spawns[0]!.x).toBe(10);
    expect(() => { copy.spawns[0]!.x=12; }).toThrow();
  });
});

describe('collision compiled once from authored cells and static placements', () => {
  it('blocks borders, invalid coordinates, an interior wall, and a solid object', () => {
    const grid = createCollision(gallery());
    expect(grid.cellCount).toBe(24*14);
    for (const [x,y] of [[-1,5],[24,5],[5,14],[0,0],[NaN,1],[Infinity,1],[1.5,2],[6,6],[12,3]]) expect(grid.canEnter(x!,y!)).toBe(false);
    for (const [x,y] of [[4,6],[12,6],[18,6]]) expect(grid.canEnter(x!,y!)).toBe(true);
    expect('cells' in grid).toBe(false);
  });
  it('does not alias mutable source rows or objects after compilation', () => {
    const data = gallery(); const grid = createCollision(data);
    data.collision.fill('.'.repeat(data.width)); data.objects.length=0;
    expect(grid.canEnter(0,0)).toBe(false); expect(grid.canEnter(6,6)).toBe(false);
  });
  it.each([30,60,120,144])('preserves movement and blocks the pillar at %i Hz', hz => {
    const grid = createCollision(gallery()); const actor=createActor(4,6);
    for (let i=0;i<hz*2;i++) advanceActor(actor,'right',1000/hz,grid.canEnter);
    expect(actor.tile).toEqual({x:5,y:6}); expect(actor.motion).toBeNull();
  });
  it('handles both the smallest and maximum supported finite maps', () => {
    for (const size of [1,128]) {
      const m=workshop(); m.width=size; m.height=size;
      m.layers=[{id:'ground',rows:Array.from({length:size},()=> 'a'.repeat(size))}];
      m.collision=Array.from({length:size},()=> '.'.repeat(size)); m.spawns=[{id:'start',x:0,y:0,facing:'down'}];m.objects=[];m.exits=[];
      const grid=createCollision(readMap(m));
      expect(grid.canEnter(size-1,size-1)).toBe(true);expect(grid.canEnter(size,0)).toBe(false);
    }
  });
});

describe('manifest and world references', () => {
  it.each(['../secret.json','https://example.com/map.json','maps/../../secret.json','maps/UPPER.json','maps/%2e%2e.json','maps\\workshop.json'])('rejects unsafe or unsupported file %s', path => {
    const m=manifest();m.maps[0]!.file=path;expect(()=>readGame(m)).toThrow(ContentError);
  });
  it('rejects duplicate registry IDs and paths', () => {
    const m=manifest();m.maps.push({...m.maps[0]!});expect(()=>readGame(m)).toThrow('Duplicate map ID');
    m.maps[2]!.id='demo:map.other';expect(()=>readGame(m)).toThrow('Duplicate map file');
  });
  it('rejects an unregistered start map',()=>{const m=manifest();m.start.mapId='demo:map.missing';expect(()=>readGame(m)).toThrow('Start map is not registered');});
  it('rejects unknown cross-object condition and action placement IDs',()=>{
    for(const kind of ['condition','action'] as const){const a=workshop(),b=gallery(),game=manifest(),plaque=b.objects.find(object=>object.id==='demo:object.gallery.plaque')!;
      if(kind==='condition')plaque.states![0]!.when={type:'placementOpened',placementId:'demo:object.missing',value:true};
      else plaque.states![1]!.interaction!.actions=[{type:'markPlacementOpened',placementId:'demo:object.missing'}];
      expect(()=>validateWorld(game,new Map([[a.id,a],[b.id,b]]))).toThrow(`Unknown ${kind} placement`);
    }
  });
  describe('interaction prerequisites (G1.1 access contract)',()=>{
    const plaqueState=(map:MapDefinition)=>map.objects.find(object=>object.id==='demo:object.gallery.plaque')!.states![1]!.interaction!;
    it('requires a denial message so rejection never crashes the runtime',()=>{
      const map=gallery();plaqueState(map).prerequisites={type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true};
      expect(()=>readMap(map,'bad.json',frames)).toThrow('Access-gated interaction requires rejectionMessageId');
    });
    it('rejects unknown items and facts referenced by an access condition',()=>{
      const catalog=readItems(json('content/games/demo/items.json'));
      const itemed=gallery();plaqueState(itemed).prerequisites={type:'itemAtLeast',itemId:'demo:item.missing',quantity:1};
      expect(()=>validateMapItems(itemed,catalog,'bad.json')).toThrow('Unknown condition item');
      const facted=gallery();plaqueState(facted).prerequisites={type:'factEquals',factId:'demo:fact.missing',value:true};
      expect(()=>validateMapFacts(facted,readFacts(json('content/games/demo/facts.json')),'bad.json')).toThrow('Unknown condition fact');
    });
    it('rejects unknown placements referenced by an access condition',()=>{
      const a=workshop(),b=gallery(),game=manifest();plaqueState(b).prerequisites={type:'placementOpened',placementId:'demo:object.missing',value:true};
      expect(()=>validateWorld(game,new Map([[a.id,a],[b.id,b]]))).toThrow('Unknown condition placement');
    });
    it('accepts a fully referenced access condition on authored content',()=>{
      const map=gallery();plaqueState(map).prerequisites={type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true};
      expect(validateMapItems(map,readItems(json('content/games/demo/items.json')),'ok.json')).toBeUndefined();
      expect(validateMapFacts(map,readFacts(json('content/games/demo/facts.json')),'ok.json')).toBeUndefined();
    });
  });
  it.each(['map','spawn','start','placement','missing'])('rejects broken world %s reference',kind=>{
    const a=workshop(), b=gallery(), game=manifest();
    if(kind==='map') a.exits[0]!.targetMap='demo:map.missing';
    if(kind==='spawn') a.exits[0]!.targetSpawn='missing';
    if(kind==='start') game.start.spawnId='missing';
    if(kind==='placement') b.objects[0]!.id=a.objects[0]!.id;
    const maps=new Map([[a.id,a],[b.id,b]]);if(kind==='missing')maps.delete(b.id);
    expect(()=>validateWorld(game,maps)).toThrow(ContentError);
  });
});

describe('content compiler',()=>{
  it('builds deterministic separate maps and preserves output on rejection',()=>{
    const temp=mkdtempSync(join(tmpdir(),'rpgameworks-maps-'));
    try{
      const source=join(temp,'source'), output=join(temp,'compiled');cpSync('content/games/demo',source,{recursive:true});
      const run=()=>spawnSync(process.execPath,['tools/build-content.mjs','--source',source,'--output',output],{encoding:'utf8'});
      expect(run().status).toBe(0);const first=readFileSync(join(output,'game.json'),'utf8');
      expect(readdirSync(join(output,'maps'))).toHaveLength(2);expect(run().status).toBe(0);
      expect(readFileSync(join(output,'game.json'),'utf8')).toBe(first);
      const m=workshop();m.exits[0]!.targetSpawn='missing';writeFileSync(join(source,'maps/workshop.json'),JSON.stringify(m));
      const failed=run();expect(failed.status).toBe(1);expect(failed.stderr).toContain('Target spawn does not exist');
      expect(readFileSync(join(output,'game.json'),'utf8')).toBe(first);
    }finally{rmSync(temp,{recursive:true,force:true});}
  });
});
