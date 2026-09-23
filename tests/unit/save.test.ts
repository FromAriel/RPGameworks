import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFacts, readItems } from '../../src/content/validation.mjs';
import { createEnvelope, MAX_IMPORT_BYTES, parseImport, validateSaveEnvelope, validateStateIndex } from '../../src/domain/save';
import type { SaveContext, SaveEnvelopeV1, SaveSlotId, StateIndex } from '../../src/domain/save';
import { SessionState } from '../../src/domain/session';
import type { RemoveResult, SaveRecord, SaveRepository, WriteResult } from '../../src/platform/save-repository';
import { SaveService } from '../../src/runtime/save-service';

const json=(path:string):unknown=>JSON.parse(readFileSync(path,'utf8')) as unknown;
const definitions=()=>({items:readItems(json('content/games/demo/items.json')),facts:readFacts(json('content/games/demo/facts.json'))});
/** Derived from the authored demo pack so content additions cannot strand these tests on a stale index. */
const stateIndex=():StateIndex=>{
  const items=readItems(json('content/games/demo/items.json')),facts=readFacts(json('content/games/demo/facts.json'));
  const game=json('content/games/demo/game.json') as {maps:{file:string}[]};
  const maps=game.maps.map(entry=>json(`content/games/demo/${entry.file}`)) as {id:string;name:string;width:number;height:number;spawns:{id:string}[];objects:{id:string}[]}[];
  return validateStateIndex({schemaVersion:1,gameId:'demo:game.foundation',saveCompatibilityVersion:1,
    maps:maps.map((map)=>({id:map.id,name:map.name,width:map.width,height:map.height,spawns:map.spawns.map((spawn)=>spawn.id)})),
    itemIds:items.items.map(item=>item.id),factIds:facts.facts.map(fact=>fact.id),
    placementIds:maps.flatMap((map)=>map.objects.map(object=>object.id))});
};
const context=():SaveContext=>({gameId:'demo:game.foundation',saveCompatibilityVersion:1,index:validateStateIndex(stateIndex())});
const checkpoint=()=>({mapId:'demo:map.gallery',tile:{x:7,y:8},facing:'right' as const});
const progressed=()=>{const session=new SessionState(definitions());session.transact({actions:[{type:'setFact',factId:'demo:fact.gallery.plaque-read',value:true},{type:'changeItem',itemId:'demo:item.lens',delta:1},{type:'markPlacementOpened',placementId:'demo:object.gallery.lens-chest'}]});return session;};

class MemoryRepository implements SaveRepository{
  readonly records=new Map<SaveSlotId,SaveRecord>();failure:Extract<WriteResult,{kind:'failed'}>|null=null;
  async list(){return [...this.records.values()].map(value=>structuredClone(value));}
  async read(slotId:SaveSlotId){return structuredClone(this.records.get(slotId)??null);}
  async write(slotId:SaveSlotId,envelope:SaveEnvelopeV1,expectedRevision:number):Promise<WriteResult>{
    if(this.failure)return this.failure;const existing=this.records.get(slotId),actual=existing?.current.storageRevision??0;
    if(actual!==expectedRevision)return{kind:'stale',actualRevision:actual};
    const record:SaveRecord={slotId,current:structuredClone(envelope),...(existing?{previous:structuredClone(existing.current)}:{})};this.records.set(slotId,record);return{kind:'written',record:structuredClone(record)};
  }
  async recoverPrevious(slotId:SaveSlotId,expectedRevision:unknown):Promise<WriteResult>{const record=this.records.get(slotId),actual=record?.current.storageRevision;if(!record?.previous)return{kind:'failed',reason:'unknown',message:'missing'};if(!Object.is(actual,expectedRevision))return{kind:'stale',actualRevision:Number(actual)||0};const revision=Math.max(record.previous.storageRevision,Number.isSafeInteger(actual)?Number(actual):0)+1,next:SaveRecord={slotId,current:{...record.previous,storageRevision:revision},previous:record.previous};this.records.set(slotId,next);return{kind:'written',record:next};}
  async remove(slotId:SaveSlotId,expectedRevision:number):Promise<RemoveResult>{const actual=this.records.get(slotId)?.current.storageRevision??0;if(actual!==expectedRevision)return{kind:'stale',actualRevision:actual};this.records.delete(slotId);return{kind:'removed'};}
  close(){}
}

