import Phaser from 'phaser';
import type { SessionController } from '../runtime/session-controller';
import { InventoryMenu } from './ui/inventory';
import { SaveMenu } from './ui/save-menu';
import type { SaveCheckpoint,SaveEnvelopeV1 } from '../domain/save';
import { SessionState } from '../domain/session';
import type { SaveService } from '../runtime/save-service';
import { actorPosition, advanceActor, createActor } from '../domain/movement';
import { viewportScale } from '../domain/viewport';
import { InputController } from '../platform/input';
import { MessageSession } from '../domain/interaction';
import { DialogueSession } from '../domain/dialogue';
import { BattleSession } from '../domain/battle';
import { loadEncounter } from '../platform/encounter-loader';
import type { MapExit } from '../domain/interaction';
import { TransitionTask } from '../runtime/transition';
import { loadMapCheckpoint,loadMapDestination } from '../platform/map-loader';
import type { InputMode } from '../platform/input';
import { MapView, ATLAS } from './map-view';
import { InteractionDialog } from './ui/interaction-dialog';
import { CharacterArt } from './character-view';
import type { ConfirmationDialogParts, PromptEntry } from './ui/components';
import type { GamepadSource } from '../platform/gamepad';
import type { LoadedMap } from '../platform/map-loader';
import type { FoundationHandle, RuntimeSnapshot } from '../runtime-types';

const SCENE = 'rpgameworks:map';

export interface FoundationElements {
  session: SessionController;
  inventory: HTMLDialogElement;
  saveDialog: HTMLDialogElement;
  saveConfirmation: ConfirmationDialogParts;
  saves: SaveService;
  base: URL;
  inventoryPrompt: () => PromptEntry[];
  openSettings: () => void;
  closeTools: () => void;
  toolsOwnInput: () => boolean;
  updateTools: (deltaMs: number) => void;
  stage: HTMLElement;
  controls: HTMLElement;
  burst: HTMLButtonElement;
  restart: HTMLButtonElement;
  effects: HTMLInputElement;
  gamepad: GamepadSource;
  canPlay: () => boolean;
  canRestart: () => boolean;
  dialog: HTMLDialogElement;
  interact: HTMLButtonElement;
  onArtWarning: (message: string | null) => void;
}

