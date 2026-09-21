/** Dynamic solidity view: authored wall rows never change; resolved object states overlay them. No renderer, DOM, or clock. */
import type { MapDefinition } from '../content/generated/map';
import type { Actor, CanEnter } from './movement';
import type { ResolvedObjectState } from './object-state';

export interface SolidityChange { readonly objectId: string; readonly x: number; readonly y: number; readonly solid: boolean }
export interface SolidityOutcome { readonly applied: readonly SolidityChange[]; readonly deferred: readonly SolidityChange[] }

const cell = (x: number, y: number): string => `${x},${y}`;

/** Cells the actor holds while moving or standing: the arrival target during a step, else the standing tile. */
export function actorOccupiedCells(actor: Actor): ReadonlySet<string> {
  return Object.freeze(new Set(actor.motion ? [cell(actor.tile.x, actor.tile.y), cell(actor.motion.to.x, actor.motion.to.y)] : [cell(actor.tile.x, actor.tile.y)]));
}

/** The safe occupied-cell policy: unblocking always applies; a solidification whose cell is occupied defers instead of trapping, crushing, or teleporting anyone; free cells apply at once. Deferred entries are re-offered on a later boundary via release. */
export function applySolidityChanges(changes: readonly SolidityChange[], occupied: ReadonlySet<string>, into: Set<string>): SolidityOutcome {
  const applied: SolidityChange[] = [];
  const deferred: SolidityChange[] = [];
  for (const change of changes) {
    const at = cell(change.x, change.y);
    if (!change.solid) { into.delete(at); applied.push(change); }
    else if (occupied.has(at)) deferred.push(change);
    else { into.add(at); applied.push(change); }
  }
  return { applied, deferred };
}

export interface DynamicCollision {
  readonly canEnter: CanEnter;
  readonly blockedCount: number;
  /** Re-derive object solidity from resolved states against an occupancy set; returns the applied changes and the ones the policy deferred. */
  update(states: readonly ResolvedObjectState[], occupied: ReadonlySet<string>): SolidityOutcome;
  /** Re-offers previously deferred solidify changes at a later safe boundary. */
  release(occupied: ReadonlySet<string>): SolidityOutcome;
}

/** Build the view once per room from the validated map and its freshly resolved object states. Authored wall rows always block and are never overridden. */
export function createDynamicCollision(map: MapDefinition, initial: Iterable<ResolvedObjectState>): DynamicCollision {
  const walls = new Set<string>();
  map.collision.forEach((row, y) => [...row].forEach((symbol, x) => { if (symbol !== '.') walls.add(cell(x, y)); }));
  const placements = new Map(map.objects.map(object => [object.id, object]));
  const blocked = new Set<string>();
  /** Deferred solidify requests keyed by placement, so a fresher state resolution replaces or cancels a stale one. */
  const pending = new Map<string, SolidityChange>();
  for (const state of initial) {
    const placement = placements.get(state.objectId);
    if (!placement) throw new Error(`Unknown placement solidity: ${state.objectId}`);
    if (state.solid && !walls.has(cell(placement.x, placement.y))) blocked.add(cell(placement.x, placement.y));
  }
  const canEnter: CanEnter = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height && !walls.has(cell(x, y)) && !blocked.has(cell(x, y));
  return {
    canEnter,
    get blockedCount(): number { return blocked.size; },
    update(states, occupied) {
      const changes: SolidityChange[] = [];
      for (const state of states) {
        const placement = placements.get(state.objectId);
        if (!placement) throw new Error(`Unknown placement solidity: ${state.objectId}`);
        const at = cell(placement.x, placement.y);
        if (state.solid) { if (!walls.has(at) && !blocked.has(at)) changes.push({ objectId: state.objectId, x: placement.x, y: placement.y, solid: true }); }
        else {
          if (blocked.has(at)) changes.push({ objectId: state.objectId, x: placement.x, y: placement.y, solid: false });
          pending.delete(state.objectId); // An unrequested close that is still queued must not outlive the open state.
        }
      }
      const outcome = applySolidityChanges(changes, occupied, blocked);
      for (const change of outcome.deferred) pending.set(change.objectId, change); // Latest resolution wins; repeated refreshes keep one entry.
      return { applied: outcome.applied, deferred: outcome.deferred };
    },
    release(occupied) {
      const retry = [...pending.values()]; pending.clear();
      const outcome = applySolidityChanges(retry, occupied, blocked);
      for (const change of outcome.deferred) pending.set(change.objectId, change);
      return outcome;
    },
  };
}
