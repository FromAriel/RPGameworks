import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readItems, readMap, validateMapItems } from '../../src/content/validation.mjs';
import { SessionState } from '../../src/domain/session';
import { DirectionRepeat } from '../../src/domain/menu-navigation';
import { parseControllerConfig, defaultControllerConfig, PadLatch } from '../../src/platform/gamepad-model';
import type { PadState } from '../../src/platform/gamepad-model';
import type { MapDefinition } from '../../src/content/generated/map';
const catalog = () => readItems(JSON.parse(readFileSync('content/games/demo/items.json','utf8')));
const map = () => readMap(JSON.parse(readFileSync('content/games/demo/maps/gallery.json','utf8')));
const chest = ():MapDefinition['objects'][number] => {
  const current=map().objects.find(object=>object.id==='demo:object.gallery.lens-chest')!;
  const {states:_states,...placement}=current;
  return {...placement,chest:{itemId:'demo:item.lens',quantity:1,openedFrame:'chest-open',openedMessageId:'lens-found',emptyMessageId:'chest-empty'}};
};
const lens = 'demo:item.lens';
function expanded(capacity = 2) {
  const data = structuredClone(catalog()); data.capacity=capacity; data.items[0]!.maxStack=10;
  data.items.push({...data.items[0]!,id:'demo:item.token'}); return readItems(data);
}

describe('authoritative session transactions', () => {
  it('claims a stable placement once without mutating authored data',()=>{
    const state=new SessionState(catalog()), definition=chest(), before=JSON.stringify(definition);
    const initial=state.snapshot(); expect(state.claim(definition).kind).toBe('committed');
    expect(state.count(lens)).toBe(1); expect(state.opened(definition.id)).toBe(true);
    for(let i=0;i<100;i++) expect(state.claim(definition).kind).toBe('already-claimed');
    expect(state.snapshot().revision).toBe(1); expect(state.count(lens)).toBe(1);
    expect(initial.inventory).toEqual({}); expect(JSON.stringify(definition)).toBe(before);
    expect(state.snapshot()).toBe(state.snapshot()); expect(Object.isFrozen(state.snapshot().placements[definition.id])).toBe(true);
  });
  it('keeps two placed chests independent even with the same artwork and item',()=>{
    const state=new SessionState(expanded()), a=chest(), b={...a,id:'demo:object.gallery.second'};
    state.claim(a); state.claim(b); expect(state.count(lens)).toBe(2); expect(Object.keys(state.snapshot().placements)).toHaveLength(2);
  });
  it('stack failure leaves the second chest unclaimed and retry succeeds after a removal',()=>{
    const state=new SessionState(catalog()), a=chest(), b={...a,id:'demo:object.gallery.second'};
    state.claim(a); const before=state.snapshot(); expect(state.claim(b)).toMatchObject({kind:'rejected',reason:'stack-limit'});
    expect(state.snapshot()).toBe(before); expect(state.opened(b.id)).toBe(false);
    state.transact([{itemId:lens,delta:-1}]); expect(state.claim(b).kind).toBe('committed'); expect(state.count(lens)).toBe(1);
  });
  it('full inventory cannot partly grant an item or mark a placement',()=>{
    const state=new SessionState(expanded(1)); state.transact([{itemId:'demo:item.token',delta:1}]);
    const before=state.snapshot(); expect(state.claim(chest())).toMatchObject({kind:'rejected',reason:'capacity'}); expect(state.snapshot()).toBe(before);
  });
  it('coupled removal and addition succeed atomically at full capacity',()=>{
    const state=new SessionState(expanded(1)); state.transact([{itemId:lens,delta:2}]);
    expect(state.transact([{itemId:'demo:item.token',delta:1},{itemId:lens,delta:-2}]).kind).toBe('committed');
    expect(state.snapshot().inventory).toEqual({'demo:item.token':1});
  });
  it.each([0,-1,0.5,NaN,Infinity,10000])('rejects malformed chest quantity %s',quantity=>{
    const state=new SessionState(catalog()), a=structuredClone(chest()); a.chest!.quantity=quantity;
    const before=state.snapshot(); expect(state.claim(a).kind).toBe('rejected'); expect(state.snapshot()).toBe(before);
  });
  it.each([0,0.5,NaN,Infinity,10000])('rejects malformed item delta %s',delta=>{
    const state=new SessionState(catalog()); expect(state.transact([{itemId:lens,delta}]).kind).toBe('rejected'); expect(state.snapshot().revision).toBe(0);
  });
  it('rejects unknown items, excessive operations, bad IDs, and stale revisions',()=>{
    const state=new SessionState(catalog());
    expect(state.transact([{itemId:'demo:item.missing',delta:1}])).toMatchObject({reason:'unknown-item'});
    expect(state.transact(Array(65).fill({itemId:lens,delta:1}))).toMatchObject({reason:'invalid'});
    expect(state.transact([{itemId:lens,delta:1}],'__proto__')).toMatchObject({reason:'invalid'});
    state.claim(chest()); expect(state.transact([{itemId:lens,delta:-1}],undefined,0)).toMatchObject({reason:'stale'}); expect(state.count(lens)).toBe(1);
  });
  it('failed compound operations leave every component unchanged',()=>{
    const state=new SessionState(expanded()); state.transact([{itemId:lens,delta:1}]); const before=state.snapshot();
    expect(state.transact([{itemId:lens,delta:-1},{itemId:'demo:item.token',delta:11}])).toMatchObject({reason:'stack-limit'});
    expect(state.snapshot()).toBe(before);
    expect(state.transact([{itemId:lens,delta:-2}])).toMatchObject({reason:'insufficient'});
  });
  it('new sessions start empty; snapshots cannot mutate live inventory',()=>{
    const state=new SessionState(catalog());state.claim(chest());
    expect(()=>{(state.snapshot().inventory as Record<string,number>)[lens]=20;}).toThrow();
    expect(new SessionState(catalog()).snapshot().inventory).toEqual({});
  });
});

