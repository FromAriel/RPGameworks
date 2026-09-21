import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchContent, loadMapCheckpoint, loadSelectedMap } from '../../src/platform/map-loader';
import { readFacts, readItems } from '../../src/content/validation.mjs';
import { SessionState } from '../../src/domain/session';
import type { GameManifest } from '../../src/content/generated/game';
import type { MapDefinition } from '../../src/content/generated/map';

const base=new URL('https://game.invalid/RPGameworks/');
const read=(path:string):string=>readFileSync(`content/games/demo/${path}`,'utf8');
const json=(path:string):unknown=>JSON.parse(read(path));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('bounded map loading',()=>{
  it('loads only the selected map, under the project base path',async()=>{
    const mock=vi.fn(async(url:URL)=>new Response(read(url.pathname.endsWith('game.json')?'game.json':'maps/gallery.json')));
    vi.stubGlobal('fetch',mock);
    const loaded=await loadSelectedMap(base,new URLSearchParams('map=demo:map.gallery&spawn=from-workshop'),new AbortController().signal);
    expect(loaded.spawn.x).toBe(2);expect(loaded.map.id).toBe('demo:map.gallery');
    expect(mock.mock.calls.map(([url])=>url.pathname)).toEqual(['/RPGameworks/generated/content/game.json','/RPGameworks/generated/content/maps/gallery.json']);
  });
  it('rejects an unknown map before fetching its path',async()=>{
    const mock=vi.fn(async()=>new Response(read('game.json')));vi.stubGlobal('fetch',mock);
    await expect(loadSelectedMap(base,new URLSearchParams('map=../../bad'),new AbortController().signal)).rejects.toThrow('Unknown map ID');
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('rejects an unknown spawn',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:URL)=>new Response(read(url.pathname.endsWith('game.json')?'game.json':'maps/workshop.json'))));
    await expect(loadSelectedMap(base,new URLSearchParams('spawn=absent'),new AbortController().signal)).rejects.toThrow('unknown spawn ID');
  });
  it('rejects mismatched map identities',async()=>{
    vi.stubGlobal('fetch',vi.fn(async(url:URL)=>new Response(read(url.pathname.endsWith('game.json')?'game.json':'maps/gallery.json'))));
    await expect(loadSelectedMap(base,new URLSearchParams(),new AbortController().signal)).rejects.toThrow('expected map demo:map.workshop');
  });
  it.each(['http','json','declared-size','actual-size'])('rejects %s failures',async(kind)=>{
    vi.stubGlobal('fetch',vi.fn(async()=>kind==='http'?new Response('missing',{status:404}):kind==='json'?new Response('<html>error</html>'):kind==='declared-size'?new Response('{}',{headers:{'content-length':'300000'}}):new Response(' '.repeat(262145))));
    await expect(fetchContent(base,new AbortController().signal)).rejects.toThrow();
  });
  it('aborts stalled requests at the timeout and removes timers',async()=>{
    vi.useFakeTimers();
    vi.stubGlobal('fetch',vi.fn((_url:URL,options:RequestInit)=>new Promise((_resolve,reject)=>{options.signal!.addEventListener('abort',()=>reject(options.signal!.reason),{once:true});})));
    const promise=fetchContent(base,new AbortController().signal);const expectation=expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(8000);await expectation;expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates application cancellation',async()=>{
    vi.stubGlobal('fetch',vi.fn((_url:URL,options:RequestInit)=>new Promise((_resolve,reject)=>{options.signal!.addEventListener('abort',()=>reject(options.signal!.reason),{once:true});})));
    const owner=new AbortController();const promise=fetchContent(base,owner.signal);const result=expect(promise).rejects.toThrow('cancelled');
    owner.abort(new Error('cancelled'));await result;
  });
});

describe('checkpoint loading against candidate resolved solidity',()=>{
  const definitions=()=>({items:readItems(JSON.parse(read('items.json'))),facts:readFacts(JSON.parse(read('facts.json')))});
  const session=(plaqueRead:boolean)=>{const state=new SessionState(definitions());if(plaqueRead)state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});return state;};
  /** A state-solid gate at (2,7): open only while the plaque was read; placement solid otherwise. */
  const gatedMap=():string=>{
    const map=json('maps/gallery.json') as unknown as MapDefinition;
    const gate:MapDefinition['objects'][number]={id:'demo:object.gallery.test-gate',frame:'door',x:2,y:7,solid:true,states:[
      {id:'open',when:{type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true},frame:'door',visible:true,solid:false},
      {id:'closed',fallback:true,frame:'door',visible:true},
    ]};
    return JSON.stringify({...map,objects:[...map.objects,gate]});
  };
  const load=(plaqueRead:boolean,tile:{x:number;y:number}):Promise<unknown>=>{
    const game=json('game.json') as unknown as GameManifest;
    const mock=vi.fn(async(url:URL)=>new Response(url.pathname.endsWith('game.json')?read('game.json'):gatedMap()));
    vi.stubGlobal('fetch',mock);
    return loadMapCheckpoint(base,game,'demo:map.gallery',tile,'down',session(plaqueRead),new AbortController().signal);
  };
  it('restores a save made on an open state-solid gate cell',async()=>{
    await expect(load(true,{x:2,y:7})).resolves.toMatchObject({spawn:{id:'saved-checkpoint',x:2,y:7}});
  });
  it('rejects the same tile while its resolved gate state is closed, plus authored walls and outside tiles',async()=>{
    await expect(load(false,{x:2,y:7})).rejects.toThrow('Saved checkpoint 2,7 is blocked');
    await expect(load(true,{x:0,y:0})).rejects.toThrow('Saved checkpoint 0,0 is blocked');
    await expect(load(true,{x:30,y:3})).rejects.toThrow('Saved checkpoint 30,3 is blocked');
  });
});
