import { describe, expect, it } from 'vitest';
import type { MapDefinition } from '../../src/content/generated/map';
import type { ResolvedObjectState } from '../../src/domain/object-state';
import { actorOccupiedCells, applySolidityChanges, createDynamicCollision, resolvedCanEnter } from '../../src/domain/collision-view';
import type { SolidityChange } from '../../src/domain/collision-view';
import { advanceActor, createActor } from '../../src/domain/movement';
import type { Actor } from '../../src/domain/movement';
import { createCollision } from '../../src/domain/map.mjs';

const resolved = (id: string, solid: boolean): ResolvedObjectState => ({
  objectId: id, stateId: id, frame: 'gate-closed', visible: true, solid,
});

const gateMap = (): MapDefinition => ({
  schemaVersion: 1, id: 'test:map.room', name: 'Room', orientation: 'orthogonal', tileSize: 16,
  width: 4, height: 4, legend: { a: 'floor' },
  layers: [{ id: 'ground', rows: ['aaaa', 'aaaa', 'aaaa', 'aaaa'] }],
  collision: ['....', '....', '....', '....'],
  defaultSpawn: 'start', spawns: [{ id: 'start', x: 0, y: 0, facing: 'down' }],
  objects: [
    { id: 'test:object.gate', frame: 'gate-closed', x: 2, y: 1, solid: true, states: [{ id: 'closed', fallback: true, frame: 'gate-closed', visible: true }, { id: 'open', when: { type: 'factEquals', factId: 'test:fact.open', value: true }, frame: 'gate-open', visible: true, solid: false }] },
  ],
  exits: [],
});

describe('dynamic collision view derived from resolved states', () => {
  it('blocks authored wall rows, state-solid placements, bounds, and invalid coordinates', () => {
    const map = gateMap(); map.collision = ['####', '....', '....', '....'];
    const view = createDynamicCollision(map, [resolved('test:object.gate', true)]);
    expect(view.canEnter(0, 0)).toBe(false); expect(view.canEnter(2, 1)).toBe(false);
    expect(view.canEnter(4, 1)).toBe(false); expect(view.canEnter(-1, 0)).toBe(false);
    expect(view.canEnter(1.5, 1)).toBe(false); expect(view.canEnter(NaN, 0)).toBe(false);
    expect(view.blockedCount).toBe(1);
  });
  it('unblocks a statically solid placement only while its resolved state says passable', () => {
    const map = gateMap(); map.objects[0]!.solid = true;
    const view = createDynamicCollision(map, [resolved('test:object.gate', true)]);
    expect(view.canEnter(2, 1)).toBe(false);
    const staticGrid = createCollision(map); expect(staticGrid.canEnter(2, 1)).toBe(false);
    const outcome = view.update([resolved('test:object.gate', false)], new Set(['1,1']));
    expect(outcome.applied).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(true);
  });
  it('applies a solidification that is recomputed only when its state changes', () => {
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    expect(view.canEnter(2, 1)).toBe(true);
    const closed = [resolved('test:object.gate', true)];
    const outcome = view.update(closed, new Set(['0,0']));
    expect(outcome.applied).toHaveLength(1); expect(outcome.deferred).toHaveLength(0);
    expect(view.canEnter(2, 1)).toBe(false);
    expect(view.update(closed, new Set(['0,0'])).applied).toHaveLength(0); // A repeated equal resolution is a no-op.
  });
});

