/** Pure tile-step movement. No renderer, DOM, random source, or clock ownership. */
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Tile { x: number; y: number }
interface Motion { from: Tile; to: Tile; elapsedMs: number }
export interface Actor { tile: Tile; facing: Direction; motion: Motion | null }
export type CanEnter = (x: number, y: number) => boolean;

export const STEP_MS = 160;
export const MAX_FRAME_MS = 50;
const vectors: Record<Direction, Tile> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

export function createActor(x: number, y: number): Actor {
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('Spawn must use integer tile coordinates.');
  return { tile: { x, y }, facing: 'down', motion: null };
}

/** A stalled or resumed tab cannot accumulate seconds of movement debt. */
export function safeDelta(deltaMs: number): number {
  return Number.isFinite(deltaMs) ? Math.min(MAX_FRAME_MS, Math.max(0, deltaMs)) : 0;
}

export function advanceActor(actor: Actor, direction: Direction | null, deltaMs: number, canEnter: CanEnter, onArrival?: (tile: Tile) => boolean): void {
  let remainingMs = safeDelta(deltaMs);
  while (remainingMs > 1e-7) {
    if (!actor.motion) {
      if (!direction) return;
      actor.facing = direction;
      const vector = vectors[direction];
      const to = { x: actor.tile.x + vector.x, y: actor.tile.y + vector.y };
      if (!canEnter(to.x, to.y)) return;
      actor.motion = { from: { ...actor.tile }, to, elapsedMs: 0 };
    }
    const consumed = Math.min(remainingMs, STEP_MS - actor.motion.elapsedMs);
    actor.motion.elapsedMs += consumed;
    remainingMs -= consumed;
    if (actor.motion.elapsedMs >= STEP_MS - 1e-7) {
      actor.tile = actor.motion.to;
      actor.motion = null;
      // A door can consume the arrival before any leftover time starts another step.
      if (onArrival && !onArrival(actor.tile)) return;
    }
  }
}

/** Subpixel simulation is retained; the renderer rounds only its final positions. */
export function actorPosition(actor: Actor, tileSize: number): Tile {
  const motion = actor.motion;
  const t = motion ? motion.elapsedMs / STEP_MS : 0;
  const x = motion ? motion.from.x + (motion.to.x - motion.from.x) * t : actor.tile.x;
  const y = motion ? motion.from.y + (motion.to.y - motion.from.y) * t : actor.tile.y;
  return { x: (x + 0.5) * tileSize, y: (y + 0.5) * tileSize };
}
