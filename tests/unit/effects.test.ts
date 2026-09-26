import { describe, expect, test, vi } from 'vitest';
import type Phaser from 'phaser';
import impact from '../../src/presentation/effects/impact.json';
import { cosmeticChoice, validateRecipe, validateRequest } from '../../src/presentation/effects/contract';

const mock = vi.hoisted(() => {
  class Image {
    destroyed = false;
    setDepth() { return this; }
    setOrigin() { return this; }
    setPosition() { return this; }
    setAlpha() { return this; }
    setScale() { return this; }
    setTint() { return this; }
    setVisible() { return this; }
    destroy() { this.destroyed = true; }
  }
  class ParticleEmitter extends Image {
    count = 0;
    explode(count: number) { this.count = count; }
    getAliveParticleCount() { return this.destroyed ? 0 : this.count; }
    getParticleCount() { return this.destroyed ? 0 : this.count; }
  }
  return { Image, ParticleEmitter };
});
vi.mock('phaser', () => ({ default: {
  GameObjects: { Particles: { ParticleEmitter: mock.ParticleEmitter } },
  Math: { Linear: (from: number, to: number, factor: number) => from + (to - from) * factor },
  BlendModes: { NORMAL: 0 },
} }));

import { EffectRunner } from '../../src/presentation/effects/runner';

function scene() {
  const images: InstanceType<typeof mock.Image>[] = [];
  const particles: InstanceType<typeof mock.ParticleEmitter>[] = [];
  const fake = {
    textures: { get: () => ({ has: (frame: string) => frame === 'spark' }) },
    add: {
      image: () => { const image = new mock.Image(); images.push(image); return image; },
      particles: () => { const emitter = new mock.ParticleEmitter(); particles.push(emitter); return emitter; },
    },
  } as unknown as Phaser.Scene;
  return { fake, images, particles };
}

const world = { kind: 'world' as const, x: 24, y: 32 };
const request = { effectId: 'demo:fx.impact', anchor: world, seed: 27 };

describe('PixelFX contract', () => {
  test('validates the authored impact, bounded overrides and deterministic cosmetic choices', () => {
    const recipe = validateRecipe(impact);
    expect(recipe.tracks.map(track => track.kind)).toEqual(['sprite', 'sprite', 'sprite', 'sprite', 'sprite', 'particles']);
    expect(validateRequest({ ...request, parameters: { intensity: 1.5 } }, recipe)).toBe(1.5);
    expect(() => validateRequest({ ...request, parameters: { intensity: 3 } }, recipe)).toThrow(/intensity/);
    expect(cosmeticChoice(27, 8)).toBe(cosmeticChoice(27, 8));
    expect(cosmeticChoice(27, 8)).not.toBe(cosmeticChoice(28, 8));
  });

  test('rejects unbounded tracks, nested recipes, bad frames and invalid anchors', () => {
    expect(() => validateRecipe({ ...impact, durationMs: 100000 })).toThrow(/durationMs/);
    expect(() => validateRecipe({ ...impact, tracks: [{ kind: 'recipe', startMs: 0, id: impact.id }] })).toThrow(/kind/);
    expect(() => validateRecipe({ ...impact, tracks: [{ ...impact.tracks[0], frame: '../source.png' }] })).toThrow(/sprite/);
    expect(() => validateRequest({ ...request, anchor: { kind: 'world', x: NaN, y: 1 } }, validateRecipe(impact))).toThrow(/anchor/);
  });

  test('finishes, cancels, falls back, caps, and releases owned visuals', async () => {
    const stage = scene();
    const runner = new EffectRunner(stage.fake, 'foundation', () => ({ x: 5, y: 6 }));
    const first = runner.request(request);
    expect(runner.diagnostics.active).toBe(1);
    runner.update(50);
    expect(runner.diagnostics.aliveParticles).toBe(16);
    const missing = runner.request({ ...request, effectId: 'demo:fx.missing' });
    expect(missing.fallback).toBe(true);
    expect(runner.diagnostics.fallbacks).toBe(1);
    const invalid = runner.request({ ...request, parameters: { intensity: 9 } });
    expect(invalid.fallback).toBe(true);
    runner.request(request);
    const dropped = runner.request(request);
    expect(await dropped.completed).toBe('cancelled');
    expect(runner.diagnostics.active).toBe(4);
    expect(runner.diagnostics.dropped).toBe(1);
    first.cancel();
    expect(await first.completed).toBe('cancelled');
    runner.dispose();
    expect(await missing.completed).toBe('cancelled');
    expect(await invalid.completed).toBe('cancelled');
    expect(runner.diagnostics.active).toBe(0);
    expect(stage.images.every(image => image.destroyed)).toBe(true);
    expect(stage.particles.every(emitter => emitter.destroyed)).toBe(true);
  });

  test('an invalid anchor falls back at the safe hero position', async () => {
    const stage = scene();
    const runner = new EffectRunner(stage.fake, 'foundation', () => ({ x: 5, y: 6 }));
    const handle = runner.request({ ...request, anchor: { kind: 'world', x: NaN, y: 4 } });
    expect(handle.fallback).toBe(true);
    expect(runner.diagnostics.active).toBe(1);
    runner.dispose();
    expect(await handle.completed).toBe('cancelled');
  });

  test('reduced effects keep the essential sprite and cancel on actor loss', async () => {
    const stage = scene();
    let actor = { x: 10, y: 20 } as { x: number; y: number } | null;
    const runner = new EffectRunner(stage.fake, 'foundation', () => actor);
    runner.setQuality('reduced');
    const handle = runner.request({ ...request, anchor: { kind: 'actor', id: 'hero' } });
    runner.update(50);
    expect(stage.images.length).toBeGreaterThan(0);
    expect(stage.particles).toHaveLength(0);
    actor = null;
    runner.update(50);
    expect(await handle.completed).toBe('cancelled');
    expect(runner.diagnostics.active).toBe(0);
  });

  test('finite effect completes without relying on a gameplay clock', async () => {
    const stage = scene();
    const runner = new EffectRunner(stage.fake, 'foundation', () => null);
    const handle = runner.request(request);
    for (let step = 0; step < 8; step++) runner.update(50);
    expect(await handle.completed).toBe('completed');
    expect(runner.diagnostics.active).toBe(0);
  });
});
