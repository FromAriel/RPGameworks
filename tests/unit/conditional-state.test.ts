import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFacts, readItems, readMap, readQuests } from '../../src/content/validation.mjs';
import { objectDependencies, resolveObjectState } from '../../src/domain/object-state';
import { MAX_CONDITION_DEPTH, MAX_CONDITION_NODES, SessionState, validateCondition } from '../../src/domain/session';
import type { Condition } from '../../src/domain/session';
import type { Placement } from '../../src/domain/session';

const json=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8')) as unknown;
const definitions=()=>({items:readItems(json('content/games/demo/items.json')),facts:readFacts(json('content/games/demo/facts.json')),quests:readQuests(json('content/games/demo/quests.json')).quests});
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
  it('routes Mara through one authored dialogue while retaining the found lens',()=>{
    const map=readMap(json('content/games/demo/maps/workshop.json')),mara=map.objects.find(object=>object.id==='demo:object.workshop.caretaker')!,state=session();
    expect(resolveObjectState(mara,state).interaction?.dialogueId).toBe('mara-lens');
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
    expect(resolveObjectState(mara,state).interaction?.dialogueId).toBe('mara-lens');
    state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});
    expect(state.quest('demo:quest.gallery-light')).toBe('inactive');
    expect(state.count('demo:item.lens')).toBe(1);
  });
  it('keeps the storeroom doorway visible while changing its lock art and collision',()=>{
    const map=readMap(json('content/games/demo/maps/gallery.json'));
    const door=map.objects.find(object=>object.id==='demo:object.gallery.storeroom-door')!;
    const state=session();
    expect(resolveObjectState(door,state)).toMatchObject({stateId:'locked',frame:'door-locked',visible:true,solid:true});
    state.transact({actions:[{type:'markPlacementOpened',placementId:door.id}]});
    expect(resolveObjectState(door,state)).toMatchObject({stateId:'unlocked',frame:'door',visible:true,solid:false});
  });
  const gate=(actionless=false):Placement=>{
    const map=structuredClone(readMap(json('content/games/demo/maps/gallery.json')));
    const gate:Placement={id:'demo:object.gallery.test-gate',frame:'door',x:2,y:7,solid:true,states:[
      {id:'open',when:{type:'factEquals',factId:'demo:fact.gallery.plaque-read',value:true},frame:'door',visible:true,solid:false,interaction:{messageId:'gallery-plaque-read'}},
      {id:'locked',fallback:true,frame:'door',visible:true,interaction:{...(actionless?{messageId:'gallery-plaque-discovered',rejectionMessageId:'chest-full',prerequisites:{type:'itemAtLeast',itemId:'demo:item.lens',quantity:1}}:{messageId:'gallery-plaque-discovered',rejectionMessageId:'chest-full',prerequisites:{type:'itemAtLeast',itemId:'demo:item.lens',quantity:1},actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]})}}
    ]};
    map.objects.push(gate);return readMap(map).objects.find(object=>object.id==='demo:object.gallery.test-gate')!;
  };
  describe('G1.1 state-scoped passability and access-gated interactions',()=>{
    it('resolves solid from the winning state and falls back to the placement otherwise',()=>{
      const state=session();
      expect(resolveObjectState(gate(),state)).toMatchObject({stateId:'locked',solid:true});
      state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});
      expect(resolveObjectState(gate(),state)).toMatchObject({stateId:'open',solid:false});
    });
    it('resolves interaction prerequisites and reports them as object dependencies',()=>{
      const object=gate(),dependencies=objectDependencies(object);
      expect(dependencies.has('fact:demo:fact.gallery.plaque-read')).toBe(true);
      expect(dependencies.has('item:demo:item.lens')).toBe(true);
      expect(resolveObjectState(object,session()).interaction).toMatchObject({messageId:'gallery-plaque-discovered',rejectionMessageId:'chest-full',prerequisites:{type:'itemAtLeast',itemId:'demo:item.lens',quantity:1}});
    });
    it('denies the locked gate without the key, unlocks with the key, and never re-runs the unlock',()=>{
      const state=session(),object=gate(),locked=resolveObjectState(object,state).interaction!;
      const attempt=()=>state.transact({actions:locked.actions,prerequisites:locked.prerequisites!},object.id);
      const before=state.snapshot();
      expect(attempt()).toMatchObject({kind:'rejected',reason:'condition'});expect(state.snapshot()).toBe(before);
      state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
      expect(attempt()).toMatchObject({kind:'committed'});
      expect(resolveObjectState(object,state)).toMatchObject({stateId:'open',solid:false});
      expect(attempt()).toMatchObject({kind:'unchanged'});
    });
    it('resolves prerequisite-only access without actions and evaluates eligibility against the session context',()=>{
      const object=gate(true),state=session(),resolved=resolveObjectState(object,state).interaction!;
      expect(resolved.actions).toEqual([]);
      expect(resolved.prerequisites).toMatchObject({type:'itemAtLeast',itemId:'demo:item.lens',quantity:1});
      expect(state.evaluate(resolved.prerequisites!,object.id)).toBe(false);
      state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
      expect(state.evaluate(resolved.prerequisites!,object.id)).toBe(true);
      const gated=structuredClone(readMap(json('content/games/demo/maps/gallery.json')));
      expect(()=>readMap(gated)).not.toThrow();
    });
    it('satisfies already-unlocked access without the key through first-match state order',()=>{
      const state=session(),object=gate();
      state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});
      expect(resolveObjectState(object,state).interaction).toMatchObject({messageId:'gallery-plaque-read'});
      expect(resolveObjectState(object,state).interaction!.prerequisites).toBeUndefined();
    });
  });
});
