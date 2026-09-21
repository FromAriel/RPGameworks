import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFacts, readItems, readMap } from '../../src/content/validation.mjs';
import { objectDependencies, resolveObjectState } from '../../src/domain/object-state';
import { MAX_CONDITION_DEPTH, MAX_CONDITION_NODES, SessionState, validateCondition } from '../../src/domain/session';
import type { Condition } from '../../src/domain/session';

const json=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8')) as unknown;
const definitions=()=>({items:readItems(json('content/games/demo/items.json')),facts:readFacts(json('content/games/demo/facts.json'))});
const session=()=>new SessionState(definitions());
const facts=new Set(['demo:fact.gallery.plaque-read']),items=new Set(['demo:item.lens']);

describe('bounded conditions and ordered object states',()=>{
  it('evaluates fact, item, placement, all, any, and not truth tables',()=>{
    const state=session(),fact:Condition={type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true},item:Condition={type:'itemAtLeast',itemId:'demo:item.lens',quantity:1},opened:Condition={type:'placementOpened',placementId:'demo:object.gallery.lens-chest',value:true};
    for(const leaf of [fact,item,opened])expect(state.evaluate(leaf)).toBe(false);
    expect(state.evaluate({type:'not',condition:fact})).toBe(true);expect(state.evaluate({type:'any',conditions:[fact,{type:'not',condition:fact}]})).toBe(true);expect(state.evaluate({type:'all',conditions:[fact,item]})).toBe(false);
    state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true},{type:'changeItem',itemId:'demo:item.lens',delta:1},{type:'markPlacementOpened',placementId:'demo:object.gallery.lens-chest'}]});
    expect(state.evaluate({type:'all',conditions:[fact,item,opened]})).toBe(true);
  });
  it('rejects depth, node, fan-out, empty, unknown, and invalid quantities',()=>{
    let deep:Condition={type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true};for(let i=0;i<MAX_CONDITION_DEPTH;i++)deep={type:'not',condition:deep};
    expect(validateCondition(deep,facts,items)).toContain('depth');
    const many:Condition={type:'all',conditions:Array.from({length:16},()=>({type:'all',conditions:Array.from({length:4},()=>({type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true}))}))};
    expect(validateCondition(many,facts,items)).toContain(String(MAX_CONDITION_NODES));
    expect(validateCondition({type:'all',conditions:[]},facts,items)).toContain('1-16');expect(validateCondition({type:'any',conditions:Array(17).fill({type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true})},facts,items)).toContain('1-16');
    expect(validateCondition({type:'factEquals',factId:'demo:fact.missing',value:true},facts,items)).toContain('unknown fact');expect(validateCondition({type:'itemAtLeast',itemId:'demo:item.missing',quantity:1},facts,items)).toContain('unknown item');expect(validateCondition({type:'itemAtLeast',itemId:'demo:item.lens',quantity:-1},facts,items)).toContain('quantity');
  });
  it('commits mixed actions atomically, reports dependencies, and treats net no-ops as unchanged',()=>{
    const state=session(),before=state.snapshot();expect(state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1},{type:'changeItem',itemId:'demo:item.lens',delta:-2},{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]})).toMatchObject({kind:'rejected',reason:'insufficient'});expect(state.snapshot()).toBe(before);
    expect(state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1},{type:'changeItem',itemId:'demo:item.lens',delta:-1}]})).toMatchObject({kind:'unchanged',revision:0});
    const committed=state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});expect(committed.kind).toBe('committed');if(committed.kind==='committed')expect([...committed.changed]).toEqual(['fact:demo:fact.gallery.plaque-read']);
    expect(state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]})).toMatchObject({kind:'unchanged',revision:1});
  });
  it('commits a stable idempotency marker with its reward and rejects the duplicate as already claimed',()=>{
    const state=session(),request={actions:[{type:'changeItem' as const,itemId:'demo:item.lens',delta:1}],idempotencyMarker:'self'};
    expect(state.transact(request,'demo:object.gallery.lens-chest').kind).toBe('committed');expect(state.opened('demo:object.gallery.lens-chest')).toBe(true);expect(state.transact(request,'demo:object.gallery.lens-chest')).toMatchObject({kind:'already-claimed',revision:1});expect(state.count('demo:item.lens')).toBe(1);
  });
  it('resolves the first matching plaque state and extracts only its declared dependency',()=>{
    const map=readMap(json('content/games/demo/maps/gallery.json')),plaque=map.objects.find(object=>object.id==='demo:object.gallery.plaque')!,state=session();
    expect(resolveObjectState(plaque,state)).toMatchObject({stateId:'unread',frame:'plaque'});expect([...objectDependencies(plaque)]).toEqual(['fact:demo:fact.gallery.plaque-read']);
    state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});expect(resolveObjectState(plaque,state)).toMatchObject({stateId:'read',frame:'plaque-read'});
  });
});
