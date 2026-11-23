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
import { MapHeroView } from './map-hero-view';
import type { MapHeroArt } from './map-hero-view';
import { EffectRunner } from './effects/runner';
import { cameraAxis } from '../domain/viewport';

export const ATLAS='foundation';
type Visual=Phaser.GameObjects.Image|Phaser.GameObjects.Sprite|Phaser.GameObjects.Container;

export class MapView{
  readonly actor;readonly target;readonly tile:number;readonly exits;readonly collision:DynamicCollision;readonly hero:Phaser.GameObjects.Sprite;readonly effects:EffectRunner;
  bursts=0;private readonly owned:Visual[]=[];private disposed=false;private unsubscribe:(()=>void)|null=null;
  private heroView:MapHeroView|null=null;private shown=false;
  private readonly definitions=new Map<string,LoadedMap['map']['objects'][number]>();
  private readonly visuals=new Map<string,Phaser.GameObjects.Image>();
  private readonly states=new Map<string,ResolvedObjectState>();
  readonly dependencies:ReadonlySet<DependencyKey>;
  constructor(private readonly scene:Phaser.Scene,readonly content:LoadedMap,readonly session:SessionState,art?:MapHeroArt|null){
    const{map,spawn}=content;this.tile=map.tileSize;validateMapItems(map,session.catalog,map.id);validateMapFacts(map,session.factCatalog,map.id);this.actor={...createActor(spawn.x,spawn.y),facing:spawn.facing};this.target=createInteractionLookup(map);this.exits=new ExitLatch(map.exits,spawn);
    const dependencyKeys=new Set<DependencyKey>();for(const object of map.objects)for(const key of objectDependencies(object))dependencyKeys.add(key);this.dependencies=dependencyKeys;
    const frames=new Set([...Object.values(map.legend),...map.objects.flatMap(object=>objectFrames(object)), 'hero-up','hero-down','hero-left','hero-right','spark']);
    for(const frame of frames)if(!scene.textures.get(ATLAS).has(frame))throw new Error(`${map.id}: atlas frame does not exist: ${frame}`);
    try{
      map.layers.forEach((layer,layerIndex)=>layer.rows.forEach((row,y)=>{for(let x=0;x<row.length;x+=1){const symbol=row[x]!;if(symbol!=='.')this.own(scene.add.image(x*this.tile,y*this.tile,ATLAS,map.legend[symbol]!).setOrigin(0).setDepth(layerIndex/10));}}));
      for(const object of map.objects){this.definitions.set(object.id,object);const state=resolveObjectState(object,session);this.states.set(object.id,state);const visual=this.own(scene.add.image(object.x*this.tile,object.y*this.tile,ATLAS,state.frame).setOrigin(0).setDepth(.5));visual.setVisible(state.visible);this.visuals.set(object.id,visual);}
    this.collision=createDynamicCollision(map,[...this.states.values()]);
      const position=actorPosition(this.actor,this.tile);this.hero=this.own(scene.add.sprite(position.x,position.y,ATLAS,`hero-${spawn.facing}`).setDepth(1));
      this.effects=new EffectRunner(scene,ATLAS,id=>id==='hero'?{x:this.hero.x,y:this.hero.y}:null);
      if(art)this.attachHeroArt(art);
    }catch(cause){this.destroy();throw cause;}
  }
  private own<T extends Visual>(object:T):T{this.owned.push(object);object.setVisible(false);return object;}
  bind(controller:SessionController):void{this.unsubscribe?.();if(this.dependencies.size)this.unsubscribe=controller.subscribe(this.dependencies,result=>this.refresh(result.changed));}
  show():void{this.shown=true;const camera=this.scene.cameras.main,x=cameraAxis(this.content.map.width*this.tile,camera.width),y=cameraAxis(this.content.map.height*this.tile,camera.height);camera.setBounds(x.offset,y.offset,x.length,y.length);this.scene.cameras.main.startFollow(this.hero,true,1,1);for(const object of this.owned)object.setVisible(true);if(this.heroView)this.hero.setVisible(false);this.refresh();}
  /** Draw the hero from the party's LPC art (decision 0019 S1.5f); until then, or without it, the placeholder frame. */
  attachHeroArt(art:MapHeroArt):void{if(this.disposed||this.heroView)return;const view=new MapHeroView(this.scene,art,this.tile);this.heroView=view;this.own(view.sprite);this.sync();if(this.shown){view.sprite.setVisible(true);this.hero.setVisible(false);}}
  get heroArt(): 'static'|'lpc' { return this.heroView?'lpc':'static'; }
  get heroFrame(): string|null { return this.heroView?.frame??null; }
  get heroFeet(): {x:number,y:number}|null { return this.heroView?{x:this.heroView.sprite.x,y:this.heroView.sprite.y}:null; }
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
  sync(deltaMs=0):void{const position=actorPosition(this.actor,this.tile);this.hero.setPosition(Math.round(position.x),Math.round(position.y));const frame=`hero-${this.actor.facing}`;if(this.hero.frame.name!==frame)this.hero.setFrame(frame);this.heroView?.sync(this.actor,position.x,position.y,deltaMs);this.effects.update(deltaMs);}
  burst(enabled:boolean):void{this.bursts+=1;this.effects.setQuality(enabled?'standard':'reduced');this.effects.request({effectId:'demo:fx.impact',anchor:{kind:'actor',id:'hero'},seed:this.bursts});}
  setEffectsEnabled(enabled:boolean):void{this.effects.setQuality(enabled?'standard':'reduced');}
  destroy():void{if(this.disposed)return;this.disposed=true;this.unsubscribe?.();this.unsubscribe=null;this.effects?.dispose();for(let i=this.owned.length-1;i>=0;i-=1)this.owned[i]!.destroy();this.owned.length=0;this.visuals.clear();this.states.clear();this.definitions.clear();}
}
