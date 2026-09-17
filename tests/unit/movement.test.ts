import { describe, expect, it } from 'vitest';
import { actorPosition, advanceActor, createActor, safeDelta, STEP_MS } from '../../src/domain/movement';
import { integerScale } from '../../src/domain/viewport';

const open = (): boolean => true;
const bounded = (x: number, y: number): boolean => x >= 1 && x <= 18 && y >= 1 && y <= 10;

function frames(actor: ReturnType<typeof createActor>, direction: 'left' | 'right' | 'up' | 'down' | null, count: number, delta: number): void {
  for (let i = 0; i < count; i += 1) advanceActor(actor, direction, delta, bounded);
}

describe('renderer-independent movement', () => {
  it('starts at the center of an integer tile', () => {
    expect(actorPosition(createActor(10, 6), 16)).toEqual({ x: 168, y: 104 });
    expect(() => createActor(1.5, 2)).toThrow('integer');
  });
  it('keeps authoritative coordinates on the old tile until landing', () => {
    const actor = createActor(2, 2);
    advanceActor(actor, 'right', 40, open);
    expect(actor.tile).toEqual({ x: 2, y: 2 });
    expect(actorPosition(actor, 16)).toEqual({ x: 44, y: 40 });
    frames(actor, null, 3, 40);
    expect(actor.tile).toEqual({ x: 3, y: 2 });
    expect(actor.motion).toBeNull();
  });
  it.each([30, 60, 120, 144])('moves the same distance after two seconds at %i Hz', (hz) => {
    const actor = createActor(2, 2);
    frames(actor, 'right', hz * 2, 1000 / hz);
    expect(actorPosition(actor, 16).x).toBeCloseTo(40 + 2000 / STEP_MS * 16, 6);
    expect(actor.tile.y).toBe(2);
  });
  it('blocks walls without diagonal movement or a partial invalid step', () => {
    const actor = createActor(1, 1);
    frames(actor, 'left', 20, 16);
    frames(actor, 'up', 20, 16);
    expect(actor.tile).toEqual({ x: 1, y: 1 });
    expect(actor.motion).toBeNull();
    expect(actor.facing).toBe('up');
  });
  it('finishes one committed step after release, then stops', () => {
    const actor = createActor(5, 5);
    advanceActor(actor, 'down', 20, bounded);
    frames(actor, null, 100, 16);
    expect(actor.tile).toEqual({ x: 5, y: 6 });
    expect(actor.motion).toBeNull();
  });
  it('turns only on a tile boundary', () => {
    const actor = createActor(5, 5);
    advanceActor(actor, 'right', 40, bounded);
    frames(actor, 'up', 3, 40);
    expect(actor.tile).toEqual({ x: 6, y: 5 });
    advanceActor(actor, 'up', 40, bounded);
    expect(actor.facing).toBe('up');
    expect(actorPosition(actor, 16).x).toBe(104);
  });
  it('bounds catch-up and rejects non-finite or negative frame deltas', () => {
    for (const delta of [NaN, Infinity, -5]) expect(safeDelta(delta)).toBe(0);
    const actor = createActor(5, 5);
    advanceActor(actor, 'right', 60_000, bounded);
    expect(actorPosition(actor, 16).x).toBe(88 + 5);
    expect(actor.tile).toEqual({ x: 5, y: 5 });
  });
  it('never leaves the room after prolonged movement', () => {
    const actor = createActor(10, 6);
    frames(actor, 'right', 1000, 16);
    frames(actor, 'down', 1000, 16);
    expect(actor.tile).toEqual({ x: 18, y: 10 });
  });
});

describe('logical pixel scaling', () => {
  it.each([[640, 384, 2], [1000, 580, 3], [2000, 2000, 4], [310, 180, 1], [0, 0, 1]])('fits %ix%i at integer scale %i', (w, h, expected) => {
    expect(integerScale(w, h, 320, 192)).toBe(expected);
  });
  it('rejects invalid logical dimensions', () => {
    expect(() => integerScale(100, 100, 0, 192)).toThrow();
    expect(() => integerScale(NaN, 100, 320, 192)).toThrow();
  });
});
