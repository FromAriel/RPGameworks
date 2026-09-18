import Phaser from 'phaser';
import { actorPosition, advanceActor, createActor } from '../domain/movement';
import { integerScale } from '../domain/viewport';
import { InputController } from '../platform/input';
import type { GamepadSource } from '../platform/gamepad';
import type { LoadedMap } from '../platform/map-loader';
import type { FoundationHandle, RuntimeSnapshot } from '../runtime-types';

const WIDTH = 320;
const HEIGHT = 192;
const TILE = 16;
const ATLAS = 'foundation';
const SCENE = 'rpgameworks:map';
const PARTICLE_CAP = 64;
const BURST_SIZE = 24;

export interface FoundationElements {
  stage: HTMLElement;
  controls: HTMLElement;
  burst: HTMLButtonElement;
  restart: HTMLButtonElement;
  effects: HTMLInputElement;
  gamepad: GamepadSource;
  canPlay: () => boolean;
}

export function createFoundation(elements: FoundationElements, onError: (message: string) => void, content: LoadedMap): FoundationHandle {
  const { map, spawn, collision } = content;
  const spawnActor = () => ({ ...createActor(spawn.x, spawn.y), facing: spawn.facing });
  let starts = 0;
  let stops = 0;
  let phase: RuntimeSnapshot['phase'] = 'booting';
  let current: MapScene | null = null;
  let disposed = false;
  let resizeFrame: number | null = null;
  let appliedScale = 0;
  const appLifetime = new AbortController();

  class MapScene extends Phaser.Scene {
    actor = spawnActor();
    inputOwner: InputController | null = null;
    emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    hero: Phaser.GameObjects.Sprite | null = null;
    bursts = 0;
    private sceneLifetime: AbortController | null = null;
    private readonly walkable = collision.canEnter;

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
      if (phase === 'error') return;
      // A single scene presents any validated map; no map-specific geometry lives here.
      const requiredFrames = new Set([...Object.values(map.legend), ...map.objects.map((object) => object.frame),
        'hero-up', 'hero-down', 'hero-left', 'hero-right', 'spark']);
      for (const frame of requiredFrames) {
        if (!this.textures.get(ATLAS).has(frame)) {
          phase = 'error'; onError(`${map.id}: atlas frame does not exist: ${frame}`); return;
        }
      }
      this.actor = spawnActor();
      this.bursts = 0;
      starts += 1;
      current = this;
      this.sceneLifetime = new AbortController();
      this.cameras.main.setRoundPixels(true);
      map.layers.forEach((layer, layerIndex) => {
        layer.rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x += 1) {
            const symbol = row[x]!;
            if (symbol !== '.') this.add.image(x * TILE, y * TILE, ATLAS, map.legend[symbol]!).setOrigin(0).setDepth(layerIndex / 10);
          }
        });
      });
      for (const object of map.objects) {
        this.add.image(object.x * TILE, object.y * TILE, ATLAS, object.frame).setOrigin(0).setDepth(0.5);
      }
      const initial = actorPosition(this.actor, TILE);
      this.hero = this.add.sprite(initial.x, initial.y, ATLAS, `hero-${spawn.facing}`).setDepth(1);
      this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
      this.cameras.main.startFollow(this.hero, true, 1, 1);
      this.emitter = this.add.particles(0, 0, ATLAS, {
        frame: 'spark',
        emitting: false,
        lifespan: { min: 220, max: 480 },
        speed: { min: 22, max: 70 },
        angle: { min: 0, max: 360 },
        gravityY: 28,
        alpha: { start: 1, end: 0 },
        quantity: BURST_SIZE,
        maxParticles: PARTICLE_CAP,
        maxAliveParticles: PARTICLE_CAP,
        blendMode: Phaser.BlendModes.NORMAL,
      });
      this.emitter.setDepth(2);
      this.inputOwner = new InputController(elements.stage, elements.controls, elements.burst, elements.gamepad, elements.canPlay);
      elements.effects.addEventListener('change', () => {
        if (!elements.effects.checked) this.emitter?.killAll();
      }, { signal: this.sceneLifetime.signal });
      elements.restart.addEventListener('click', () => {
        this.inputOwner?.clear();
        this.scene.restart();
      }, { signal: this.sceneLifetime.signal });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, this.release, this);
      elements.burst.disabled = false;
      elements.restart.disabled = false;
      phase = 'ready';
      scheduleResize();
    }

    update(_time: number, delta: number): void {
      if (!this.inputOwner || !this.hero || !this.emitter || phase !== 'ready') return;
      advanceActor(this.actor, this.inputOwner.direction(), delta, this.walkable);
      const position = actorPosition(this.actor, TILE);
      this.hero.setPosition(Math.round(position.x), Math.round(position.y));
      const frame = `hero-${this.actor.facing}`;
      if (this.hero.frame.name !== frame) this.hero.setFrame(frame);
      if (this.inputOwner.consumeBurst()) {
        this.bursts += 1;
        if (elements.effects.checked) {
          // Saturation drops decoration, not movement or other game state.
          const available = Math.max(0, PARTICLE_CAP - this.emitter.getAliveParticleCount());
          if (available > 0) this.emitter.explode(Math.min(BURST_SIZE, available), this.hero.x, this.hero.y);
        }
      }
    }

    private release(): void {
      if (!this.sceneLifetime) return;
      this.sceneLifetime.abort();
      this.sceneLifetime = null;
      this.inputOwner?.dispose();
      this.inputOwner = null;
      this.emitter?.killAll();
      this.emitter = null;
      this.hero = null;
      stops += 1;
      if (current === this) current = null;
      // Phaser owns and disposes this scene's display list, including the emitter.
      this.events.off(Phaser.Scenes.Events.DESTROY, this.release, this);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, this.release, this);
    }
  }

  function resize(): void {
    if (disposed || !game.isBooted || !game.canvas) return;
    const scale = integerScale(elements.stage.clientWidth - 2, Math.max(HEIGHT, window.innerHeight * 0.58), WIDTH, HEIGHT);
    if (scale === appliedScale) return;
    appliedScale = scale;
    // Let Phaser own CSS dimensions and its coordinate transforms together.
    game.scale.setZoom(scale);
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
    snapshot(): RuntimeSnapshot {
      const actor = current?.actor ?? spawnActor();
      const position = actorPosition(actor, TILE);
      return {
        phase, scene: SCENE, starts, stops,
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
        aliveParticles: current?.emitter?.getAliveParticleCount() ?? 0,
        pooledParticles: current?.emitter?.getParticleCount() ?? 0,
        burstRequests: current?.bursts ?? 0,
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
      game.destroy(true);
    },
  };
}
