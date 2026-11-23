import type Phaser from 'phaser';
import { STEP_MS } from '../domain/movement';
import type { Actor } from '../domain/movement';
import type { PartyMemberArt } from '../content/party-atlas.mjs';

/**
 * The walking hero on the map, drawn from the party's baked LPC art (decision 0019 S1.5f; it replaces the Cute Fantasy
 * starter pack). At rest it shows LPC's standing frame for the way it faces; while it steps it plays the walk for that
 * way, one stride per tile (an LPC walk cycle is two strides). Feet stand where the old hero's did: on the bottom edge
 * of the actor's tile. Left and right use LPC's own rows, never a mirror image.
 */
export interface MapHeroArt {
  /** The party atlas texture the map owns. */
  readonly texture: string;
  readonly member: PartyMemberArt;
}

/** How long a step may pause between tiles while a direction is held before the hero is shown standing. */
const STOP_GRACE_MS = 50;

export class MapHeroView {
  readonly sprite: Phaser.GameObjects.Image;
  private walking = false;
  private facing: Actor['facing'] = 'down';
  private index = 0;
  private elapsed = 0;
  private still = 0;
  private readonly footOffset: number;
  private readonly frameMs: number;

  constructor(scene: Phaser.Scene, private readonly art: MapHeroArt, tileSize: number) {
    const { stand, walk } = art.member;
    this.footOffset = tileSize / 2;
    this.frameMs = (2 * STEP_MS) / (walk.down?.length || 8);
    this.sprite = scene.add.image(0, 0, art.texture, stand.down).setOrigin(stand.anchor.x / stand.size, stand.anchor.y / stand.size).setDepth(1);
  }

  /** The atlas frame shown now. */
  get frame(): string { return this.sprite.frame.name; }

  sync(actor: Actor, x: number, y: number, deltaMs: number): void {
    const delta = Number.isFinite(deltaMs) && deltaMs > 0 && !document.hidden ? deltaMs : 0;
    this.still = actor.motion ? 0 : this.still + delta;
    const walking = !!actor.motion || (this.walking && this.still < STOP_GRACE_MS);
    if (walking !== this.walking || actor.facing !== this.facing) { this.walking = walking; this.facing = actor.facing; this.index = 0; this.elapsed = 0; }
    else if (walking) {
      this.elapsed += delta;
      const frames = this.art.member.walk[this.facing]?.length ?? 1;
      while (this.elapsed >= this.frameMs) { this.elapsed -= this.frameMs; this.index = (this.index + 1) % frames; }
    }
    const { stand, walk } = this.art.member;
    const frame = walking ? walk[this.facing]?.[this.index] ?? stand[this.facing] : stand[this.facing];
    const size = walking ? walk.size : stand.size, anchor = walking ? walk.anchor : stand.anchor;
    if (this.sprite.frame.name !== frame) this.sprite.setFrame(frame).setOrigin(anchor.x / size, anchor.y / size);
    this.sprite.setPosition(Math.round(x), Math.round(y + this.footOffset));
  }

  destroy(): void { this.sprite.destroy(); }
}