describe('item and chest authoring validation',()=>{
  it('accepts the authored item/chest and preserves old message-only maps',()=>{
    expect(()=>validateMapItems(map(),catalog())).not.toThrow();
    expect(()=>validateMapItems(readMap(JSON.parse(readFileSync('content/games/demo/maps/workshop.json','utf8'))),catalog())).not.toThrow();
  });
  it.each(['duplicate','missing-name','blank','fractional','unknown-field','future'])( 'rejects %s catalog',kind=>{
    const data=structuredClone(catalog());
    if(kind==='duplicate')data.items.push({...data.items[0]!});
    if(kind==='missing-name')data.items[0]!.nameKey='absent';
    if(kind==='blank')data.strings.en['lens.name']=' ';
    if(kind==='fractional')data.capacity=1.5;
    if(kind==='unknown-field')Object.assign(data,{invented:1});
    if(kind==='future')Object.assign(data,{schemaVersion:2});
    expect(()=>readItems(data)).toThrow();
  });
  it.each(['unknown-item','too-many','missing-open-frame','missing-message','two-actions','not-solid'])( 'rejects %s chest',kind=>{
    const data=structuredClone(map()), c=structuredClone(chest());data.objects[data.objects.findIndex(o=>o.id===c.id)]=c;
    if(kind==='unknown-item')c.chest!.itemId='demo:item.missing';
    if(kind==='too-many')c.chest!.quantity=2;
    if(kind==='missing-open-frame')c.chest!.openedFrame='missing';
    if(kind==='missing-message')c.chest!.emptyMessageId='absent';
    if(kind==='two-actions')c.messageId='gallery-plaque';
    if(kind==='not-solid')c.solid=false;
    const frames=Object.keys(JSON.parse(readFileSync('assets/source/foundation.json','utf8')).frames);
    expect(()=>validateMapItems(readMap(data,'bad-map',frames),catalog())).toThrow();
  });
  it('rejects an unknown item referenced only by a conditional state',()=>{
    const data=structuredClone(map()), plaque=data.objects.find(object=>object.id==='demo:object.gallery.plaque')!;
    plaque.states![0]!.when={type:'itemAtLeast',itemId:'demo:item.missing',quantity:1};
    expect(()=>validateMapItems(data,catalog())).toThrow('Unknown condition item');
  });
});

describe('direct menu input and migration',()=>{
  it('migrates v2 bindings without taking an already used Menu button',()=>{
    const config=defaultControllerConfig();const {menu:_menu,...buttons}=config.buttons;
    buttons.burst=9;const old={...config,version:2,buttons};const migrated=parseControllerConfig(old)!;
    expect(migrated.version).toBe(3); expect(migrated.buttons.burst).toBe(9); expect(migrated.buttons.menu).not.toBe(9);
    for(const [action,value] of Object.entries(buttons))expect(migrated.buttons[action as keyof typeof buttons]).toBe(value);
    expect(old.buttons).not.toHaveProperty('menu');
  });
  it('menu uses a deliberate edge and rearming rather than repeated held activation',()=>{
    const config=defaultControllerConfig(), latch=new PadLatch();
    const neutral:PadState={id:'Test',index:0,mapping:'standard',connected:true,axes:[0,0],buttons:Array(17).fill(0)};
    const down={...neutral,buttons:neutral.buttons.map((_,i)=>i===9?1:0)};
    latch.sample(neutral,config,true);expect(latch.sample(down,config,true).menu).toBe(true);
    expect(latch.sample(down,config,true).menu).toBe(false);latch.reset();expect(latch.sample(down,config,true).menu).toBe(false);
  });
  it('direction repeats are delayed, bounded and clear on release',()=>{
    const repeat=new DirectionRepeat();expect(repeat.sample('down',16)).toBe('down');
    for(let i=0;i<6;i++)expect(repeat.sample('down',50)).toBeNull();
    expect(repeat.sample('down',50)).toBe('down');
    expect(repeat.sample('down',1000000)).toBeNull();
    expect(repeat.sample(null,16)).toBeNull();expect(repeat.sample('up',16)).toBe('up');
  });
});
