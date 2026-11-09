/**
 * The baked frame manifest written by `tools/bake-frames.ts` and read by the game at runtime.
 * Paths are relative to the `generated/` folder.
 */
import type { Fill } from './fill.ts';

export interface ManifestFrame {
  readonly description: string;
  /** Border width in logical pixels (CSS border-width; the fill starts this far inside the box). */
  readonly border: number;
  /** Overhang drawn outside the box, in logical pixels (CSS border-image-outset). */
  readonly outset: number;
  /** Slice size measured from the image edge (CSS border-image-slice, Phaser NineSlice insets). */
  readonly slice: number;
  readonly tile: number;
  readonly repeat: 'stretch' | 'repeat';
  /** Image width and height (square). */
  readonly size: number;
  readonly inset: boolean;
  readonly images: Readonly<Record<'raised' | 'hover' | 'pressed' | 'focus' | 'active' | 'disabled', string>>;
  readonly pulse: readonly string[] | null;
  readonly fill: Fill;
}

export interface BattleTextColors {
  readonly text: string;
  readonly muted: string;
  readonly disabled: string;
  readonly danger: string;
  readonly cursor: string;
  readonly outline: string;
}

export interface FrameManifest {
  readonly schemaVersion: 1;
  readonly generator: string;
  readonly theme: string;
  readonly frames: Readonly<Record<string, ManifestFrame>>;
  readonly battleText: BattleTextColors;
}

const HEX = /^#[0-9a-f]{6}$/;
const PATH = /^frames\/[a-z][a-z0-9-]*\.[0-9a-f]{12}\.png$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

function fill(value: unknown): value is Fill {
  if (!isObject(value)) return false;
  if (value.kind === 'none') return true;
  if (value.kind === 'flat') return typeof value.color === 'string' && HEX.test(value.color);
  return value.kind === 'bands' && typeof value.top === 'string' && HEX.test(value.top) && typeof value.bottom === 'string' && HEX.test(value.bottom)
    && whole(value.band, 16) && (value.band as number) >= 1;
}

function frame(value: unknown): value is ManifestFrame {
  if (!isObject(value) || !isObject(value.images)) return false;
  const images = value.images;
  return typeof value.description === 'string' && whole(value.border, 16) && whole(value.outset, 32) && whole(value.slice, 64)
    && whole(value.tile, 64) && whole(value.size, 256) && (value.repeat === 'stretch' || value.repeat === 'repeat') && typeof value.inset === 'boolean'
    && ['raised', 'hover', 'pressed', 'focus', 'active', 'disabled'].every(state => typeof images[state] === 'string' && PATH.test(images[state]))
    && (value.pulse === null || (Array.isArray(value.pulse) && value.pulse.every(path => typeof path === 'string' && PATH.test(path))))
    && fill(value.fill);
}

/** Check a fetched manifest's shape; throws with a short reason when it does not match. */
export function parseFrameManifest(value: unknown): FrameManifest {
  if (!isObject(value) || value.schemaVersion !== 1 || typeof value.theme !== 'string' || typeof value.generator !== 'string') throw new Error('frame manifest: unsupported format');
  if (!isObject(value.frames) || !Object.values(value.frames).every(frame)) throw new Error('frame manifest: invalid frame entry');
  const text = value.battleText;
  if (!isObject(text) || !['text', 'muted', 'disabled', 'danger', 'cursor', 'outline'].every(key => typeof text[key] === 'string' && HEX.test(text[key]))) {
    throw new Error('frame manifest: invalid battle text colours');
  }
  return value as unknown as FrameManifest;
}
