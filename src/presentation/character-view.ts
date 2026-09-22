import Phaser from 'phaser';
import type { Actor } from '../domain/movement';
import { readCharacterPack, decodeAllPayloads } from '../platform/character-pack';

const PACK_ID = 'starter-hero';
const CELL = 64;
const LAYERS = ['base', 'feet', 'legs', 'chest', 'hair', 'hands'] as const;
const DIRECTIONS = ['down', 'side', 'up'] as const;
const ACTIONS = ['idle', 'walk'] as const;
const FRAMES = 6;
const FOOT_X = 32 / CELL;
const FOOT_Y = 41 / CELL;
const IDLE_MS = 180;
const WALK_MS = 120;

function frameName(action: string, direction: string, index: number): string {
  return `${action}|${direction}|${index}`;
}

/** One app-owned texture set shared by room views. Loading is cancellable; adoption is atomic. */
export class CharacterArt {
  private readonly keys: string[] = [];
  private available = false;

  constructor(private readonly textures: Phaser.Textures.TextureManager, private readonly base: string) {}

  get ready(): boolean { return this.available; }

  async load(signal: AbortSignal): Promise<void> {
    if (this.available) return;
    signal.throwIfAborted();
    const response = await fetch(`${this.base}character/${PACK_ID}.rpgpack`, { signal });
    if (!response.ok) throw new Error(`character pack request failed (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    signal.throwIfAborted();
    const pack = readCharacterPack(bytes);
    if (pack.manifest.packId !== PACK_ID || pack.manifest.cell.widthPx !== CELL || pack.manifest.cell.heightPx !== CELL) throw new Error('character pack identity or cell size differs from the selected hero');
    if (pack.manifest.animations.length !== ACTIONS.length * DIRECTIONS.length || pack.manifest.layers.length !== LAYERS.length) throw new Error('character pack animation or layer set differs from the selected hero');
    for (const layer of LAYERS) if (!pack.manifest.layers.some(entry => entry.id === layer)) throw new Error(`character pack missing layer ${layer}`);
    const decoded = await decodeAllPayloads(pack, signal);
    signal.throwIfAborted();
    const created: string[] = [];
    try {
      for (const layer of LAYERS) {
        const key = `character:${PACK_ID}:${layer}`;
        if (this.textures.exists(key)) throw new Error(`character texture key already exists: ${key}`);
        const canvas = document.createElement('canvas');
        canvas.width = CELL;
        canvas.height = CELL * ACTIONS.length * DIRECTIONS.length * FRAMES;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('character art requires a 2D canvas context');
        let row = 0;
        for (const action of ACTIONS) for (const direction of DIRECTIONS) for (let index = 0; index < FRAMES; index += 1) {
          const name = frameName(action, direction, index);
          const payloadIndex = pack.cells.get(name)?.get(layer);
          if (payloadIndex === undefined) throw new Error(`character pack missing ${name}/${layer}`);
          const pixels = decoded[payloadIndex];
          if (!pixels || pixels.length !== CELL * CELL * 4) throw new Error(`character pack has invalid pixels for ${name}/${layer}`);
          context.putImageData(new ImageData(new Uint8ClampedArray(pixels), CELL, CELL), 0, row * CELL);
          row += 1;
        }
        const texture = this.textures.addCanvas(key, canvas);
        if (!texture) throw new Error(`could not register character texture ${key}`);
        created.push(key);
        row = 0;
        for (const action of ACTIONS) for (const direction of DIRECTIONS) for (let index = 0; index < FRAMES; index += 1) {
          if (!texture.add(frameName(action, direction, index), 0, 0, row * CELL, CELL, CELL)) throw new Error(`could not register character frame ${row}`);
          row += 1;
        }
        texture.update();
      }
      signal.throwIfAborted();
      this.keys.push(...created);
      this.available = true;
    } catch (error) {
      for (const key of created) this.textures.remove(key);
      throw error;
    }
  }

  createView(scene: Phaser.Scene): CharacterView {
    if (!this.available) throw new Error('character art is not ready');
    return new CharacterView(scene);
  }

  dispose(): void {
    this.available = false;
    for (const key of this.keys) this.textures.remove(key);
    this.keys.length = 0;
  }
}

export class CharacterView {
  readonly container: Phaser.GameObjects.Container;
  private readonly layers: Phaser.GameObjects.Sprite[];
  private state = '';
  private elapsed = 0;
  private index = 0;

  get frame(): string { return `${this.state}|${this.index}`; }
  get mirrored(): boolean { return this.container.scaleX < 0; }

  constructor(scene: Phaser.Scene) {
    const sprites: Phaser.GameObjects.Sprite[] = [];
    try {
      for (const layer of LAYERS) sprites.push(scene.add.sprite(0, 0, `character:${PACK_ID}:${layer}`, frameName('idle', 'down', 0)).setOrigin(FOOT_X, FOOT_Y));
      this.container = scene.add.container(0, 0, sprites).setDepth(1);
      this.layers = sprites;
    } catch (error) {
      for (const sprite of sprites) sprite.destroy();
      throw error;
    }
  }

  sync(actor: Actor, x: number, y: number, deltaMs: number): void {
    const action = actor.motion ? 'walk' : 'idle';
    const direction = actor.facing === 'left' || actor.facing === 'right' ? 'side' : actor.facing;
    const state = `${action}|${direction}`;
    if (state !== this.state) { this.state = state; this.index = 0; this.elapsed = 0; }
    else if (!document.hidden) {
      if (Number.isFinite(deltaMs) && deltaMs > 0) this.elapsed += deltaMs;
      const duration = action === 'walk' ? WALK_MS : IDLE_MS;
      while (this.elapsed >= duration) { this.elapsed -= duration; this.index = (this.index + 1) % FRAMES; }
    }
    const frame = frameName(action, direction, this.index);
    for (const layer of this.layers) if (layer.frame.name !== frame) layer.setFrame(frame);
    this.container.setScale(actor.facing === 'left' ? -1 : 1, 1);
    this.container.setPosition(Math.round(x), Math.round(y + 8));
  }

  destroy(): void { this.container.destroy(); }
}
