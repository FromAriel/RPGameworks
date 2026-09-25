import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFacts,readItems,readMap,readQuests,validateMapDialogues } from '../../src/content/validation.mjs';
import { SessionState } from '../../src/domain/session';
import { DialogueSession } from '../../src/domain/dialogue';
import { createEnvelope,validateSaveEnvelope,validateStateIndex } from '../../src/domain/save';
import { SaveService } from '../../src/runtime/save-service';
import type { SaveRecord,SaveRepository,WriteResult,RemoveResult } from '../../src/platform/save-repository';
import type { SaveEnvelopeV1 } from '../../src/domain/save';
import type { MapDefinition } from '../../src/content/generated/map';

const json=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8')) as unknown;
const items=readItems(json('content/games/demo/items.json'));
const facts=readFacts(json('content/games/demo/facts.json'));
const quests=readQuests(json('content/games/demo/quests.json')).quests;
const workshop=()=>readMap(json('content/games/demo/maps/workshop.json'));
const gallery=()=>readMap(json('content/games/demo/maps/gallery.json'));
const session=()=>new SessionState({items,facts,quests});
const talk=(map:MapDefinition,id:string,state:SessionState,owner:string)=>new DialogueSession(map.dialogues!.find(graph=>graph.id===id)!,owner,map.strings!.en,state);

