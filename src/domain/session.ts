import type { FactCatalog } from '../content/generated/facts';
import type { ItemCatalog } from '../content/generated/items';
import type { MapDefinition } from '../content/generated/map';

export type Placement = MapDefinition['objects'][number];
export type DependencyKey = `fact:${string}` | `item:${string}` | `placement:${string}`;
export interface SessionSnapshot {
  readonly revision: number;
  readonly inventory: Readonly<Record<string, number>>;
  readonly facts: Readonly<Record<string, boolean>>;
  readonly placements: Readonly<Record<string, { readonly opened: true }>>;
}
export interface SessionData {
  readonly inventory: Readonly<Record<string, number>>;
  readonly facts: Readonly<Record<string, boolean>>;
  readonly placements: Readonly<Record<string, { readonly opened: true }>>;
}
export interface SessionDefinitions { readonly items: ItemCatalog; readonly facts: FactCatalog }
export interface ItemChange { readonly itemId:string; readonly delta:number }
export type Condition =
  | { readonly type: 'all'; readonly conditions: readonly Condition[] }
  | { readonly type: 'any'; readonly conditions: readonly Condition[] }
  | { readonly type: 'not'; readonly condition: Condition }
  | { readonly type: 'factEquals'; readonly factId: string; readonly value: boolean }
  | { readonly type: 'itemAtLeast'; readonly itemId: string; readonly quantity: number }
  | { readonly type: 'placementOpened'; readonly placementId: string; readonly value: boolean };
export type SessionAction =
  | { readonly type: 'setFact'; readonly factId: string; readonly value: boolean }
  | { readonly type: 'changeItem'; readonly itemId: string; readonly delta: number }
  | { readonly type: 'markPlacementOpened'; readonly placementId: string };
export interface TransactionRequest {
  readonly prerequisites?: Condition;
  /** Compatibility alias for the original transaction draft. New callers use prerequisites. */
  readonly require?: Condition;
  readonly actions: readonly SessionAction[];
  readonly expectedRevision?: number;
  /** Stable placement marker committed with the actions; `self` resolves through the interaction context. */
  readonly idempotencyMarker?: string;
}
export type RejectReason = 'invalid' | 'unknown-item' | 'unknown-fact' | 'condition' | 'stack-limit' | 'capacity' | 'insufficient' | 'stale';
export type TransactionResult =
  | { readonly kind: 'committed'; readonly revision: number; readonly changed: ReadonlySet<DependencyKey> }
  | { readonly kind: 'unchanged' | 'already-claimed'; readonly revision: number; readonly changed: ReadonlySet<DependencyKey> }
  | { readonly kind: 'rejected'; readonly reason: RejectReason; readonly revision: number; readonly changed: ReadonlySet<DependencyKey> };

export const MAX_CONDITION_DEPTH = 8;
export const MAX_CONDITION_NODES = 64;
export const MAX_CONDITION_OPERANDS = 16;
const placementIdPattern = /^[a-z][a-z0-9-]{0,31}:object\.[a-z][a-z0-9.-]{0,95}$/;
const noChanges = Object.freeze(new Set<DependencyKey>()) as ReadonlySet<DependencyKey>;

function freezeSnapshot(revision: number, inventory: Record<string, number>, facts: Record<string, boolean>, placements: Record<string, {readonly opened:true}>): SessionSnapshot {
  for (const value of Object.values(placements)) Object.freeze(value);
  return Object.freeze({revision, inventory:Object.freeze(inventory), facts:Object.freeze(facts), placements:Object.freeze(placements)});
}

export function conditionDependencies(condition: Condition, selfId?: string): ReadonlySet<DependencyKey> {
  const keys = new Set<DependencyKey>();
  const visit = (node: Condition): void => {
    if (node.type === 'all' || node.type === 'any') node.conditions.forEach(visit);
    else if (node.type === 'not') visit(node.condition);
    else if (node.type === 'factEquals') keys.add(`fact:${node.factId}`);
    else if (node.type === 'itemAtLeast') keys.add(`item:${node.itemId}`);
    else keys.add(`placement:${node.placementId === 'self' ? selfId ?? 'self' : node.placementId}`);
  };
  visit(condition);
  return keys;
}

