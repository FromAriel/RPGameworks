import Phaser from 'phaser';
import { actorPosition,createActor } from '../domain/movement';
import { createInteractionLookup,ExitLatch } from '../domain/interaction';
import { actorOccupiedCells,createDynamicCollision,resolvedCanEnter } from '../domain/collision-view';
import type { DynamicCollision } from '../domain/collision-view';
import type { ResolvedObjectState } from '../domain/object-state';
import { objectDependencies,objectFrames,resolveObjectState } from '../domain/object-state';
import type { Tile } from '../domain/movement';
import type { DependencyKey,SessionState } from '../domain/session';
import type { SessionController } from '../runtime/session-controller';
import type { LoadedMap } from '../platform/map-loader';
import { validateMapFacts,validateMapItems } from '../content/validation.mjs';
import { CharacterArt, CharacterView } from './character-view';

export const TILE=16;export const ATLAS='foundation';export const PARTICLE_CAP=64;const BURST_SIZE=24;
type Visual=Phaser.GameObjects.Image|Phaser.GameObjects.Sprite|Phaser.GameObjects.Container|Phaser.GameObjects.Particles.ParticleEmitter;

export class MapView{
  readonly actor;readonly target;readonly exits;readonly collision:DynamicCollision;readonly hero:Phaser.GameObjects.Sprite;readonly emitter:Phaser.GameObjects.Particles.ParticleEmitter;
  bursts=0;private readonly owned:Visual[]=[];private disposed=false;private unsubscribe:(()=>void)|null=null;
  private characterView:CharacterView|null=null;private shown=false;
  private readonly definitions=new Map<string,LoadedMap['map']['objects'][number]>();
  private readonly visuals=new Map<string,Phaser.GameObjects.Image>();
  private readonly states=new Map<string,ResolvedObjectState>();
  readonly dependencies:ReadonlySet<DependencyKey>;
  constructor(private readonly scene:Phaser.Scene,readonly content:LoadedMap,readonly session:SessionState,art?:CharacterArt){
    const{map,spawn}=content;validateMapItems(map,session.catalog,map.id);validateMapFacts(map,session.factCatalog,map.id);this.actor={...createActor(spawn.x,spawn.y),facing:spawn.facing};this.target=createInteractionLookup(map);this.exits=new ExitLatch(map.exits,spawn);
    const dependencyKeys=new Set<DependencyKey>();for(const object of map.objects)for(const key of objectDependencies(object))dependencyKeys.add(key);this.dependencies=dependencyKeys;
    const frames=new Set([...Object.values(map.legend),...map.objects.flatMap(object=>objectFrames(object)), 'hero-up','hero-down','hero-left','hero-right','spark']);
    for(const frame of frames)if(!scene.textures.get(ATLAS).has(frame))throw new Error(`${map.id}: atlas frame does not exist: ${frame}`);
    try{
      map.layers.forEach((layer,layerIndex)=>layer.rows.forEach((row,y)=>{for(let x=0;x<row.length;x+=1){const symbol=row[x]!;if(symbol!=='.')this.own(scene.add.image(x*TILE,y*TILE,ATLAS,map.legend[symbol]!).setOrigin(0).setDepth(layerIndex/10));}}));
      for(const object of map.objects){this.definitions.set(object.id,object);const state=resolveObjectState(object,session);this.states.set(object.id,state);const visual=this.own(scene.add.image(object.x*TILE,object.y*TILE,ATLAS,state.frame).setOrigin(0).setDepth(.5));visual.setVisible(state.visible);this.visuals.set(object.id,visual);}
    this.collision=createDynamicCollision(map,[...this.states.values()]);
      const position=actorPosition(this.actor,TILE);this.hero=this.own(scene.add.sprite(position.x,position.y,ATLAS,`hero-${spawn.facing}`).setDepth(1));
      this.emitter=this.own(scene.add.particles(0,0,ATLAS,{frame:'spark',emitting:false,lifespan:{min:220,max:480},speed:{min:22,max:70},angle:{min:0,max:360},gravityY:28,alpha:{start:1,end:0},quantity:BURST_SIZE,maxParticles:PARTICLE_CAP,maxAliveParticles:PARTICLE_CAP,blendMode:Phaser.BlendModes.NORMAL}).setDepth(2));
      if(art?.ready)this.attachCharacterArt(art);
    }catch(cause){this.destroy();throw cause;}
  }
  private own<T extends Visual>(object:T):T{this.owned.push(object);object.setVisible(false);return object;}
  bind(controller:SessionController):void{this.unsubscribe?.();if(this.dependencies.size)this.unsubscribe=controller.subscribe(this.dependencies,result=>this.refresh(result.changed));}
  show():void{this.shown=true;this.scene.cameras.main.setBounds(0,0,this.content.map.width*TILE,this.content.map.height*TILE);this.scene.cameras.main.startFollow(this.hero,true,1,1);for(const object of this.owned)object.setVisible(true);if(this.characterView)this.hero.setVisible(false);this.refresh();}
  attachCharacterArt(art:CharacterArt):void{if(this.disposed||this.characterView||!art.ready)return;const view=art.createView(this.scene);this.characterView=view;this.own(view.container);this.sync();if(this.shown){view.container.setVisible(true);this.hero.setVisible(false);}}
  get heroArt(): 'static'|'layered' { return this.characterView?'layered':'static'; }
  get heroFrame(): string|null { return this.characterView?.frame??null; }
  get heroMirrored(): boolean { return this.characterView?.mirrored??false; }
  get heroFeet(): {x:number,y:number}|null { return this.characterView?{x:this.characterView.container.x,y:this.characterView.container.y}:null; }
  resolve(id:string):ResolvedObjectState|null{const object=this.definitions.get(id);if(!object)return null;const state=resolveObjectState(object,this.session);this.states.set(id,state);return state;}
  refresh(changed?:ReadonlySet<DependencyKey>):void{
    const updated:ResolvedObjectState[]=[];
    for(const[id,object]of this.definitions){const dependencies=objectDependencies(object);if(changed&&![...changed].some(key=>dependencies.has(key)))continue;const state=resolveObjectState(object,this.session);this.states.set(id,state);const visual=this.visuals.get(id)!;visual.setFrame(state.frame);visual.setVisible(state.visible);updated.push(state);}
    if(updated.length)this.collision.update(updated,actorOccupiedCells(this.actor));
  }
  get occupant():ReadonlySet<string>{return actorOccupiedCells(this.actor);}
  /** Canonical (deferral-free) check: a save or export whose checkpoint restores into a room that resolves this tile solid would be unloadable. */
  checkpointBlocked(tile:Tile):boolean{return !resolvedCanEnter(this.content.map,[...this.states.values()],tile.x,tile.y);}
  releaseDeferred():void{this.collision.release(this.occupant);}
  sync(deltaMs=0):void{const position=actorPosition(this.actor,TILE);this.hero.setPosition(Math.round(position.x),Math.round(position.y));const frame=`hero-${this.actor.facing}`;if(this.hero.frame.name!==frame)this.hero.setFrame(frame);this.characterView?.sync(this.actor,position.x,position.y,deltaMs);}
  burst(enabled:boolean):void{this.bursts+=1;if(!enabled)return;const available=Math.max(0,PARTICLE_CAP-this.emitter.getAliveParticleCount());if(available>0)this.emitter.explode(Math.min(BURST_SIZE,available),this.hero.x,this.hero.y);}
  destroy():void{if(this.disposed)return;this.disposed=true;this.unsubscribe?.();this.unsubscribe=null;for(let i=this.owned.length-1;i>=0;i-=1)this.owned[i]!.destroy();this.owned.length=0;this.visuals.clear();this.states.clear();this.definitions.clear();}
}
