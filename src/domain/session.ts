import type { ItemCatalog } from '../content/generated/items';
import type { MapDefinition } from '../content/generated/map';

export type Placement = MapDefinition['objects'][number];
export interface SessionSnapshot {
  readonly revision: number;
  readonly inventory: Readonly<Record<string, number>>;
  /** Declared placement fact: opened is a Boolean with an immutable false default. */
  readonly placements: Readonly<Record<string, { readonly opened: true }>>;
}
export interface ItemChange { itemId: string; delta: number }
export type TransactionResult = { kind: 'committed' | 'already-claimed'; revision: number } |
  { kind: 'rejected'; reason: 'invalid' | 'unknown-item' | 'stack-limit' | 'capacity' | 'insufficient' | 'stale'; revision: number };
const empty = (): SessionSnapshot => Object.freeze({revision:0, inventory:Object.freeze({}), placements:Object.freeze({})});
const placementId = /^[a-z][a-z0-9-]{0,31}:object\.[a-z][a-z0-9.-]{0,95}$/;

/** App lifetime, not scene lifetime. Owns no sprites, browser storage or subscriptions.
 * Every mutation is an atomic transaction. Snapshots are frozen and cached until commit.
 * This is a session-state contract, NOT a gameplay save format or arbitrary fact language.
 */
export class SessionState {
  private state = empty();
  private readonly items;
  readonly catalog: ItemCatalog;
  constructor(catalog: ItemCatalog) {
    this.catalog = structuredClone(catalog);
    for (const item of this.catalog.items) Object.freeze(item);
    Object.freeze(this.catalog.items); Object.freeze(this.catalog.strings.en);
    Object.freeze(this.catalog.strings); Object.freeze(this.catalog);
    this.items = new Map(this.catalog.items.map(item => [item.id, item]));
    if (!Number.isSafeInteger(catalog.capacity) || catalog.capacity < 1 || catalog.capacity > 64 ||
        this.items.size !== catalog.items.length || catalog.items.length > 256 ||
        catalog.items.some(item => !Number.isSafeInteger(item.maxStack) || item.maxStack < 1 || item.maxStack > 9999)) {
      throw new Error('Invalid item catalog for session state');
    }
  }
  snapshot(): SessionSnapshot { return this.state; }
  opened(id: string): boolean { return this.state.placements[id]?.opened === true; }
  count(id: string): number { return this.state.inventory[id] ?? 0; }

  /** A failed operation changes neither inventory, completion facts nor revision.
   * claimedPlacement is an idempotency key for this concrete placed chest, not its art.
   */
  transact(changes: readonly ItemChange[], claimedPlacement?: string, expectedRevision?: number): TransactionResult {
    const reject = (reason: Extract<TransactionResult, {kind:'rejected'}>['reason']): TransactionResult => ({kind:'rejected', reason, revision:this.state.revision});
    if (expectedRevision !== undefined && expectedRevision !== this.state.revision) return reject('stale');
    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 64 ||
        (claimedPlacement !== undefined && !placementId.test(claimedPlacement))) return reject('invalid');
    if (claimedPlacement && this.opened(claimedPlacement)) return {kind:'already-claimed', revision:this.state.revision};
    const next: Record<string, number> = {...this.state.inventory};
    // Validate and aggregate before examining final totals; ordering cannot partly apply a trade.
    for (const change of changes) {
      if (!change || !Number.isSafeInteger(change.delta) || change.delta === 0 || Math.abs(change.delta) > 9999) return reject('invalid');
      if (!this.items.has(change.itemId)) return reject('unknown-item');
      next[change.itemId] = (next[change.itemId] ?? 0) + change.delta;
    }
    for (const [id, count] of Object.entries(next)) {
      if (count < 0) return reject('insufficient');
      if (count > this.items.get(id)!.maxStack) return reject('stack-limit');
      if (count === 0) delete next[id];
    }
    if (Object.keys(next).length > this.catalog.capacity) return reject('capacity');
    const placements = {...this.state.placements};
    if (claimedPlacement) placements[claimedPlacement] = Object.freeze({opened:true});
    this.state = Object.freeze({revision:this.state.revision+1, inventory:Object.freeze(next), placements:Object.freeze(placements)});
    return {kind:'committed', revision:this.state.revision};
  }
  claim(placement: Placement): TransactionResult {
    const chest = placement.chest;
    if (!chest || !placementId.test(placement.id) || !Number.isSafeInteger(chest.quantity) || chest.quantity < 1 || chest.quantity > 9999) {
      return {kind:'rejected', reason:'invalid', revision:this.state.revision};
    }
    return this.transact([{itemId:chest.itemId, delta:chest.quantity}], placement.id);
  }
}
