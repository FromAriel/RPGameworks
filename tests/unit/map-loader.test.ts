import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchContent, loadSelectedMap } from '../../src/platform/map-loader';

const base=new URL('https://game.invalid/RPGameworks/');
const read=(path:string):string=>readFileSync(`content/games/demo/${path}`,'utf8');
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
