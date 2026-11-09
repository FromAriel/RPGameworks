import Phaser from 'phaser';
import { fillColumn } from '../pixel-frame/fill.ts';
import { loadFrameManifest } from '../frame-manifest';
import type { BattleTextColors, ManifestFrame } from '../pixel-frame/manifest.ts';
import type { Rect } from './battle-windows';

/**
 * Battle windows drawn from the baked Pixel Frame frames (decision 0010, W2.2). The frame is a Phaser NineSlice over a
 * fill column stretched sideways, both exact at any window size. The look comes from the game's UI theme file through
 * the bake manifest; this module only loads and places it, and owns the textures it adds.
 */
export const BATTLE_FRAME_KEY = 'ui:frame.battle';
const FILL_PREFIX = 'ui:frame.battle.fill.';

export interface BattleFrames {
  readonly frame: ManifestFrame;
  readonly image: HTMLImageElement;
  readonly text: BattleTextColors;
}

export interface BattleColors {
  readonly text: number;
  readonly muted: number;
  readonly disabled: number;
  readonly danger: number;
  readonly cursor: number;
  readonly outline: number;
}

/** Used only when the baked frames cannot load, so a battle stays playable; the theme file is the real source. */
const FALLBACK = {
  colors: { text: 0xffffff, muted: 0xc2cbe6, disabled: 0x8a93b0, danger: 0xff9c8a, cursor: 0xffffff, outline: 0x05070e },
  fill: 0x1c2f80, border: 0xe8ecf6,
} as const;

let loading: Promise<BattleFrames | null> | null = null;

/** Load the shared bake manifest and the battle frame once per page. Resolves null on failure (and retries next time). */
export function loadBattleFrames(base: string): Promise<BattleFrames | null> {
  loading ??= (async () => {
    try {
      const manifest = await loadFrameManifest(base);
      if (!manifest) throw new Error('frame manifest unavailable');
      const frame = manifest.frames.battle;
      if (!frame) throw new Error('frame manifest: no battle window');
      const image = new Image();
      image.src = `${base}generated/${frame.images.raised}`;
      await image.decode();
      if (image.naturalWidth !== frame.size || image.naturalHeight !== frame.size) throw new Error('frame image size does not match the manifest');
      return { frame, image, text: manifest.battleText };
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

const hex = (value: string) => parseInt(value.slice(1), 16);

/** Places battle windows for one battle view and releases its textures in destroy(). */
export class BattleSkin {
  readonly colors: BattleColors;
  private readonly fills = new Set<string>();
  private released = false;

  constructor(private readonly scene: Phaser.Scene, private readonly frames: BattleFrames | null) {
    const text = frames?.text;
    this.colors = text
      ? { text: hex(text.text), muted: hex(text.muted), disabled: hex(text.disabled), danger: hex(text.danger), cursor: hex(text.cursor), outline: hex(text.outline) }
      : FALLBACK.colors;
    if (frames && !scene.textures.exists(BATTLE_FRAME_KEY)) scene.textures.addImage(BATTLE_FRAME_KEY, frames.image)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 'baked' when the theme's frames are in use, 'fallback' when they failed to load. */
  get source(): 'baked' | 'fallback' { return this.frames ? 'baked' : 'fallback'; }

  /**
   * The display objects for one window. The outline sits on the rect's edge: the frame's box is the rect inset by one
   * pixel, and the fill starts inside the border.
   */
  panel(rect: Rect): Phaser.GameObjects.GameObject[] {
    const { x, y, w, h } = rect;
    if (!this.frames) {
      const g = this.scene.add.graphics();
      g.fillStyle(FALLBACK.colors.outline, 1).fillRect(x, y, w, h);
      g.fillStyle(FALLBACK.border, 1).fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle(FALLBACK.fill, 1).fillRect(x + 3, y + 3, w - 6, h - 6);
      return [g];
    }
    const { border, outset, slice } = this.frames.frame;
    const inner = 1 + border;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const fillKey = this.fillTexture(h - 2 * inner);
    if (fillKey) objects.push(this.scene.add.image(x + inner, y + inner, fillKey).setOrigin(0).setDisplaySize(w - 2 * inner, h - 2 * inner));
    objects.push(this.scene.add.nineslice(x + 1 - outset, y + 1 - outset, BATTLE_FRAME_KEY, undefined,
      w - 2 + 2 * outset, h - 2 + 2 * outset, slice, slice, slice, slice).setOrigin(0));
    return objects;
  }

  /** Texture keys this skin added, for resource checks. */
  get textureKeys(): readonly string[] {
    return this.frames ? [BATTLE_FRAME_KEY, ...this.fills] : [];
  }

  destroy(): void {
    if (this.released) return;
    this.released = true;
    for (const key of this.fills) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.fills.clear();
    if (this.frames && this.scene.textures.exists(BATTLE_FRAME_KEY)) this.scene.textures.remove(BATTLE_FRAME_KEY);
  }

  /** A 1-pixel-wide column of the theme fill for this height, made once per height per battle. */
  private fillTexture(height: number): string | null {
    if (height <= 0) return null;
    const key = `${FILL_PREFIX}${height}`;
    if (this.scene.textures.exists(key)) return key;
    const column = fillColumn(this.frames!.frame.fill, height);
    if (!column) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const pixels = context.createImageData(1, height);
    column.forEach(([r, g, b], row) => pixels.data.set([r, g, b, 255], row * 4));
    context.putImageData(pixels, 0, 0);
    this.scene.textures.addCanvas(key, canvas)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.fills.add(key);
    return key;
  }
}