describe('versioned save envelopes',()=>{
  it.each(['v1-empty.json','v1-plaque-read.json','v1-lens-collected.json'])('keeps immutable v1 fixture %s loadable',file=>{
    expect(()=>validateSaveEnvelope(json(`tests/fixtures/saves/${file}`),context())).not.toThrow();
  });
  it('keeps the immutable previous/current pair loadable',()=>{
    const record=json('tests/fixtures/saves/v1-record-pair.json') as {current:unknown;previous:unknown};
    expect(validateSaveEnvelope(record.current,context()).storageRevision).toBe(2);expect(validateSaveEnvelope(record.previous,context()).storageRevision).toBe(1);
  });
  it('round-trips only pure persistent state and checkpoint data',()=>{
    const envelope=createEnvelope('slot-1',3,context(),checkpoint(),progressed(),new Date('2026-09-20T12:00:00.000Z'));
    expect(validateSaveEnvelope(structuredClone(envelope),context())).toEqual(envelope);
    expect(envelope.session).toEqual({inventory:{'demo:item.lens':1},facts:{'demo:fact.gallery.plaque-read':true,'demo:fact.gallery.gate-open':false},placements:{'demo:object.gallery.lens-chest':{opened:true}}});
    expect(JSON.stringify(envelope)).not.toMatch(/revision":1|dialog|particle|controller/i);
  });
  it.each([
    ['wrong game',(value:any)=>value.gameId='other:game'],['future schema',(value:any)=>value.schemaVersion=2],['incompatible content',(value:any)=>value.saveCompatibilityVersion=2],
    ['unknown item',(value:any)=>value.session.inventory={'demo:item.unknown':1}],['invalid quantity',(value:any)=>value.session.inventory={'demo:item.lens':0}],
    ['wrong fact type',(value:any)=>value.session.facts['demo:fact.gallery.plaque-read']='yes'],['unknown placement',(value:any)=>value.session.placements={'demo:object.unknown':{opened:true}}],
    ['unknown map',(value:any)=>value.checkpoint.mapId='demo:map.missing'],['outside checkpoint',(value:any)=>value.checkpoint.tile.x=999],['bad revision',(value:any)=>value.storageRevision=0],
  ])('rejects %s',(_name,change)=>{const value=structuredClone(createEnvelope('slot-1',1,context(),checkpoint(),progressed()));change(value);expect(()=>validateSaveEnvelope(value,context())).toThrow();});
  it('rejects malformed JSON, invalid UTF-8, and oversized imports',()=>{
    expect(()=>parseImport(new TextEncoder().encode('{'),context())).toThrow('valid JSON');
    expect(()=>parseImport(Uint8Array.from([0xff]),context())).toThrow('valid UTF-8');
    expect(()=>parseImport(new Uint8Array(MAX_IMPORT_BYTES+1),context())).toThrow('256 KiB');
  });
});

describe('save service concurrency and recovery',()=>{
  it('keeps current and previous revisions and rejects a stale writer',async()=>{
    const repository=new MemoryRepository(),first=new SaveService(context(),repository),second=new SaveService(context(),repository);
    await first.refresh();expect((await first.save('slot-1',checkpoint(),progressed())).kind).toBe('written');
    await first.refresh();await second.refresh();expect((await first.save('slot-1',checkpoint(),progressed())).kind).toBe('written');
    const stale=await second.save('slot-1',checkpoint(),progressed());expect(stale).toEqual({kind:'stale',actualRevision:2});
    expect(repository.records.get('slot-1')?.current.storageRevision).toBe(2);expect(repository.records.get('slot-1')?.previous?.storageRevision).toBe(1);
  });
  it.each(['unavailable','quota','aborted'] as const)('maps a controlled %s write failure without replacing the good slot',async reason=>{
    const repository=new MemoryRepository(),service=new SaveService(context(),repository);await service.refresh();await service.save('slot-1',checkpoint(),progressed());const before=structuredClone(repository.records.get('slot-1'));
    repository.failure={kind:'failed',reason,message:`${reason} fixture`};expect(await service.save('slot-1',checkpoint(),progressed())).toMatchObject({kind:'failed',reason});expect(repository.records.get('slot-1')).toEqual(before);
  });
  it('offers explicit previous-revision recovery when current is malformed',async()=>{
    const repository=new MemoryRepository(),valid=createEnvelope('slot-1',1,context(),checkpoint(),progressed());repository.records.set('slot-1',{slotId:'slot-1',current:{...valid,gameId:'wrong:game'} as SaveEnvelopeV1,previous:valid});
    const service=new SaveService(context(),repository);await service.refresh();expect(service.slots()[0]).toMatchObject({error:'Save belongs to a different game',recoverable:true});
    expect((await service.recover('slot-1')).kind).toBe('written');expect(repository.records.get('slot-1')?.current.gameId).toBe(context().gameId);
  });
  it('removes only the exact observed slot revision',async()=>{
    const repository=new MemoryRepository(),service=new SaveService(context(),repository);await service.refresh();await service.save('slot-1',checkpoint(),progressed());
    expect(await repository.remove('slot-1',0)).toEqual({kind:'stale',actualRevision:1});expect(await repository.remove('slot-1',1)).toEqual({kind:'removed'});expect(await repository.read('slot-1')).toBeNull();
  });
});