describe('occupied-cell policy: closing gates defer instead of trapping', () => {
  it('defers solidifying a cell the actor stands on and applies it once released', () => {
    const blocked = new Set<string>();
    const change: SolidityChange[] = [{ objectId: 'g', x: 2, y: 1, solid: true }];
    const outcome = applySolidityChanges(change, new Set(['2,1']), blocked);
    expect(outcome.applied).toHaveLength(0); expect(outcome.deferred).toHaveLength(1);
    expect(applySolidityChanges(outcome.deferred, new Set(['2,2']), blocked).applied).toHaveLength(1);
    expect([...blocked]).toEqual(['2,1']);
  });
  it('never defers unblocking or a solidification of an unoccupied cell', () => {
    const blocked = new Set(['2,1']);
    expect(applySolidityChanges([{ objectId: 'g', x: 2, y: 1, solid: false }], new Set(['2,1']), blocked).deferred).toHaveLength(0);
    expect(applySolidityChanges([{ objectId: 'g', x: 3, y: 1, solid: true }], new Set(['2,1']), new Set()).applied).toHaveLength(1);
  });
  it('cancels a queued close when the state reopens the gate before the actor leaves', () => {
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    const actor = createActor(1, 1), step = () => { for (let i = 0; i < 4; i += 1) advanceActor(actor, 'right', 40, view.canEnter); };
    step(); expect(actor.tile).toEqual({ x: 2, y: 1 });
    expect(view.update([resolved('test:object.gate', true)], actorOccupiedCells(actor)).deferred).toHaveLength(1);
    expect(view.update([resolved('test:object.gate', false)], actorOccupiedCells(actor)).deferred).toHaveLength(0);
    step(); // Leaving releases the boundary; nothing stale may close the reopened gate.
    expect(actor.tile).toEqual({ x: 3, y: 1 });
    expect(view.release(actorOccupiedCells(actor)).applied).toHaveLength(0);
    expect(view.canEnter(2, 1)).toBe(true); // The resolved state says open; the stale deferred close must be gone.
  });
  it('collapses repeated occupied refreshes into one pending close that applies exactly once', () => {
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    const occupied = new Set(['2,1']);
    view.update([resolved('test:object.gate', true)], occupied);
    for (let i = 0; i < 5; i += 1) view.update([resolved('test:object.gate', true)], occupied);
    const stillHere = view.release(occupied);
    expect(stillHere.applied).toHaveLength(0); expect(stillHere.deferred).toHaveLength(1);
    const applied = view.release(new Set(['3,1'])); // Actor gone.
    expect(applied.applied).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(false);
    expect(view.release(new Set([])).applied).toHaveLength(0); // No duplicate close persists.
  });
  it('keeps a still-occupied deferred change pending across releases', () => {
    const blocked = new Set<string>();
    const deferred = applySolidityChanges([{ objectId: 'g', x: 2, y: 1, solid: true }], new Set(['2,1']), blocked).deferred;
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    const change: SolidityChange = { ...deferred[0]!, objectId: 'test:object.gate' };
    const outcome = view.update([{ ...change, stateId: 'deferral', frame: 'gate-closed', visible: true }], new Set(['2,1']));
    expect(outcome.deferred).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(true);
    expect(view.release(new Set(['2,1'])).applied).toHaveLength(0); expect(view.canEnter(2, 1)).toBe(true);
    expect(view.release(new Set([])).applied).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(false);
  });
  it('computes actor occupancy as the transition target during a step and the tile at rest', () => {
    const actor = createActor(1, 1);
    expect([...actorOccupiedCells(actor)]).toEqual(['1,1']);
    advanceActor(actor, 'right', 40, () => true); // One partial step: the actor occupies both spanning tiles.
    expect([...actorOccupiedCells(actor)]).toEqual(['1,1', '2,1']);
    for (let i = 0; i < 3; i += 1) advanceActor(actor, 'right', 40, () => true); // Completes the step inside the 50 ms delta cap.
    expect([...actorOccupiedCells(actor)]).toEqual(['2,1']);
  });
  it('blocks an unrestorable checkpoint save while the actor stands on a deferral-closing gate, and allows it after leaving', () => {
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    const actor = createActor(1, 1), step = () => { for (let i = 0; i < 4; i += 1) advanceActor(actor, 'right', 40, view.canEnter); };
    let current = [resolved('test:object.gate', false)];
    const canonical = () => resolvedCanEnter(map, current, actor.tile.x, actor.tile.y); // What a restored session from the current resolution would compute.
    step(); expect(actor.tile).toEqual({ x: 2, y: 1 });
    expect(canonical()).toBe(true); // While the gate is open the tile is a legitimate checkpoint.
    expect(view.update(current = [resolved('test:object.gate', true)], actorOccupiedCells(actor)).deferred).toHaveLength(1); // Close defers; the fact is already committed.
    expect(canonical()).toBe(false); // Save/export must refuse here: the stored session resolves this tile solid.
    step(); // Player leaves; the deferral applies.
    expect(view.release(actorOccupiedCells(actor)).applied).toHaveLength(1);
    expect(canonical()).toBe(true); // Attempting save from the neighbouring tile is legitimate again.
  });
});

describe('movement interplay with the dynamic view', () => {
  it('walks onto an open gate cell, defers its closing instead of trapping, and applies it after the actor leaves', () => {
    const map = gateMap(); const view = createDynamicCollision(map, [resolved('test:object.gate', false)]);
    const step = (actor: Actor) => { for (let i = 0; i < 4; i += 1) advanceActor(actor, 'right', 40, view.canEnter); };
    const actor = createActor(1, 1);
    step(actor);
    expect(actor.tile).toEqual({ x: 2, y: 1 });
    const outcome = view.update([resolved('test:object.gate', true)], actorOccupiedCells(actor));
    expect(outcome.deferred).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(true); // Closing must not trap the actor inside.
    step(actor);
    expect(actor.tile).toEqual({ x: 3, y: 1 });
    expect(view.release(actorOccupiedCells(actor)).applied).toHaveLength(1); expect(view.canEnter(2, 1)).toBe(false);
    const latecomer = createActor(1, 1);
    step(latecomer);
    expect(latecomer.tile).toEqual({ x: 1, y: 1 });
  });
});
