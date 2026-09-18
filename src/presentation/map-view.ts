import Phaser from 'phaser';
import { actorPosition, createActor } from '../domain/movement';
import { createInteractionLookup, ExitLatch } from '../domain/interaction';
import type { LoadedMap } from '../platform/map-loader';

export const TILE = 16;
export const ATLAS = 'foundation';
export const PARTICLE_CAP = 64;
const BURST_SIZE = 24;
type Visual = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Particles.ParticleEmitter;

/** A room's complete presentation owner. Construction is invisible and rollback-safe.
 * Shared atlas lifetime belongs to the app; all per-room objects belong here.
 */
export class MapView {
  readonly actor;
  readonly target;
  readonly exits;
  readonly hero: Phaser.GameObjects.Sprite;
  readonly emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  bursts = 0;
  private readonly objects: Visual[] = [];
  private disposed = false;

  constructor(private readonly scene: Phaser.Scene, readonly content: LoadedMap) {
    const { map, spawn } = content;
    this.actor = { ...createActor(spawn.x, spawn.y), facing: spawn.facing };
    this.target = createInteractionLookup(map);
    this.exits = new ExitLatch(map.exits, spawn);
    const frames = new Set([...Object.values(map.legend), ...map.objects.map((object) => object.frame),
      'hero-up', 'hero-down', 'hero-left', 'hero-right', 'spark']);
    for (const frame of frames) {
      if (!scene.textures.get(ATLAS).has(frame)) throw new Error(`${map.id}: atlas frame does not exist: ${frame}`);
    }
    try {
      map.layers.forEach((layer, layerIndex) => layer.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          const symbol = row[x]!;
          if (symbol !== '.') this.own(scene.add.image(x * TILE, y * TILE, ATLAS, map.legend[symbol]!).setOrigin(0).setDepth(layerIndex / 10));
        }
      }));
      for (const object of map.objects) {
        this.own(scene.add.image(object.x * TILE, object.y * TILE, ATLAS, object.frame).setOrigin(0).setDepth(0.5));
      }
      const position = actorPosition(this.actor, TILE);
      this.hero = this.own(scene.add.sprite(position.x, position.y, ATLAS, `hero-${spawn.facing}`).setDepth(1));
      this.emitter = this.own(scene.add.particles(0, 0, ATLAS, {
        frame: 'spark', emitting: false, lifespan: { min: 220, max: 480 },
        speed: { min: 22, max: 70 }, angle: { min: 0, max: 360 }, gravityY: 28,
        alpha: { start: 1, end: 0 }, quantity: BURST_SIZE,
        maxParticles: PARTICLE_CAP, maxAliveParticles: PARTICLE_CAP, blendMode: Phaser.BlendModes.NORMAL,
      }).setDepth(2));
    } catch (cause) { this.destroy(); throw cause; }
  }

  private own<T extends Visual>(object: T): T { this.objects.push(object); object.setVisible(false); return object; }
  show(): void {
    this.scene.cameras.main.setBounds(0, 0, this.content.map.width * TILE, this.content.map.height * TILE);
    this.scene.cameras.main.startFollow(this.hero, true, 1, 1);
    for (const object of this.objects) object.setVisible(true);
  }
  sync(): void {
    const position = actorPosition(this.actor, TILE);
    this.hero.setPosition(Math.round(position.x), Math.round(position.y));
    const frame = `hero-${this.actor.facing}`;
    if (this.hero.frame.name !== frame) this.hero.setFrame(frame);
  }
  burst(enabled: boolean): void {
    this.bursts += 1;
    if (!enabled) return;
    const available = Math.max(0, PARTICLE_CAP - this.emitter.getAliveParticleCount());
    if (available > 0) this.emitter.explode(Math.min(BURST_SIZE, available), this.hero.x, this.hero.y);
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = this.objects.length - 1; i >= 0; i -= 1) this.objects[i]!.destroy();
    this.objects.length = 0;
  }
}