describe('data-authored quest dialogue',()=>{
  it('lets an early lens hand-in silently accept and atomically complete the quest',()=>{
    const state=session(),map=workshop(),owner='demo:object.workshop.caretaker';
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
    expect(talk(map,'mara-lens',state,owner).text).toContain('Welcome');
    state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});
    const dialogue=talk(map,'mara-lens',state,owner);expect(dialogue.text).toContain('May I take it');
    expect(dialogue.select('later')).toMatchObject({actions:[]});expect(state.quest('demo:quest.gallery-light')).toBe('inactive');
    expect(talk(map,'mara-lens',state,owner).choices().map(choice=>choice.id)).toContain('hand-in');
    const handIn=dialogue.select('hand-in');expect(state.transact({actions:handIn.actions,...(handIn.prerequisites?{prerequisites:handIn.prerequisites}:{})},owner).kind).toBe('committed');
    expect(state.quest('demo:quest.gallery-light')).toBe('completed');expect(state.count('demo:item.lens')).toBe(0);
    expect(talk(map,'mara-lens',state,owner).text).toContain('shining again');
    expect(gallery().objects.find(object=>object.id==='demo:object.gallery.sigil')?.states?.[0]?.frame).toBe('sigil-lit');
    expect(state.transact({actions:handIn.actions},owner).kind).toBe('rejected');
  });
  it('uses the same flow for the ledger and rolls back a missing-item hand-in',()=>{
    const state=session(),map=gallery(),owner='demo:object.gallery.archive-clerk';
    const dialogue=talk(map,'archive-ledger',state,owner);expect(dialogue.text).toContain('ledger');
    const accept=dialogue.select('accept');expect(state.transact({actions:accept.actions},owner).kind).toBe('committed');dialogue.move(accept.nextNodeId!);
    expect(dialogue.choices().map(choice=>choice.id)).toEqual(['wrap-up']);
    expect(dialogue.select('wrap-up').actions).toEqual([]);
    expect(talk(map,'archive-ledger',state,owner).choices()).toEqual([]);
    expect(state.transact({actions:[{type:'changeItem',itemId:'demo:item.archive-ledger',delta:-1},{type:'setQuestState',questId:'demo:quest.archive-ledger',value:'completed'}]},owner)).toMatchObject({kind:'rejected',reason:'insufficient'});
    expect(state.quest('demo:quest.archive-ledger')).toBe('active');
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.archive-ledger',delta:1}]});
    const ready=talk(map,'archive-ledger',state,owner),handIn=ready.select('hand-in');
    expect(state.transact({actions:handIn.actions,...(handIn.prerequisites?{prerequisites:handIn.prerequisites}:{})},owner).kind).toBe('committed');
    expect(state.quest('demo:quest.archive-ledger')).toBe('completed');expect(state.count('demo:item.archive-ledger')).toBe(0);
  });
  it('hands in an already-held ledger in one legal, all-or-nothing transaction',()=>{
    const state=session(),map=gallery(),owner='demo:object.gallery.archive-clerk';
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.archive-ledger',delta:1}]});
    const offer=talk(map,'archive-ledger',state,owner);
    expect(offer.text).toContain('May I put it back');
    const handIn=offer.select('hand-in');
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.archive-ledger',delta:-1}]});
    expect(state.transact({actions:handIn.actions},owner)).toMatchObject({kind:'rejected',reason:'insufficient'});
    expect(state.quest('demo:quest.archive-ledger')).toBe('inactive');
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.archive-ledger',delta:1}]});
    expect(state.transact({actions:handIn.actions,...(handIn.prerequisites?{prerequisites:handIn.prerequisites}:{})},owner).kind).toBe('committed');
    expect(state.quest('demo:quest.archive-ledger')).toBe('completed');expect(state.count('demo:item.archive-ledger')).toBe(0);
  });
  it('rejects broken graph and quest references at content validation',()=>{
    const map=json('content/games/demo/maps/workshop.json') as MapDefinition;
    map.dialogues![0]!.nodes[1]!.choices![0]!.nextNodeId='missing';expect(()=>readMap(map)).toThrow(/Missing dialogue node/);
    map.dialogues![0]!.nodes[1]!.choices![0]!.nextNodeId='accepted';
    map.dialogues![0]!.nodes[1]!.choices![0]!.actions![0]={type:'setQuestState',questId:'demo:quest.unknown',value:'active'};
    expect(()=>validateMapDialogues(readMap(map),quests,items,facts)).toThrow(/Unknown quest action/);
  });
  it('hides authored choices, keeps disabled reasons, and rechecks a stale choice',()=>{
    const map=workshop(),graph=structuredClone(map.dialogues![0]!);
    const offer=graph.nodes.find(node=>node.id==='offer')!;
    offer.choices!.push({id:'secret',labelKey:'mara.hand-in',when:{type:'itemAtLeast',itemId:'demo:item.lens',quantity:1}});
    const state=session();state.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true}]});
    const dialogue=new DialogueSession(graph,'demo:object.workshop.caretaker',map.strings!.en,state);
    expect(dialogue.choices().some(choice=>choice.id==='secret')).toBe(false);
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
    expect(dialogue.choices().some(choice=>choice.id==='secret')).toBe(true);
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:-1}]});
    expect(()=>dialogue.select('secret')).toThrow(/Unavailable/);
    const accept=dialogue.select('accept');state.transact({actions:accept.actions});dialogue.move(accept.nextNodeId!);
    expect(dialogue.choices().map(choice=>choice.id)).toEqual(['wrap-up']);
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:1}]});
    const ready=talk(map,'mara-lens',state,'demo:object.workshop.caretaker');
    state.transact({actions:[{type:'changeItem',itemId:'demo:item.lens',delta:-1}]});
    expect(ready.choices().find(choice=>choice.id==='hand-in')).toMatchObject({enabled:false,reason:'You need the polished lens in your inventory.'});
    expect(()=>ready.select('hand-in')).toThrow(/Unavailable/);
  });
  it('migrates a v1 discovery without accepting a quest or modifying its source',()=>{
    const legacy=json('tests/fixtures/saves/v1-lens-collected.json') as {session:{inventory:Record<string,number>};schemaVersion:number};
    const original=JSON.stringify(legacy);
    const index=validateStateIndex({schemaVersion:2,gameId:'demo:game.foundation',saveCompatibilityVersion:2,maps:[{id:'demo:map.workshop',name:'Workshop',width:20,height:12,spawns:['start']},{id:'demo:map.gallery',name:'Gallery',width:24,height:14,spawns:['start']}],itemIds:items.items.map(item=>item.id),factIds:facts.facts.map(fact=>fact.id),placementIds:['demo:object.gallery.lens-chest'],questIds:quests.map((quest:{id:string})=>quest.id)});
    const migrated=validateSaveEnvelope(legacy,{gameId:'demo:game.foundation',saveCompatibilityVersion:2,index});
    expect(migrated).toMatchObject({schemaVersion:2,saveCompatibilityVersion:2,storageRevision:3,session:{quests:{},inventory:{'demo:item.lens':1}}});
    expect(JSON.stringify(legacy)).toBe(original);
  });
  it('loads an old slot in memory and writes v2 only on an explicit save',async()=>{
    const old=json('tests/fixtures/saves/v1-lens-collected.json') as SaveEnvelopeV1;
    const index=validateStateIndex({schemaVersion:2,gameId:'demo:game.foundation',saveCompatibilityVersion:2,maps:[{id:'demo:map.gallery',name:'Gallery',width:24,height:14,spawns:['start']}],itemIds:items.items.map(item=>item.id),factIds:facts.facts.map(fact=>fact.id),placementIds:['demo:object.gallery.lens-chest'],questIds:quests.map((quest:{id:string})=>quest.id)});
    const context={gameId:'demo:game.foundation',saveCompatibilityVersion:2,index};
    let stored:SaveRecord={slotId:'slot-2',current:old},writes=0;
    const repository:SaveRepository={list:async()=>[stored],read:async()=>stored,write:async(slotId,envelope,revision):Promise<WriteResult>=>{writes++;expect(revision).toBe(3);stored={slotId,current:envelope,previous:stored.current};return{kind:'written',record:stored};},recoverPrevious:async():Promise<WriteResult>=>({kind:'failed',reason:'unknown',message:'unused'}),remove:async():Promise<RemoveResult>=>({kind:'removed'}),close:()=>{}};
    const service=new SaveService(context,repository);await service.refresh();const loaded=await service.load('slot-2');
    expect(loaded.schemaVersion).toBe(2);expect(writes).toBe(0);expect(stored.current.schemaVersion).toBe(1);
    const state=new SessionState({items,facts,quests},loaded.session);
    const written=await service.save('slot-2',loaded.checkpoint,state);
    expect(written.kind).toBe('written');expect(writes).toBe(1);expect(stored.current.schemaVersion).toBe(2);expect(stored.previous?.schemaVersion).toBe(1);
  });
  it('loads a pre-supply-room v2 save after additive map, item and placement IDs',()=>{
    const oldIndex=validateStateIndex({schemaVersion:2,gameId:'demo:game.foundation',saveCompatibilityVersion:2,
      maps:[{id:'demo:map.workshop',name:'The Workshop',width:20,height:12,spawns:['start','from-gallery']},{id:'demo:map.gallery',name:'The Pillar Gallery',width:24,height:14,spawns:['start','from-workshop','from-storeroom']},{id:'demo:map.storeroom',name:'Gallery Storeroom',width:8,height:6,spawns:['from-gallery']}],
      itemIds:items.items.filter(item=>item.id!=='demo:item.workshop-key').map(item=>item.id),factIds:facts.facts.map(fact=>fact.id),
      placementIds:[...workshop().objects,...gallery().objects,...readMap(json('content/games/demo/maps/storeroom.json')).objects].map(object=>object.id).filter(id=>!id.startsWith('demo:object.workshop.supply-')),
      questIds:quests.map((quest:{id:string})=>quest.id)});
    const oldContext={gameId:'demo:game.foundation',saveCompatibilityVersion:2,index:oldIndex};
    const state=session();state.transact({actions:[{type:'changeItem',itemId:'demo:item.brass-key',delta:1},{type:'markPlacementOpened',placementId:'demo:object.gallery.storeroom-door'},{type:'setQuestState',questId:'demo:quest.archive-ledger',value:'active'}]});
    const saved=createEnvelope('slot-1',7,oldContext,{mapId:'demo:map.gallery',tile:{x:22,y:3},facing:'right'},state);
    const newIndex=validateStateIndex({schemaVersion:2,gameId:'demo:game.foundation',saveCompatibilityVersion:2,
      maps:[...oldIndex.maps,{id:'demo:map.supply-room',name:'Workshop Supply Room',width:8,height:6,spawns:['from-workshop']}],
      itemIds:items.items.map(item=>item.id),factIds:oldIndex.factIds,
      placementIds:[...oldIndex.placementIds,'demo:object.workshop.supply-key-chest','demo:object.workshop.supply-door','demo:object.supply-room.return-door'],questIds:oldIndex.questIds});
    expect(validateSaveEnvelope(saved,{gameId:'demo:game.foundation',saveCompatibilityVersion:2,index:newIndex})).toEqual(saved);
    expect(saved.session.inventory['demo:item.brass-key']).toBe(1);
    expect(saved.session.placements['demo:object.gallery.storeroom-door']?.opened).toBe(true);
    expect(saved.session.quests?.['demo:quest.archive-ledger']).toBe('active');
    expect(saved.storageRevision).toBe(7);
  });
});