export function createFoundation(elements: FoundationElements, onError: (message: string) => void, content: LoadedMap): FoundationHandle {
  // Logical canvas and world tile size come from the validated game manifest (decision 0008).
  const WIDTH = content.game.view.width, HEIGHT = content.game.view.height, TILE = content.game.tileSize;
  const spawnActor = () => ({ ...createActor(content.spawn.x, content.spawn.y), facing: content.spawn.facing });
  let transitions = 0, cancelledTransitions = 0, failedTransitions = 0;
  let starts = 0;
  let stops = 0;
  let phase: RuntimeSnapshot['phase'] = 'booting';
  let current: MapScene | null = null;
  let disposed = false;
  let resizeFrame: number | null = null;
  let appliedScale = 0;
  const appLifetime = new AbortController();
  let characterArt: CharacterArt | null = null;
  let characterArtStatus: RuntimeSnapshot['characterArtStatus'] = 'loading';

  class MapScene extends Phaser.Scene {
    room: MapView | null = null;
    inputOwner: InputController | null = null;
    mode: InputMode = 'exploration';
    message: MessageSession | null = null;
    dialogue:DialogueSession|null=null;
    battle: BattleSession | null = null;
    private battleLoad: AbortController | null = null;
    private battleObjectId: string | null = null;
    transitionError: string | null = null;
    private sceneLifetime: AbortController | null = null;
    private transfer = new TransitionTask<LoadedMap>();
    private generation = 0;
    private lastExit: MapExit | null = null;
    private readonly dialog = new InteractionDialog(elements.dialog,()=>this.cancelModal());
    private inventory: InventoryMenu | null = null;
    private saveMenu: SaveMenu | null = null;
    private menuPending = false;

    openInventory(): void {
      if (phase !== 'ready' || this.mode !== 'exploration') return;
      if (this.room?.actor.motion) { this.menuPending = true; this.inputOwner?.clear(); return; }
      this.menuPending = false;
      elements.closeTools();
      this.setMode('inventory');
      this.inventory?.open();
    }

    constructor() { super(SCENE); }

    preload(): void {
      if (this.textures.exists(ATLAS)) return;
      const fail = (): void => { phase = 'error'; onError('The foundation atlas failed to load. Reload, or check the static asset base path.'); };
      this.load.on('loaderror', fail);
      this.load.once('complete', () => this.load.off('loaderror', fail));
      const base = import.meta.env.BASE_URL;
      this.load.atlas(ATLAS, `${base}generated/foundation.png`, `${base}generated/foundation.json`);
    }

    create(): void {
      try {
        if (phase === 'error' || disposed) return;
        // Register cleanup before constructing anything that can fail.
        this.sceneLifetime = new AbortController();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
        this.events.once(Phaser.Scenes.Events.DESTROY, this.release, this);
        this.transfer = new TransitionTask<LoadedMap>();
        this.mode = 'exploration'; this.message = null;this.dialogue=null;this.battle=null; this.transitionError = null; this.menuPending = false;
        this.cameras.main.setRoundPixels(true);
        characterArt ??= new CharacterArt(this.textures, import.meta.env.BASE_URL);
        this.room = new MapView(this, content, elements.session.current, characterArt);
        this.room.bind(elements.session);
        this.room.show();
        this.inputOwner = new InputController(elements.stage, elements.controls, elements.burst,
          elements.gamepad, elements.canPlay, elements.dialog, elements.inventory,elements.saveDialog);
        starts += 1;
        current = this;
        this.room.setEffectsEnabled(elements.effects.checked);
        elements.effects.addEventListener('change', () => this.room?.setEffectsEnabled(elements.effects.checked), { signal: this.sceneLifetime.signal });
        elements.restart.addEventListener('click', () => {
          // Restart is deliberately unavailable while a message or transfer owns input.
          if (this.mode !== 'exploration' || !elements.canRestart()) return;
          this.inputOwner?.clear();
          this.scene.restart();
        }, { signal: this.sceneLifetime.signal });
        elements.burst.disabled = false; elements.restart.disabled = false; elements.interact.disabled = false;
        this.inventory = new InventoryMenu(elements.inventory, elements.session,
          () => this.resume(), () => { this.resume(); elements.openSettings(); },()=>this.openSaves(),elements.inventoryPrompt);
        this.saveMenu=new SaveMenu(elements.saveDialog,elements.saves,elements.session,()=>this.checkpoint(),envelope=>this.loadSave(envelope),()=>this.returnToInventory(),elements.saveConfirmation,()=>this.inputOwner?.clear(),reason=>this.checkpointReason(reason));
        phase = 'ready';
        scheduleResize();
        const lifetime = this.sceneLifetime.signal;
        void characterArt.load(lifetime).then(() => {
          if (disposed || lifetime.aborted || this.sceneLifetime?.signal !== lifetime) return;
          this.room?.attachCharacterArt(characterArt!);
          characterArtStatus = 'ready';
          elements.onArtWarning(null);
        }).catch((cause: unknown) => {
          if (lifetime.aborted || disposed) return;
          characterArtStatus = 'fallback';
          elements.onArtWarning(`Character art could not load; the original hero remains playable. ${cause instanceof Error ? cause.message : String(cause)}`);
        });
      } catch (cause) { this.fail(cause); }
    }

    update(_time: number, delta: number): void {
      try { this.updateMap(delta); } catch (cause) { this.fail(cause); }
    }

    private updateMap(delta: number): void {
      const input = this.inputOwner, room = this.room;
      if (!input || !room || phase !== 'ready') return;
      // Input clears on hiding. Preserve the established committed-step behavior
      // when the engine still updates: finish only that step, never start new input.
      // A pending menu request is discarded rather than opening a modal while hidden.
      if (document.hidden) this.menuPending = false;
      if (this.menuPending) {
        advanceActor(room.actor,null,delta,room.collision.canEnter); room.sync(delta);
        if (!room.actor.motion) {
          this.menuPending = false;
          room.releaseDeferred();
          const exit = room.exits.arrive(room.actor.tile);
          if (exit) this.startTransition(exit); else this.openInventory();
        }
        return;
      }
      if (this.mode === 'exploration' && elements.toolsOwnInput()) {
        elements.updateTools(delta); // Same sampler, consumed by tools OR gameplay, never both.
        return;
      }
      const direction = input.direction(); // One gameplay consumption of the sampled controller.
      const interact = input.consumeInteract(), cancel = input.consumeCancel(), burst = input.consumeBurst(), menu = input.consumeMenu();
      if (this.mode === 'inventory') {
        this.inventory?.sample({direction,interact,cancel,menu,burst:false},delta);
        return;
      }
      if(this.mode==='save'){this.saveMenu?.sample({direction,interact,cancel,menu,burst:false},delta);return;}
      if(this.mode==='dialogue'){this.dialog.sampleChoices({direction,interact,cancel,menu,burst:false},delta);return;}
      if(this.mode==='battle'){
        room.sync(delta); // Keep cosmetic timelines alive while exploration simulation is paused.
        if(this.battle)this.dialog.sampleChoices({direction,interact,cancel,menu,burst:false},delta);
        else if(cancel)this.cancelModal();
        return;
      }
      if (this.mode === 'exploration' && menu) { this.openInventory(); return; }
      if (this.mode !== 'exploration') {
        if (cancel) this.cancelModal();
        else if (interact && this.mode === 'message') {
          if(this.dialogue){if(this.dialogue.advance())this.showDialogue();else this.resume();}
          else if (this.message?.advance()) this.showMessage();
          else this.resume();
        } else if (interact && this.mode === 'transition-error' && this.lastExit) this.startTransition(this.lastExit);
        return;
      }
      const target = interact ? room.target(room.actor) : null;
      if (target) {
        let state=room.resolve(target.objectId);if(!state?.interaction)return;
        if(state.interaction.encounterId){void this.startBattle(state.interaction.encounterId,target.objectId);return;}
        if(state.interaction.dialogueId){
          const dialogueId=state.interaction.dialogueId;
          const graph=content.map.dialogues?.find(candidate=>candidate.id===dialogueId);
          if(!graph)throw new Error(`Missing dialogue ${state.interaction.dialogueId}`);
          this.dialogue=new DialogueSession(graph,target.objectId,content.map.strings?.en??{},elements.session.current);
          this.showDialogue();return;
        }
        let messageId=state.interaction.messageId;
        const prerequisites=state.interaction.prerequisites;
        if(prerequisites&&!elements.session.evaluate(prerequisites,target.objectId)){
          // Denial reports once per deliberate attempt and never runs the actions.
          if(!state.interaction.rejectionMessageId)throw new Error(`Access-gated interaction without rejection message: ${target.objectId}`);
          messageId=state.interaction.rejectionMessageId;
        }else if(state.interaction.actions.length){
          const result=elements.session.transact({actions:state.interaction.actions,...(prerequisites?{prerequisites}:{})},target.objectId);
          if(result.kind==='rejected'){
            if(!state.interaction.rejectionMessageId)throw new Error(`Interaction transaction rejected: ${result.reason}`);
            messageId=state.interaction.rejectionMessageId;
          }else if(result.kind!=='committed'){state=room.resolve(target.objectId);messageId=state?.interaction?.messageId??messageId;}
        }
        const message=content.map.messages?.find(candidate=>candidate.id===messageId);if(!message)throw new Error(`Missing interaction message: ${messageId}`);
        this.message=new MessageSession(target.objectId,message,content.map.strings?.en??{});
        this.setMode('message');
        this.showMessage();
        return; // The same input frame cannot both start dialogue and emit a burst.
      }
      advanceActor(room.actor, direction, delta, room.collision.canEnter, (tile) => {
        room.releaseDeferred(); // Safe boundary: an actor leaving a cell releases any deferred gate closing.
        const exit = room.exits.arrive(tile);
        if (!exit) return true;
        this.startTransition(exit);
        return false; // Commit a safe tile checkpoint; no extra movement debt across a door.
      });
      room.sync(delta);
      if (this.mode === 'exploration' && burst) room.burst(elements.effects.checked);
    }

    private setMode(mode: InputMode): void {
      this.mode = mode; this.inputOwner?.setMode(mode);
      const locked = mode !== 'exploration';
      elements.burst.disabled = locked; elements.restart.disabled = locked; elements.interact.disabled = locked;
    }
    private async startBattle(id:string,objectId:string):Promise<void>{
      if(this.mode!=='exploration'||!this.sceneLifetime)return;
      const request=new AbortController();this.battleLoad=request;this.battleObjectId=objectId;
      const lifetime=this.sceneLifetime.signal;
      const cancel=():void=>request.abort();
      lifetime.addEventListener('abort',cancel,{once:true});
      this.setMode('battle');this.dialog.show('Preparing battle','Loading the practice encounter…','',null,'Leave');
      try{
        const encounter=await loadEncounter(elements.base,content.game,id,request.signal);
        if(request.signal.aborted||lifetime.aborted||this.battleLoad!==request)return;
        this.battle=new BattleSession(encounter);this.battleLoad=null;this.showBattle();
      }catch(cause){
        if(request.signal.aborted||lifetime.aborted||this.battleLoad!==request)return;
        this.battleLoad=null;this.battleObjectId=null;this.setMode('message');
        this.dialog.show('Battle unavailable',`The encounter could not load: ${cause instanceof Error?cause.message:String(cause)}`,'Your room is unchanged.',null,'Return to game');
      }finally{lifetime.removeEventListener('abort',cancel);}
    }
    private showBattle():void{
      const battle=this.battle;if(!battle)return;
      const state=battle.snapshot(),encounter=battle.encounter;
      const feedback=state.events.map(event=>event.kind==='guard'?'You guard against the next hit.':
        `${event.actor==='hero'?encounter.hero.name:encounter.enemy.name} deals ${event.damage} damage.`).join(' ');
      const title=state.phase==='victory'?'Victory':state.phase==='defeat'?'Defeat':encounter.name;
      const text=`${encounter.hero.name}: ${state.heroHp}/${encounter.hero.hp} HP  •  ${encounter.enemy.name}: ${state.enemyHp}/${encounter.enemy.hp} HP\n${feedback||'Choose a command. Leave to return to exploration.'}`;
      const options=state.phase==='command'?[['attack','Attack'],['guard','Guard'],['leave','Leave']]:
        state.phase==='result'?[['continue','Continue']]:state.phase==='victory'?[['finish','Finish']]:[['retry','Retry'],['leave','Leave']];
      this.dialog.show(title,text,`Round ${state.round} · ${state.phase}`,null,
        state.phase==='result'?'Next round':state.phase==='victory'?'Return to room':'Close battle');
      this.dialog.showChoices(options.map(([id,label])=>({id:id!,label:label!,enabled:true})),id=>this.chooseBattle(id),true);
    }
    private chooseBattle(id:string):void{
      const battle=this.battle;if(!battle)return;
      const before=battle.snapshot();
      if(before.phase==='command'&&(id==='attack'||id==='guard')){
        const after=battle.command(id);
        const object=this.room?.content.map.objects.find(candidate=>candidate.id===this.battleObjectId);
        after.events.forEach((event,index)=>{
          if(event.kind!=='attack')return;
          const anchor=event.actor==='enemy'||!object?{kind:'actor' as const,id:'hero'}:
            {kind:'world' as const,x:object.x*TILE+TILE/2,y:object.y*TILE+TILE/2};
          this.room?.effects.request({effectId:'demo:fx.impact',anchor,seed:after.round*2+index});
        });
      }else if(before.phase==='result'&&id==='continue')battle.continue();
      else if(before.phase==='defeat'&&id==='retry')battle.retry();
      else if((before.phase==='command'||before.phase==='defeat')&&id==='leave'||before.phase==='victory'&&id==='finish'){this.resume();return;}
      else return;
      this.showBattle();
    }
    private openSaves():void{if(this.mode!=='inventory')return;this.inventory?.close();this.setMode('save');void this.saveMenu?.open().catch(cause=>this.fail(cause));}
    private returnToInventory():void{if(this.mode!=='save')return;this.setMode('inventory');this.inventory?.open();}
    private checkpoint(){const room=this.room!;return{mapId:room.content.map.id,tile:{...room.actor.tile},facing:room.actor.facing};}
    /** Refuses a write whose checkpoint the saved session could not restore (standing on a deferral-closing gate); the player stays put with a visible reason. */
    private checkpointReason(checkpoint:SaveCheckpoint):string|null{return this.room&&this.room.checkpointBlocked(checkpoint.tile)?'Cannot save here: the gate beneath you is still closing. Step off it, then save or export again.':null;}
    private async loadSave(envelope:SaveEnvelopeV1):Promise<void>{
      if(!this.sceneLifetime||this.transfer.pending)return;const old=this.room!;this.saveMenu?.close();this.setMode('transition');
      this.dialog.show('Loading save','Preparing and validating the saved room. You can cancel and keep the current session.','',null,'Cancel load');
      const candidate=new SessionState({items:elements.session.current.catalog,facts:elements.session.current.factCatalog,quests:elements.session.current.questCatalog},envelope.session);
      const result=await this.transfer.run(signal=>loadMapCheckpoint(elements.base,content.game,envelope.checkpoint.mapId,envelope.checkpoint.tile,envelope.checkpoint.facing,candidate,signal),next=>{
        const prepared=new MapView(this,next,candidate,characterArt??undefined);prepared.setEffectsEnabled(elements.effects.checked);try{prepared.show();}catch(cause){prepared.destroy();old.show();throw cause;}
        elements.session.activate(candidate);prepared.bind(elements.session);this.room=prepared;content=next;old.destroy();transitions+=1;
      });
      if(result.kind==='failed'){this.setMode('message');this.dialog.show('Save could not load',result.error.message.slice(0,2000),'Your current room and session are unchanged.','Close message','Close');return;}
      if(result.kind==='cancelled')return;this.resume();
    }
    private showMessage(): void {
      const message = this.message!;
      this.dialog.show(message.speaker, message.text, `${message.page} / ${message.total}`,
        message.page === message.total ? 'Close message' : 'Next page', 'Close');
    }
    private showDialogue():void{
      const dialogue=this.dialogue!;
      this.setMode(dialogue.atChoices?'dialogue':'message');
      this.dialog.show(dialogue.speaker,dialogue.text,`${dialogue.page} / ${dialogue.total}`,dialogue.atChoices?null:dialogue.page===dialogue.total?'Close message':'Next page','Close');
      if(dialogue.atChoices)this.dialog.showChoices(dialogue.choices(),id=>this.chooseDialogue(id));
    }
    private chooseDialogue(id:string):void{
      const dialogue=this.dialogue;if(!dialogue)return;
      let choice:ReturnType<DialogueSession['select']>;
      try{choice=dialogue.select(id);}catch{return;}
      if(choice.actions.length){
        const result=elements.session.transact({actions:choice.actions,...(choice.prerequisites?{prerequisites:choice.prerequisites}:{})},dialogue.owner);
        if(result.kind==='rejected'){
          this.dialogue=null;this.message=null;this.setMode('message');
          this.dialog.show('Choice unavailable',`The required item or quest state changed (${result.reason}). Speak again to retry.`,'',null,'Close');return;
        }
      }
      if(choice.nextNodeId){dialogue.move(choice.nextNodeId);this.showDialogue();}else this.resume();
    }
    private resume(): void {
      this.battleLoad?.abort();this.battleLoad=null;this.battle=null;this.battleObjectId=null;
      this.dialog.close(); this.inventory?.close();this.saveMenu?.close(); this.message = null;this.dialogue=null;
      this.setMode('exploration'); this.inputOwner?.clear(); this.inputOwner?.focus();
    }
    private cancelModal(): void {
      if(this.mode==='battle'){
        const phase=this.battle?.snapshot().phase;
        if(phase==='result')this.chooseBattle('continue');
        else if(phase==='victory')this.chooseBattle('finish');
        else if(phase==='command'||phase==='defeat')this.chooseBattle('leave');
        else this.resume();
        return;
      }
      if (this.mode === 'transition') {
        this.generation += 1; this.transfer.cancel(); cancelledTransitions += 1;
      }
      this.resume();
    }

    private startTransition(exit: MapExit): void {
      void this.enter(exit).catch((cause) => this.fail(cause));
    }

    private canUseExit(exit: MapExit): boolean {
      return !exit.prerequisites || elements.session.evaluate(exit.prerequisites);
    }

    private denyExit(exit: MapExit): void {
      const message = content.map.messages?.find(candidate => candidate.id === exit.rejectionMessageId);
      if (!message) throw new Error(`Missing exit rejection message: ${exit.id}`);
      this.message = new MessageSession(exit.id, message, content.map.strings?.en ?? {});
      this.setMode('message');
      this.showMessage();
    }

    private async enter(exit: MapExit): Promise<void> {
      if (!this.sceneLifetime || this.sceneLifetime.signal.aborted || this.transfer.pending ||
          (this.mode !== 'exploration' && this.mode !== 'transition-error')) return;
      if (!this.canUseExit(exit)) { this.denyExit(exit); return; }
      const generation = ++this.generation;
      const lifetime = this.sceneLifetime;
      this.lastExit = exit; this.transitionError = null;
      this.setMode('transition');
      this.dialog.show('Opening doorway', 'Preparing the next room. You can cancel and stay here.', '', null, 'Cancel travel');
      const result = await this.transfer.run(
        (signal) => loadMapDestination(new URL(import.meta.env.BASE_URL, document.baseURI), content.game,
          exit.targetMap, exit.targetSpawn, signal),
        (next) => {
          // Construct/validate the new view while the old view is still usable.
          const old = this.room!;
          const prepared = new MapView(this, next, elements.session.current, characterArt??undefined);
          prepared.setEffectsEnabled(elements.effects.checked);
          prepared.bind(elements.session);
          try { prepared.show(); } catch (cause) { prepared.destroy(); old.show(); throw cause; }
          this.room = prepared; content = next;
          try { old.destroy(); } catch (cause) { this.fail(cause); } // Cleanup failure is fatal, not a false rollback.
          transitions += 1;
        },
        () => this.canUseExit(exit),
      );
      if (lifetime.signal.aborted || generation !== this.generation || phase !== 'ready') return;
      if (result.kind === 'failed') {
        failedTransitions += 1;
        this.transitionError = result.error.message.slice(0, 2000);
        this.setMode('transition-error');
        this.dialog.show('The doorway could not open', this.transitionError, 'Your current room is unchanged.', 'Retry', 'Stay here');
      } else if (result.kind === 'denied') this.denyExit(exit);
      else this.resume();
    }

    private fail(cause: unknown): void {
      if (phase === 'error') return;
      phase = 'error';
      this.generation += 1; this.transfer.cancel();this.battleLoad?.abort();this.battleLoad=null;this.battle=null; this.dialog.close(); this.inventory?.close(); this.inputOwner?.clear();
      elements.burst.disabled = true; elements.restart.disabled = true; elements.interact.disabled = true;
      console.error('[RPGameworks] Map scene failed', cause);
      onError(`Map scene failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }

    private release(): void {
      if (!this.sceneLifetime) return;
      this.sceneLifetime.abort(); this.sceneLifetime = null;
      this.battleLoad?.abort();this.battleLoad=null;this.battle=null;this.battleObjectId=null;
      this.generation += 1; this.transfer.dispose();
      this.dialog.dispose(); this.message = null;this.dialogue=null;
      this.inventory?.dispose(); this.inventory = null;this.saveMenu?.dispose();this.saveMenu=null;
      this.inputOwner?.dispose(); this.inputOwner = null;
      this.room?.destroy(); this.room = null;
      stops += 1;
      if (current === this) current = null;
      this.events.off(Phaser.Scenes.Events.DESTROY, this.release, this);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    }
  }

  function resize(): void {
    if (disposed || !game.isBooted || !game.canvas) return;
    const width = elements.stage.clientWidth, height = elements.stage.clientHeight;
    if (width <= 0 || height <= 0) return;
    const scale = viewportScale(width, height, WIDTH, HEIGHT);
    if (scale !== appliedScale) {
      appliedScale = scale;
      // Phaser owns canvas dimensions; centering never changes the logical world.
      game.scale.setZoom(scale);
    }
    // Whole CSS-pixel offsets avoid half-pixel centering on odd-sized viewports.
    game.canvas.style.left = `${Math.floor((width - WIDTH * scale) / 2)}px`;
    game.canvas.style.top = `${Math.floor((height - HEIGHT * scale) / 2)}px`;
    game.scale.updateBounds();
  }

  function scheduleResize(): void {
    if (disposed || resizeFrame !== null) return;
    // Never mutate the observed element during ResizeObserver delivery.
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      resize();
    });
  }

  const renderer = new URLSearchParams(window.location.search).get('renderer');
  const game = new Phaser.Game({
    type: renderer === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
    parent: elements.stage,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#111721',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    transparent: false,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    scene: [MapScene],
  });

  const observer = new ResizeObserver(scheduleResize);
  observer.observe(elements.stage);
  window.addEventListener('resize', scheduleResize, { signal: appLifetime.signal });

  return {
    clearInput(): void { current?.inputOwner?.clear(); },
    openInventory(): void { current?.openInventory(); },
    snapshot(): RuntimeSnapshot {
      const { map, spawn, collision } = content;
      const room = current?.room;
      const actor = room?.actor ?? spawnActor();
      const position = actorPosition(actor, TILE);
      return {
        phase, scene: SCENE, starts, stops, session: elements.session.current.snapshot(),
        view: { width: WIDTH, height: HEIGHT, tileSize: TILE },
        inputMode: current?.mode ?? 'exploration',
        battle: current?.battle ? (()=>{const state=current.battle.snapshot();return{encounterId:state.encounterId,phase:state.phase,round:state.round,heroHp:state.heroHp,enemyHp:state.enemyHp};})() : null,
        messageId: current?.message?.id ?? current?.dialogue?.graph.id ?? null, messagePage: current?.message?.page ?? current?.dialogue?.page ?? 0,
        interactionTarget: room?.target(actor)?.objectId ?? null,
        transitions, cancelledTransitions, failedTransitions,
        transitionError: current?.transitionError ?? null,
        mapId: map.id, mapName: map.name, mapWidth: map.width, mapHeight: map.height,
        spawnId: spawn.id, loadedMaps: disposed ? 0 : 1, collisionCells: collision.cellCount,
        blockedCells: collision.blockedCells, placedObjects: map.objects.length, exits: map.exits.length,
        camera: { x: current?.cameras.main.scrollX ?? 0, y: current?.cameras.main.scrollY ?? 0 },
        actorTile: { ...actor.tile },
        actorPixel: { x: Math.round(position.x), y: Math.round(position.y) },
        moving: actor.motion !== null, facing: actor.facing,
        heroArt: room?.heroArt ?? 'static', heroFrame: room?.heroFrame ?? null,
        heroMirrored: room?.heroMirrored ?? false, heroFeet: room?.heroFeet ?? null,
        characterArtStatus,
        activeScenes: game.scene.getScenes(true).length,
        displayObjects: current?.children.length ?? 0,
        textureCount: game.textures.getTextureKeys().length,
        aliveParticles: room?.effects.diagnostics.aliveParticles ?? 0,
        pooledParticles: room?.effects.diagnostics.pooledParticles ?? 0,
        activeEffects: room?.effects.diagnostics.active ?? 0,
        droppedEffects: room?.effects.diagnostics.dropped ?? 0,
        fallbackEffects: room?.effects.diagnostics.fallbacks ?? 0,
        burstRequests: room?.bursts ?? 0,
        sessionSubscribers:elements.session.subscriberCount,
        activeObjectBindings:room?.dependencies.size??0,
        pendingSaveOperations:elements.saves.pending,
        effectsEnabled: elements.effects.checked,
        renderer: game.renderer?.type === Phaser.WEBGL ? 'WebGL' : game.renderer?.type === Phaser.CANVAS ? 'Canvas' : 'Starting',
        phaser: Phaser.VERSION,
        fps: Math.round(game.loop.actualFps),
      };
    },
    destroy(): void {
      if (disposed) return;
      disposed = true;
      phase = 'stopped';
      observer.disconnect();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
      appLifetime.abort();
      elements.burst.disabled = true;
      elements.restart.disabled = true;
      elements.interact.disabled = true;
      game.destroy(true);
      characterArt?.dispose();
    },
  };
}
