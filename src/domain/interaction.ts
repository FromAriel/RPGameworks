import type { MapDefinition } from '../content/generated/map';
import type { Actor,Tile } from './movement';
export type MapExit=MapDefinition['exits'][number];
export type MapMessage=NonNullable<MapDefinition['messages']>[number];
export interface ObjectTarget{objectId:string}
const offsets={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]} as const;
export function createInteractionLookup(map:MapDefinition):(actor:Actor)=>ObjectTarget|null{
  const cells=new Map<string,ObjectTarget>();for(const object of map.objects)if(object.messageId||object.chest||object.states?.some(state=>state.interaction))cells.set(`${object.x},${object.y}`,{objectId:object.id});
  return actor=>{if(actor.motion)return null;const[dx,dy]=offsets[actor.facing];return cells.get(`${actor.tile.x+dx},${actor.tile.y+dy}`)??null;};
}
export class ExitLatch{
  private occupied:string|null;constructor(private readonly exits:readonly MapExit[],spawn:Tile){this.occupied=this.at(spawn)?.id??null;}
  private at(tile:Tile):MapExit|undefined{return this.exits.find(exit=>tile.x>=exit.x&&tile.x<exit.x+exit.width&&tile.y>=exit.y&&tile.y<exit.y+exit.height);}
  arrive(tile:Tile):MapExit|null{const exit=this.at(tile),previous=this.occupied;this.occupied=exit?.id??null;return exit&&exit.id!==previous?exit:null;}
}
export class MessageSession{
  private index=0;constructor(readonly objectId:string,readonly message:MapMessage,private readonly strings:Readonly<Record<string,string>>){}
  get id():string{return this.message.id;}get page():number{return this.index+1;}get total():number{return this.message.pages.length;}
  get speaker():string{return this.string(this.message.speakerKey);}get text():string{return this.string(this.message.pages[this.index]!);}
  advance():boolean{if(this.index+1>=this.message.pages.length)return false;this.index+=1;return true;}
  private string(key:string):string{const value=this.strings[key];if(value===undefined)throw new Error(`Missing interaction string: ${key}`);return value;}
}
