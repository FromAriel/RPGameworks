import Phaser from 'phaser';
import type { SessionController } from '../runtime/session-controller';
import { InventoryMenu } from './ui/inventory';
import { SaveMenu } from './ui/save-menu';
import type { SaveEnvelopeV1 } from '../domain/save';
import { SessionState } from '../domain/session';
import type { SaveService } from '../runtime/save-service';
import { actorPosition, advanceActor, createActor } from '../domain/movement';
import { viewportScale } from '../domain/viewport';
import { InputController } from '../platform/input';
import { MessageSession } from '../domain/interaction';
import type { MapExit } from '../domain/interaction';
import { TransitionTask } from '../runtime/transition';
import { loadMapCheckpoint,loadMapDestination } from '../platform/map-loader';
import type { InputMode } from '../platform/input';
import { MapView, ATLAS, TILE } from './map-view';
import { InteractionDialog } from './ui/interaction-dialog';
import type { ConfirmationDialogParts, PromptEntry } from './ui/components';
import type { GamepadSource } from '../platform/gamepad';
import type { LoadedMap } from '../platform/map-loader';
import type { FoundationHandle, RuntimeSnapshot } from '../runtime-types';

const WIDTH = 320;
const HEIGHT = 192;
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
}

export function createFoundation(elements: FoundationElements, onError: (message: string) => void, content: LoadedMap): FoundationHandle {
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

  class MapScene extends Phaser.Scene {
    room: MapView | null = null;
    inputOwner: InputController | null = null;
    mode: InputMode = 'exploration';
    message: MessageSession | null = null;
    transitionError: string | null = null;
    private sceneLifetime: AbortController | null = null;
    private transfer = new TransitionTask<LoadedMap>();
    private generation = 0;
    private lastExit: MapExit | null = null;
    private readonly dialog = new InteractionDialog(elements.dialog);
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
        this.mode = 'exploration'; this.message = null; this.transitionError = null; this.menuPending = false;
        this.cameras.main.setRoundPixels(true);
        this.room = new MapView(this, content, elements.session.current);
        this.room.bind(elements.session);
        this.room.show();
        this.inputOwner = new InputController(elements.stage, elements.controls, elements.burst,
          elements.gamepad, elements.canPlay, elements.dialog, elements.inventory,elements.saveDialog);
        starts += 1;
        current = this;
        elements.effects.addEventListener('change', () => {
          if (!elements.effects.checked) this.room?.emitter.killAll();
        }, { signal: this.sceneLifetime.signal });
        elements.restart.addEventListener('click', () => {
          // Restart is deliberately unavailable while a message or transfer owns input.
          if (this.mode !== 'exploration' || !elements.canRestart()) return;
          this.inputOwner?.clear();
          this.scene.restart();
        }, { signal: this.sceneLifetime.signal });
        elements.burst.disabled = false; elements.restart.disabled = false; elements.interact.disabled = false;
        this.inventory = new InventoryMenu(elements.inventory, elements.session,
          () => this.resume(), () => { this.resume(); elements.openSettings(); },()=>this.openSaves(),elements.inventoryPrompt);
        this.saveMenu=new SaveMenu(elements.saveDialog,elements.saves,elements.session,()=>this.checkpoint(),envelope=>this.loadSave(envelope),()=>this.returnToInventory(),elements.saveConfirmation,()=>this.inputOwner?.clear());
        phase = 'ready';
        scheduleResize();
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
        advanceActor(room.actor,null,delta,room.collision.canEnter); room.sync();
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
      if (this.mode === 'exploration' && menu) { this.openInventory(); return; }
      if (this.mode !== 'exploration') {
        if (cancel) this.cancelModal();
        else if (interact && this.mode === 'message') {
          if (this.message?.advance()) this.showMessage();
          else this.resume();
        } else if (interact && this.mode === 'transition-error' && this.lastExit) this.startTransition(this.lastExit);
        return;
      }
      const target = interact ? room.target(room.actor) : null;
      if (target) {
        let state=room.resolve(target.objectId);if(!state?.interaction)return;
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
      room.sync();
      if (this.mode === 'exploration' && burst) room.burst(elements.effects.checked);
    }

    private setMode(mode: InputMode): void {
      this.mode = mode; this.inputOwner?.setMode(mode);
      const locked = mode !== 'exploration';
      elements.burst.disabled = locked; elements.restart.disabled = locked; elements.interact.disabled = locked;
    }
    private openSaves():void{if(this.mode!=='inventory')return;this.inventory?.close();this.setMode('save');void this.saveMenu?.open().catch(cause=>this.fail(cause));}
    private returnToInventory():void{if(this.mode!=='save')return;this.setMode('inventory');this.inventory?.open();}
    private checkpoint(){const room=this.room!;return{mapId:room.content.map.id,tile:{...room.actor.tile},facing:room.actor.facing};}
    private async loadSave(envelope:SaveEnvelopeV1):Promise<void>{
      if(!this.sceneLifetime||this.transfer.pending)return;const old=this.room!;this.saveMenu?.close();this.setMode('transition');
      this.dialog.show('Loading save','Preparing and validating the saved room. You can cancel and keep the current session.','',null,'Cancel load');
      const candidate=new SessionState({items:elements.session.current.catalog,facts:elements.session.current.factCatalog},envelope.session);
      const result=await this.transfer.run(signal=>loadMapCheckpoint(elements.base,content.game,envelope.checkpoint.mapId,envelope.checkpoint.tile,envelope.checkpoint.facing,signal),next=>{
        const prepared=new MapView(this,next,candidate);try{prepared.show();}catch(cause){prepared.destroy();old.show();throw cause;}
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
    private resume(): void {
      this.dialog.close(); this.inventory?.close();this.saveMenu?.close(); this.message = null;
      this.setMode('exploration'); this.inputOwner?.clear(); this.inputOwner?.focus();
    }
    private cancelModal(): void {
      if (this.mode === 'transition') {
        this.generation += 1; this.transfer.cancel(); cancelledTransitions += 1;
      }
      this.resume();
    }

    private startTransition(exit: MapExit): void {
      void this.enter(exit).catch((cause) => this.fail(cause));
    }

    private async enter(exit: MapExit): Promise<void> {
      if (!this.sceneLifetime || this.sceneLifetime.signal.aborted || this.transfer.pending ||
          (this.mode !== 'exploration' && this.mode !== 'transition-error')) return;
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
          const prepared = new MapView(this, next, elements.session.current);
          prepared.bind(elements.session);
          try { prepared.show(); } catch (cause) { prepared.destroy(); old.show(); throw cause; }
          this.room = prepared; content = next;
          try { old.destroy(); } catch (cause) { this.fail(cause); } // Cleanup failure is fatal, not a false rollback.
          transitions += 1;
        },
      );
      if (lifetime.signal.aborted || generation !== this.generation || phase !== 'ready') return;
      if (result.kind === 'failed') {
        failedTransitions += 1;
        this.transitionError = result.error.message.slice(0, 2000);
        this.setMode('transition-error');
        this.dialog.show('The doorway could not open', this.transitionError, 'Your current room is unchanged.', 'Retry', 'Stay here');
      } else this.resume();
    }

    private fail(cause: unknown): void {
      if (phase === 'error') return;
      phase = 'error';
      this.generation += 1; this.transfer.cancel(); this.dialog.close(); this.inventory?.close(); this.inputOwner?.clear();
      elements.burst.disabled = true; elements.restart.disabled = true; elements.interact.disabled = true;
      console.error('[RPGameworks] Map scene failed', cause);
      onError(`Map scene failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }

    private release(): void {
      if (!this.sceneLifetime) return;
      this.sceneLifetime.abort(); this.sceneLifetime = null;
      this.generation += 1; this.transfer.dispose();
      this.dialog.dispose(); this.message = null;
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
        inputMode: current?.mode ?? 'exploration',
        messageId: current?.message?.id ?? null, messagePage: current?.message?.page ?? 0,
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
        activeScenes: game.scene.getScenes(true).length,
        displayObjects: current?.children.length ?? 0,
        textureCount: game.textures.getTextureKeys().length,
        aliveParticles: room?.emitter?.getAliveParticleCount() ?? 0,
        pooledParticles: room?.emitter?.getParticleCount() ?? 0,
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
    },
  };
}
