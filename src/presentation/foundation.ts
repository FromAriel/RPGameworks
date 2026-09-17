import Phaser from 'phaser';
import { actorPosition, advanceActor, createActor } from '../domain/movement';
import { integerScale } from '../domain/viewport';
import { InputController } from '../platform/input';
import type { FoundationHandle, RuntimeSnapshot } from '../runtime-types';

const WIDTH = 320;
const HEIGHT = 192;
const TILE = 16;
const ATLAS = 'foundation';
const SCENE = 'demo:foundation';
const PARTICLE_CAP = 64;
const BURST_SIZE = 24;

export interface FoundationElements {
  stage: HTMLElement;
  controls: HTMLElement;
  burst: HTMLButtonElement;
  restart: HTMLButtonElement;
  effects: HTMLInputElement;
}

export function createFoundation(elements: FoundationElements, onError: (message: string) => void): FoundationHandle {
  let starts = 0;
  let stops = 0;
  let phase: RuntimeSnapshot['phase'] = 'booting';
  let current: FoundationScene | null = null;
  let disposed = false;
  let resizeFrame: number | null = null;
  let appliedScale = 0;
  const appLifetime = new AbortController();

  class FoundationScene extends Phaser.Scene {
    actor = createActor(10, 6);
    inputOwner: InputController | null = null;
    emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    hero: Phaser.GameObjects.Sprite | null = null;
    bursts = 0;
    private sceneLifetime: AbortController | null = null;
    private readonly walkable = (x: number, y: number): boolean => x >= 1 && x <= 18 && y >= 1 && y <= 10;

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
      this.actor = createActor(10, 6);
      this.bursts = 0;
      starts += 1;
      current = this;
      this.sceneLifetime = new AbortController();
      this.cameras.main.setRoundPixels(true);
      // One atlas, one scene, a finite room. Canonical JSON maps arrive in M1.3.
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 20; x += 1) {
          const frame = this.walkable(x, y) ? ((x + y) % 2 ? 'floor-a' : 'floor-b') : 'wall';
          this.add.image(x * TILE, y * TILE, ATLAS, frame).setOrigin(0);
        }
      }
      this.add.image(10 * TILE, 5 * TILE, ATLAS, 'sigil').setOrigin(0).setAlpha(0.7);
      this.hero = this.add.sprite(168, 104, ATLAS, 'hero-down');
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
      this.inputOwner = new InputController(elements.stage, elements.controls, elements.burst);
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
    // DOM input has one explicit owner; unused Phaser input plugins stay off.
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    scene: [FoundationScene],
  });

  const observer = new ResizeObserver(scheduleResize);
  observer.observe(elements.stage);
  window.addEventListener('resize', scheduleResize, { signal: appLifetime.signal });

  return {
    snapshot(): RuntimeSnapshot {
      const actor = current?.actor ?? createActor(10, 6);
      const position = actorPosition(actor, TILE);
      return {
        phase, scene: SCENE, starts, stops,
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
