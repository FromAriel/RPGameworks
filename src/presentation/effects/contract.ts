export type EffectAnchor = { kind: 'world'; x: number; y: number } | { kind: 'actor'; id: string };
export interface EffectRequest { effectId: string; anchor: EffectAnchor; seed: number; parameters?: { intensity?: number } }
export type EffectResult = 'completed' | 'cancelled';
export interface EffectHandle {
  readonly fallback: boolean;
  readonly reason: string | null;
  readonly completed: Promise<EffectResult>;
  cancel(): void;
}
export interface EffectDiagnostics { active: number; aliveParticles: number; pooledParticles: number; dropped: number; fallbacks: number }

export type EffectTrack =
  | { kind: 'sprite'; startMs: number; durationMs: number; frame: string; offset: { x: number; y: number }; alpha: [number, number]; scale: [number, number]; tint: [number, number] }
  | { kind: 'particles'; startMs: number; count: number; lifespanMs: number; speed: number; frame: string };
export interface EffectRecipe {
  schemaVersion: 1;
  id: string;
  durationMs: number;
  parameters: { intensity: { min: number; max: number; default: number } };
  tracks: EffectTrack[];
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const pair = (value: unknown, min: number, max: number): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(item => finite(item, min, max));
const frame = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);

/** Validation is allocation-free and refuses unknown track kinds, including nested recipes. */
export function validateRecipe(value: unknown): EffectRecipe {
  if (!record(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !/^[a-z][a-z0-9-]*:fx\.[a-z][a-z0-9-]*$/.test(value.id)) throw new Error('recipe.id or schemaVersion is invalid');
  if (!finite(value.durationMs, 1, 2000)) throw new Error(`${value.id}.durationMs must be 1..2000`);
  const parameters = value.parameters;
  if (!record(parameters) || !record(parameters.intensity) || !finite(parameters.intensity.min, 0.1, 2) || !finite(parameters.intensity.max, 0.1, 2) || !finite(parameters.intensity.default, parameters.intensity.min, parameters.intensity.max)) throw new Error(`${value.id}.parameters.intensity is invalid`);
  if (!Array.isArray(value.tracks) || value.tracks.length < 1 || value.tracks.length > 8) throw new Error(`${value.id}.tracks must contain 1..8 tracks`);
  let particles = 0;
  for (const [index, track] of value.tracks.entries()) {
    const path = `${value.id}.tracks[${index}]`;
    if (!record(track) || !finite(track.startMs, 0, value.durationMs)) throw new Error(`${path}.startMs is invalid`);
    if (track.kind === 'sprite') {
      if (!finite(track.durationMs, 1, value.durationMs - track.startMs) || !frame(track.frame) || !record(track.offset) || !finite(track.offset.x, -64, 64) || !finite(track.offset.y, -64, 64) || !pair(track.alpha, 0, 1) || !pair(track.scale, 0.1, 16) || !pair(track.tint, 0, 0xffffff) || !track.tint.every(Number.isInteger)) throw new Error(`${path} sprite fields are invalid`);
    } else if (track.kind === 'particles') {
      if (!Number.isInteger(track.count) || !finite(track.count, 1, 16) || !finite(track.lifespanMs, 1, value.durationMs - track.startMs) || !finite(track.speed, 0, 100) || !frame(track.frame)) throw new Error(`${path} particle fields are invalid`);
      particles += track.count;
    } else throw new Error(`${path}.kind is unsupported`);
  }
  if (particles > 64) throw new Error(`${value.id}.tracks exceed the per-recipe particle cap`);
  return value as unknown as EffectRecipe;
}

export function validateRequest(value: EffectRequest, recipe: EffectRecipe): number {
  if (!Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff) throw new Error('request.seed must be an unsigned 32-bit integer');
  if (!record(value.anchor) || (value.anchor.kind === 'world' ? !finite(value.anchor.x, -100000, 100000) || !finite(value.anchor.y, -100000, 100000) : value.anchor.kind === 'actor' ? typeof value.anchor.id !== 'string' || !/^[a-z][a-z0-9:.-]{0,63}$/.test(value.anchor.id) : true)) throw new Error('request.anchor is invalid');
  const intensity = value.parameters?.intensity ?? recipe.parameters.intensity.default;
  if (!finite(intensity, recipe.parameters.intensity.min, recipe.parameters.intensity.max)) throw new Error('request.parameters.intensity is out of bounds');
  return intensity;
}

export function cosmeticChoice(seed: number, alternatives: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(alternatives) || alternatives < 1) throw new Error('invalid cosmetic choice');
  let value = (seed ^ 0x9e3779b9) >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  return (value >>> 0) % alternatives;
}