export function validateCondition(condition: Condition, knownFacts: ReadonlySet<string>, knownItems: ReadonlySet<string>, selfId?: string): string | null {
  let nodes = 0;
  const visit = (node: Condition, depth: number): string | null => {
    nodes += 1;
    if (nodes > MAX_CONDITION_NODES) return `condition exceeds ${MAX_CONDITION_NODES} nodes`;
    if (depth > MAX_CONDITION_DEPTH) return `condition exceeds depth ${MAX_CONDITION_DEPTH}`;
    if (node.type === 'all' || node.type === 'any') {
      if (node.conditions.length < 1 || node.conditions.length > MAX_CONDITION_OPERANDS) return `${node.type} requires 1-${MAX_CONDITION_OPERANDS} operands`;
      for (const child of node.conditions) { const error = visit(child, depth + 1); if (error) return error; }
    } else if (node.type === 'not') return visit(node.condition, depth + 1);
    else if (node.type === 'factEquals') { if (!knownFacts.has(node.factId)) return `unknown fact ${node.factId}`; }
    else if (node.type === 'itemAtLeast') {
      if (!knownItems.has(node.itemId)) return `unknown item ${node.itemId}`;
      if (!Number.isSafeInteger(node.quantity) || node.quantity < 0 || node.quantity > 9999) return 'invalid item quantity';
    } else {
      const id = node.placementId === 'self' ? selfId : node.placementId;
      if (!id || !placementIdPattern.test(id)) return `invalid placement ${String(id)}`;
    }
    return null;
  };
  return visit(condition, 1);
}

/** Pure app-lifetime state. It owns no browser storage, sprites, DOM nodes, or subscriptions. */
export class SessionState {
  private state: SessionSnapshot;
  private readonly items: Map<string, ItemCatalog['items'][number]>;
  private readonly factDefaults: Readonly<Record<string, boolean>>;
  readonly catalog: ItemCatalog;
  readonly factCatalog: FactCatalog;

