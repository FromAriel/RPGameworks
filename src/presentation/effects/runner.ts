import Phaser from 'phaser';
import impact from './impact.json';
import { cosmeticChoice, validateRecipe, validateRequest } from './contract';
import type { EffectAnchor, EffectDiagnostics, EffectHandle, EffectRecipe, EffectRequest, EffectResult, EffectTrack } from './contract';

const MAX_ACTIVE_EFFECTS = 4;
const MAX_PARTICLES = 64;
const FALLBACK: EffectRecipe = validateRecipe({
  schemaVersion: 1, id: 'demo:fx.fallback', durationMs: 180,
  parameters: { intensity: { min: 0.5, max: 2, default: 1 } },
  tracks: [{ kind: 'sprite', startMs: 0, durationMs: 180, frame: 'spark', offset: { x: 0, y: 0 }, alpha: [1, 0], scale: [3, 6], tint: [0xffffff, 0xffffff] }],
});
const RECIPES = new Map<string, EffectRecipe>();
try {
  const recipe = validateRecipe(impact);
  RECIPES.set(recipe.id, recipe);
} catch (cause) {
  // Content checks catch this during development; gameplay still boots with the fallback.
  console.error('[RPGameworks] Invalid PixelFX recipe', cause);
}
type Visual = Phaser.GameObjects.Image | Phaser.GameObjects.Particles.ParticleEmitter;
type Active = {
  recipe: EffectRecipe; anchor: EffectAnchor; intensity: number; seed: number; elapsed: number;
  started: Set<number>; images: Map<number, Phaser.GameObjects.Image>; owned: Visual[];
  finish: (result: EffectResult) => void; done: boolean;
};

export class EffectRunner {
  private readonly active = new Set<Active>();
  private dropped = 0;
  private fallbacks = 0;
  private disposed = false;
  private quality: 'standard' | 'reduced' = 'standard';

  constructor(private readonly scene: Phaser.Scene, private readonly atlas: string, private readonly actorPosition: (id: string) => { x: number; y: number } | null) {}

  setQuality(quality: 'standard' | 'reduced'): void {
    this.quality = quality;
    if (quality === 'reduced') for (const effect of this.active) for (let index = effect.owned.length - 1; index >= 0; index--) {
      const visual = effect.owned[index]!;
      if (visual instanceof Phaser.GameObjects.Particles.ParticleEmitter) { visual.destroy(); effect.owned.splice(index, 1); }
    }
  }

  request(request: EffectRequest): EffectHandle {
    let recipe = RECIPES.get(request.effectId);
    let reason: string | null = null;
    let intensity = 1;
    if (!recipe) { recipe = FALLBACK; reason = `Unknown effect: ${request.effectId}`; }
    try { intensity = validateRequest(request, recipe); }
    catch (cause) { recipe = FALLBACK; reason = cause instanceof Error ? cause.message : String(cause); }
    for (const track of recipe.tracks) if (!this.scene.textures.get(this.atlas).has(track.frame)) { recipe = FALLBACK; reason = `Missing effect frame: ${track.frame}`; break; }
    if (reason) this.fallbacks += 1;
    if (this.disposed || this.active.size >= MAX_ACTIVE_EFFECTS) {
      this.dropped += 1;
      return { fallback: Boolean(reason), reason: reason ?? 'Effect capacity reached', completed: Promise.resolve('cancelled'), cancel() {} };
    }
    const candidate = request.anchor;
    const validAnchor = candidate && (candidate.kind === 'world'
      ? Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
      : candidate.kind === 'actor' && /^[a-z][a-z0-9:.-]{0,63}$/.test(candidate.id));
    const anchor: EffectAnchor = validAnchor ? candidate : { kind: 'world', ...(this.actorPosition('hero') ?? { x: 0, y: 0 }) };
    let resolve!: (result: EffectResult) => void;
    const completed = new Promise<EffectResult>(finish => { resolve = finish; });
    const effect: Active = { recipe, anchor, intensity, seed: Number.isSafeInteger(request.seed) ? request.seed : 0, elapsed: 0, started: new Set(), images: new Map(), owned: [], finish: resolve, done: false };
    this.active.add(effect);
    try { this.advance(effect, 0); } catch { this.dropped += 1; this.end(effect, 'cancelled'); }
    return { fallback: Boolean(reason), reason, completed, cancel: () => this.end(effect, 'cancelled') };
  }

