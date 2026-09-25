import type { SessionData,SessionState } from './session';
export const SAVE_FORMAT='rpgameworks-save';export const SAVE_SCHEMA_VERSION=2;export const MAX_IMPORT_BYTES=256*1024;
export const SLOT_IDS=['slot-1','slot-2','slot-3'] as const;export type SaveSlotId=typeof SLOT_IDS[number];
export interface SaveCheckpoint{readonly mapId:string;readonly tile:{readonly x:number;readonly y:number};readonly facing:'up'|'down'|'left'|'right'}
/** Retained name for callers; validation returns the current envelope and accepts legacy v1. */
export interface SaveEnvelopeV1{readonly format:typeof SAVE_FORMAT;readonly schemaVersion:1|2;readonly gameId:string;readonly saveCompatibilityVersion:number;readonly slotId:SaveSlotId;readonly storageRevision:number;readonly savedAt:string;readonly checkpoint:SaveCheckpoint;readonly session:SessionData}
export interface StateIndex{readonly schemaVersion:1|2;readonly gameId:string;readonly saveCompatibilityVersion:number;readonly maps:readonly{readonly id:string;readonly name:string;readonly width:number;readonly height:number;readonly spawns:readonly string[]}[];readonly itemIds:readonly string[];readonly factIds:readonly string[];readonly placementIds:readonly string[];readonly questIds?:readonly string[]}
export interface SaveContext{readonly gameId:string;readonly saveCompatibilityVersion:number;readonly index:StateIndex}
const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:Record<string,unknown>,keys:readonly string[]):boolean=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function validateStateIndex(value:unknown):StateIndex{
  if(!plain(value)||![1,2].includes(Number(value.schemaVersion))||!exact(value,['schemaVersion','gameId','saveCompatibilityVersion','maps','itemIds','factIds','placementIds',...(value.schemaVersion===2?['questIds']:[])])||typeof value.gameId!=='string'||!Number.isSafeInteger(value.saveCompatibilityVersion)||(value.saveCompatibilityVersion as number)<1||!Array.isArray(value.maps)||!Array.isArray(value.itemIds)||!Array.isArray(value.factIds)||!Array.isArray(value.placementIds)||(value.schemaVersion===2&&!Array.isArray(value.questIds)))throw new Error('Invalid save state index');
  const mapIds=new Set<string>();for(const map of value.maps){if(!plain(map)||!exact(map,['id','name','width','height','spawns'])||typeof map.id!=='string'||typeof map.name!=='string'||!Number.isSafeInteger(map.width)||!Number.isSafeInteger(map.height)||(map.width as number)<1||(map.height as number)<1||!Array.isArray(map.spawns)||!map.spawns.every(spawn=>typeof spawn==='string')||mapIds.has(map.id))throw new Error('Invalid save state index map');mapIds.add(map.id);}
  for(const ids of [value.itemIds,value.factIds,value.placementIds,...(Array.isArray(value.questIds)?[value.questIds]:[])])if(!ids.every(id=>typeof id==='string')||new Set(ids).size!==ids.length)throw new Error('Invalid save state index identifiers');
  return structuredClone(value) as unknown as StateIndex;
}
export function validateSaveEnvelope(value:unknown,context:SaveContext):SaveEnvelopeV1{
  if(!plain(value)||!exact(value,['format','schemaVersion','gameId','saveCompatibilityVersion','slotId','storageRevision','savedAt','checkpoint','session']))throw new Error('Save envelope has an invalid shape');
  if(value.format!==SAVE_FORMAT||(value.schemaVersion!==1&&value.schemaVersion!==2))throw new Error('Unsupported save format or version');
  if(value.gameId!==context.gameId)throw new Error('Save belongs to a different game');
  const legacy=value.schemaVersion===1&&value.saveCompatibilityVersion===1&&context.saveCompatibilityVersion===2&&context.index.schemaVersion===2;
  if(value.saveCompatibilityVersion!==context.saveCompatibilityVersion&&!legacy)throw new Error('Save is not compatible with this content version');
  if(value.schemaVersion!==context.index.schemaVersion&&!legacy)throw new Error('Save schema is not compatible with this content version');
  if(!SLOT_IDS.includes(value.slotId as SaveSlotId)||!Number.isSafeInteger(value.storageRevision)||(value.storageRevision as number)<1)throw new Error('Save slot or revision is invalid');
  if(typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt as string)))throw new Error('Save timestamp is invalid');
  const checkpoint=value.checkpoint;if(!plain(checkpoint)||!exact(checkpoint,['mapId','tile','facing'])||typeof checkpoint.mapId!=='string'||!plain(checkpoint.tile)||!exact(checkpoint.tile,['x','y'])||!Number.isSafeInteger(checkpoint.tile.x)||!Number.isSafeInteger(checkpoint.tile.y)||!['up','down','left','right'].includes(String(checkpoint.facing)))throw new Error('Save checkpoint is invalid');
  const map=context.index.maps.find(candidate=>candidate.id===checkpoint.mapId);if(!map)throw new Error(`Unknown saved map: ${checkpoint.mapId}`);
  if((checkpoint.tile.x as number)<0||(checkpoint.tile.y as number)<0||(checkpoint.tile.x as number)>=map.width||(checkpoint.tile.y as number)>=map.height)throw new Error('Saved checkpoint is outside its map');
  const session=value.session;if(!plain(session)||!exact(session,['inventory','facts','placements',...(value.schemaVersion===2?['quests']:[])])||!plain(session.inventory)||!plain(session.facts)||!plain(session.placements)||(value.schemaVersion===2&&!plain(session.quests)))throw new Error('Saved session is invalid');
  const items=new Set(context.index.itemIds),facts=new Set(context.index.factIds),placements=new Set(context.index.placementIds);
  for(const[id,count]of Object.entries(session.inventory))if(!items.has(id)||!Number.isSafeInteger(count)||Number(count)<1||Number(count)>9999)throw new Error(`Invalid saved item: ${id}`);
  for(const[id,fact]of Object.entries(session.facts))if(!facts.has(id)||typeof fact!=='boolean')throw new Error(`Invalid saved fact: ${id}`);
  for(const[id,state]of Object.entries(session.placements))if(!placements.has(id)||!plain(state)||!exact(state,['opened'])||state.opened!==true)throw new Error(`Invalid saved placement: ${id}`);
  const questIds=new Set(context.index.questIds??[]);
  if(value.schemaVersion===2)for(const[id,state]of Object.entries(session.quests as Record<string,unknown>))if(!questIds.has(id)||(state!=='active'&&state!=='completed'))throw new Error(`Invalid saved quest: ${id}`);
  if(legacy)return structuredClone({...value,schemaVersion:2,saveCompatibilityVersion:2,session:{...session,quests:{}}}) as SaveEnvelopeV1;
  return structuredClone(value) as unknown as SaveEnvelopeV1;
}
export function createEnvelope(slotId:SaveSlotId,storageRevision:number,context:SaveContext,checkpoint:SaveCheckpoint,session:SessionState,now=new Date()):SaveEnvelopeV1{
  const schemaVersion=context.index.schemaVersion;
  const data=structuredClone(session.data());
  const savedSession=schemaVersion===1?{inventory:data.inventory,facts:data.facts,placements:data.placements}:data;
  return validateSaveEnvelope({format:SAVE_FORMAT,schemaVersion,gameId:context.gameId,saveCompatibilityVersion:context.saveCompatibilityVersion,slotId,storageRevision,savedAt:now.toISOString(),checkpoint,session:savedSession},context);
}
export function parseImport(bytes:Uint8Array,context:SaveContext):SaveEnvelopeV1{
  if(bytes.byteLength>MAX_IMPORT_BYTES)throw new Error('Import exceeds 256 KiB');let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('Import is not valid UTF-8');}
  let value:unknown;try{value=JSON.parse(text);}catch{throw new Error('Import is not valid JSON');}return validateSaveEnvelope(value,context);
}