  constructor(definitions: SessionDefinitions|ItemCatalog, data?: SessionData) {
    const normalized:SessionDefinitions=Array.isArray(definitions.items)?{items:definitions as ItemCatalog,facts:{schemaVersion:1,facts:[]}}:definitions as SessionDefinitions;
    this.catalog = structuredClone(normalized.items);
    this.factCatalog = structuredClone(normalized.facts);
    this.items = new Map(this.catalog.items.map(item => [item.id,item]));
    const factIds = new Set(this.factCatalog.facts.map(fact => fact.id));
    if (!Number.isSafeInteger(this.catalog.capacity) || this.catalog.capacity < 1 || this.catalog.capacity > 64 ||
        this.items.size !== this.catalog.items.length || this.catalog.items.length > 256 || factIds.size !== this.factCatalog.facts.length ||
        this.catalog.items.some(item => !Number.isSafeInteger(item.maxStack) || item.maxStack < 1 || item.maxStack > 9999)) throw new Error('Invalid definitions for session state');
    this.factDefaults = Object.freeze(Object.fromEntries(this.factCatalog.facts.map(fact => [fact.id,fact.default])));
    const checked = this.validateData(data ?? {inventory:{},facts:this.factDefaults,placements:{}});
    this.state = freezeSnapshot(0,checked.inventory,checked.facts,checked.placements);
    for (const item of this.catalog.items) Object.freeze(item);
    Object.freeze(this.catalog.items); Object.freeze(this.catalog.strings.en); Object.freeze(this.catalog.strings); Object.freeze(this.catalog);
    for (const fact of this.factCatalog.facts) Object.freeze(fact);
    Object.freeze(this.factCatalog.facts); Object.freeze(this.factCatalog);
  }
  snapshot(): SessionSnapshot { return this.state; }
  data(): SessionData { return Object.freeze({inventory:this.state.inventory,facts:this.state.facts,placements:this.state.placements}); }
  opened(id: string): boolean { return this.state.placements[id]?.opened === true; }
  count(id: string): number { return this.state.inventory[id] ?? 0; }
  fact(id: string): boolean { return this.state.facts[id] ?? false; }
  evaluate(condition: Condition, selfId?: string): boolean {
    if (condition.type === 'all') return condition.conditions.every(child => this.evaluate(child,selfId));
    if (condition.type === 'any') return condition.conditions.some(child => this.evaluate(child,selfId));
    if (condition.type === 'not') return !this.evaluate(condition.condition,selfId);
    if (condition.type === 'factEquals') return this.fact(condition.factId) === condition.value;
    if (condition.type === 'itemAtLeast') return this.count(condition.itemId) >= condition.quantity;
    const id = condition.placementId === 'self' ? selfId : condition.placementId;
    return !!id && this.opened(id) === condition.value;
  }
  transact(request: TransactionRequest|readonly ItemChange[], selfId?: string, expectedRevision?:number): TransactionResult {
    if(Array.isArray(request))return this.transact({actions:[...request.map(change=>({type:'changeItem' as const,itemId:change.itemId,delta:change.delta})),...(selfId?[{type:'markPlacementOpened' as const,placementId:'self'}]:[])],...(expectedRevision!==undefined?{expectedRevision}:{})},selfId);
    const transaction=request as TransactionRequest;
    const reject = (reason: RejectReason): TransactionResult => ({kind:'rejected',reason,revision:this.state.revision,changed:noChanges});
    if (transaction.expectedRevision !== undefined && transaction.expectedRevision !== this.state.revision) return reject('stale');
    if (!Array.isArray(transaction.actions) || transaction.actions.length < 1 || transaction.actions.length > 64) return reject('invalid');
    if(transaction.prerequisites&&transaction.require)return reject('invalid');
    const prerequisites=transaction.prerequisites??transaction.require;
    if (prerequisites) {
      const conditionError=validateCondition(prerequisites,new Set(Object.keys(this.factDefaults)),new Set(this.items.keys()),selfId);
      if(conditionError)return reject('invalid');
    }
    if (prerequisites && !this.evaluate(prerequisites,selfId)) return reject('condition');
    const marker=transaction.idempotencyMarker==='self'?selfId:transaction.idempotencyMarker;
    if(transaction.idempotencyMarker&&(!marker||!placementIdPattern.test(marker)))return reject('invalid');
    if(marker&&this.opened(marker))return {kind:'already-claimed',revision:this.state.revision,changed:noChanges};
    for(const action of transaction.actions)if(action.type==='markPlacementOpened'){
      const id=action.placementId==='self'?selfId:action.placementId;
      if(!id||!placementIdPattern.test(id))return reject('invalid');
      if(this.opened(id))return {kind:'already-claimed',revision:this.state.revision,changed:noChanges};
    }
    const inventory: Record<string,number> = {...this.state.inventory};
    const facts: Record<string,boolean> = {...this.state.facts};
    const placements: Record<string,{readonly opened:true}> = {...this.state.placements};
    if(marker)placements[marker]=Object.freeze({opened:true});
    const changed = new Set<DependencyKey>();
    for (const action of transaction.actions) {
      if (action.type === 'changeItem') {
        if (!Number.isSafeInteger(action.delta) || action.delta === 0 || Math.abs(action.delta) > 9999) return reject('invalid');
        if (!this.items.has(action.itemId)) return reject('unknown-item');
        inventory[action.itemId] = (inventory[action.itemId] ?? 0) + action.delta;
      } else if (action.type === 'setFact') {
        if (!Object.hasOwn(this.factDefaults,action.factId)) return reject('unknown-fact');
        if(typeof action.value!=='boolean')return reject('invalid');
        facts[action.factId] = action.value;
      } else if(action.type==='markPlacementOpened') {
        const id = action.placementId === 'self' ? selfId : action.placementId;
        if (!id || !placementIdPattern.test(id)) return reject('invalid');
        placements[id] = Object.freeze({opened:true});
      } else return reject('invalid');
    }
    for (const [id,count] of Object.entries(inventory)) {
      if (count < 0) return reject('insufficient');
      if (count > this.items.get(id)!.maxStack) return reject('stack-limit');
      if (count === 0) delete inventory[id];
    }
    if (Object.keys(inventory).length > this.catalog.capacity) return reject('capacity');
    for(const id of new Set([...Object.keys(this.state.inventory),...Object.keys(inventory)]))if(this.state.inventory[id]!==inventory[id])changed.add(`item:${id}`);
    for(const id of Object.keys(facts))if(this.state.facts[id]!==facts[id])changed.add(`fact:${id}`);
    for(const id of Object.keys(placements))if(!this.state.placements[id])changed.add(`placement:${id}`);
    if (changed.size === 0) return {kind:'unchanged',revision:this.state.revision,changed:noChanges};
    this.state = freezeSnapshot(this.state.revision+1,inventory,facts,placements);
    return {kind:'committed',revision:this.state.revision,changed:Object.freeze(changed) as ReadonlySet<DependencyKey>};
  }
  claim(placement: Placement): TransactionResult {
    const chest = placement.chest;
    if (!chest) return {kind:'rejected',reason:'invalid',revision:this.state.revision,changed:noChanges};
    return this.transact({actions:[{type:'changeItem',itemId:chest.itemId,delta:chest.quantity}],idempotencyMarker:'self'},placement.id);
  }
  private validateData(data: SessionData): {inventory:Record<string,number>;facts:Record<string,boolean>;placements:Record<string,{readonly opened:true}>} {
    const inventory: Record<string,number> = {};
    for (const [id,count] of Object.entries(data.inventory)) { const item=this.items.get(id); if(!item||!Number.isSafeInteger(count)||count<1||count>item.maxStack)throw new Error(`Invalid saved inventory entry: ${id}`);inventory[id]=count; }
    if (Object.keys(inventory).length > this.catalog.capacity) throw new Error('Saved inventory exceeds capacity');
    const facts: Record<string,boolean> = {...this.factDefaults};
    for (const [id,value] of Object.entries(data.facts)) { if(!Object.hasOwn(this.factDefaults,id)||typeof value!=='boolean')throw new Error(`Invalid saved fact: ${id}`);facts[id]=value; }
    const placements: Record<string,{readonly opened:true}> = {};
    for (const [id,value] of Object.entries(data.placements)) { if(!placementIdPattern.test(id)||value?.opened!==true||Object.keys(value).length!==1)throw new Error(`Invalid saved placement: ${id}`);placements[id]=Object.freeze({opened:true}); }
    return {inventory,facts,placements};
  }
}