  update(deltaMs: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(deltaMs) ? Math.max(0, Math.min(deltaMs, 50)) : 0;
    for (const effect of [...this.active]) {
      try { this.advance(effect, step); } catch { this.dropped += 1; this.end(effect, 'cancelled'); }
    }
  }

  private position(anchor: EffectAnchor): { x: number; y: number } | null {
    return anchor.kind === 'world' ? anchor : this.actorPosition(anchor.id);
  }

  private advance(effect: Active, step: number): void {
    if (effect.done) return;
    const position = this.position(effect.anchor);
    if (!position) { this.end(effect, 'cancelled'); return; }
    effect.elapsed += step;
    for (const [index, track] of effect.recipe.tracks.entries()) {
      if (effect.elapsed < track.startMs) continue;
      if (!effect.started.has(index)) {
        effect.started.add(index);
        if (track.kind === 'sprite') {
          const image = this.scene.add.image(position.x, position.y, this.atlas, track.frame).setDepth(2).setOrigin(0.5);
          effect.owned.push(image); effect.images.set(index, image);
        } else if (this.quality === 'standard') this.emit(effect, track, position);
      }
      if (track.kind === 'sprite') {
        const image = effect.images.get(index)!;
        const progress = Math.min(1, (effect.elapsed - track.startMs) / track.durationMs);
        image.setPosition(Math.round(position.x + track.offset.x), Math.round(position.y + track.offset.y));
        image.setAlpha(Phaser.Math.Linear(track.alpha[0], track.alpha[1], progress));
        image.setScale(Phaser.Math.Linear(track.scale[0], track.scale[1], progress) * effect.intensity);
        image.setTint(track.tint[cosmeticChoice((effect.seed + index) >>> 0, track.tint.length)]!);
        image.setVisible(progress < 1);
      }
    }
    if (effect.elapsed >= effect.recipe.durationMs) this.end(effect, 'completed');
  }

  private emit(effect: Active, track: Extract<EffectTrack, { kind: 'particles' }>, position: { x: number; y: number }): void {
    const available = MAX_PARTICLES - this.diagnostics.aliveParticles;
    const count = Math.min(Math.round(track.count * effect.intensity), available, track.count);
    if (count < 1) { this.dropped += 1; return; }
    const angle = cosmeticChoice((effect.seed + Math.floor(effect.elapsed)) >>> 0, 360);
    const emitter = this.scene.add.particles(0, 0, this.atlas, {
      frame: track.frame, emitting: false, lifespan: track.lifespanMs,
      speed: track.speed, angle: { min: angle, max: angle + 359 },
      alpha: { start: 1, end: 0 }, maxParticles: count, maxAliveParticles: count,
      blendMode: Phaser.BlendModes.NORMAL,
    }).setDepth(2);
    effect.owned.push(emitter);
    emitter.explode(count, position.x, position.y);
  }

  private end(effect: Active, result: EffectResult): void {
    if (effect.done) return;
    effect.done = true;
    this.active.delete(effect);
    for (const visual of effect.owned) visual.destroy();
    effect.owned.length = 0; effect.images.clear();
    effect.finish(result);
  }

  get diagnostics(): EffectDiagnostics {
    let aliveParticles = 0, pooledParticles = 0;
    for (const effect of this.active) for (const visual of effect.owned) if (visual instanceof Phaser.GameObjects.Particles.ParticleEmitter) {
      aliveParticles += visual.getAliveParticleCount(); pooledParticles += visual.getParticleCount();
    }
    return { active: this.active.size, aliveParticles, pooledParticles, dropped: this.dropped, fallbacks: this.fallbacks };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const effect of [...this.active]) this.end(effect, 'cancelled');
  }
}
