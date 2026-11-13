import type { EncounterCatalog } from '../content/generated/encounters';
import { GRID, alliesAhead, canReach, placeGrid, scaleDamage, shieldPercent } from './battle-grid.mjs';
import type { Direction, Placement, Reach } from './battle-grid.mjs';

/**
 * Pure, transient battle rules on a visible turn timeline (decision 0006, M5.3a).
 *
 * Every combatant has a `nextTick`. The living combatant with the lowest tick acts next; ties go to the party, then
 * to the lower slot. Acting moves the actor later by `delay(speed, weight)`. The timeline preview is computed from
 * the same rule, so the order it shows is the order that executes until the hero's next decision, except that
 * defeated combatants drop out. Damage uses the battle's own seeded stream; previews and invalid commands never
 * consume it. No Phaser, DOM, storage or wall-clock dependency.
 *
 * Decision 0014 (M5.4a): every fighter stands on its side's 3 × 3 grid. A fighter is front-facing when no living ally
 * stands between it and the attacker in its lane; melee reaches front-facing targets, reach weapons one layer deeper,
 * ranged attacks anyone. Allies ahead shield a target (20% or 35% less damage). Move takes a fighter to an empty cell
 * or swaps it with an ally. A back attack or a pincer only changes which side an attack comes from.
 */
type AuthoredEncounter = EncounterCatalog['encounters'][number];
/** The encounter as played: its party resolved from the roster and guests (decision 0014 M5.4d, `battleEncounter`). */
export type Encounter = Omit<AuthoredEncounter, 'party' | 'guests'> & { readonly party: NonNullable<AuthoredEncounter['party']> };
export type Side = 'party' | 'enemy';
export type BattlePhase = 'command' | 'victory' | 'defeat' | 'escaped';
export type Opening = 'normal' | 'back-attack' | 'pincer';
/** A grid cell, 0-based: lane 0 (top) to 2, depth 0 (front) to 2. */
export interface Cell { readonly lane: number; readonly depth: number }
export type BattleCommand =
  | { readonly type: 'attack'; readonly target: string }
  | { readonly type: 'guard' }
  | { readonly type: 'item'; readonly itemId: string; readonly target: string }
  | { readonly type: 'move'; readonly to: Cell }
  | { readonly type: 'escape' };
export type BattleEvent =
  | { readonly kind: 'attack'; readonly actor: string; readonly target: string; readonly damage: number; readonly guarded: boolean; readonly defeated: boolean; readonly shields: number }
  | { readonly kind: 'guard'; readonly actor: string }
  | { readonly kind: 'heal'; readonly actor: string; readonly target: string; readonly itemId: string; readonly amount: number }
  | { readonly kind: 'move'; readonly actor: string; readonly from: Cell; readonly to: Cell; readonly swapped: string | null }
  | { readonly kind: 'escape'; readonly actor: string };
export type RejectReason = 'phase' | 'unknown-command' | 'invalid-target' | 'out-of-reach' | 'invalid-cell' | 'not-usable' | 'full-hp';
export interface BattleItemUse { readonly heal: number }
export interface CombatantSnapshot {
  readonly id: string; readonly side: Side; readonly slot: number; readonly name: string; readonly frame: string;
  readonly hp: number; readonly maxHp: number; readonly attack: number; readonly defense: number; readonly speed: number;
  readonly nextTick: number; readonly guarding: boolean;
  /** Grid position (top front cell for a big enemy) and size, 0-based. */
  readonly lane: number; readonly depth: number; readonly lanes: number; readonly depths: number;
  readonly reach: Reach;
  /** Pincer enemies only: the side of the party they attack from; each flank has its own grid. */
  readonly flank: Direction | null;
  /** Presentation only (decision 0015): the Stone Soup creature drawn for this enemy, and which way its art faces. */
  readonly creature: string | null; readonly faces: 'left' | 'right';
}
export interface TurnPreview { readonly actor: string; readonly tick: number }
export interface BattleSnapshot {
  readonly encounterId: string;
  readonly opening: Opening;
  readonly phase: BattlePhase;
  /** Completed actions since the battle started. */
  readonly turn: number;
  /** The combatant whose turn it is, or null once the battle has ended. */
  readonly active: string | null;
  readonly combatants: readonly CombatantSnapshot[];
  /** Upcoming turns, the active combatant first, assuming ordinary actions. */
  readonly timeline: readonly TurnPreview[];
  /** Everything resolved by the latest command, in order, for presentation playback. */
  readonly events: readonly BattleEvent[];
}

/** Ticks per action at speed 1 and weight 100. */
export const TIMELINE_BASE = 1000;
/** Action weights: lighter actions come around again sooner. */
export const ACTION_WEIGHT = { attack: 100, guard: 60, item: 80, move: 60 } as const;
export const TIMELINE_LENGTH = 8;

export function actionDelay(speed: number, weight: number): number {
  return Math.ceil((TIMELINE_BASE * weight) / (100 * speed));
}

interface Fighter extends Omit<CombatantSnapshot, 'nextTick' | 'guarding' | 'hp' | 'lane' | 'depth'> { hp: number; nextTick: number; guarding: boolean; lane: number; depth: number }

/** Every fighter's grid placement by side and slot (decision 0014). Content validation has already checked them. */
function gridPlacements(encounter: Encounter): Record<Side, Placement[]> {
  const place = (members: readonly Encounter['party'][number][]): Placement[] => {
    const { placements, issues } = placeGrid(members);
    if (issues.length) throw new Error(`Encounter ${encounter.id}: ${issues[0]!.message}`);
    return placements;
  };
  const party = place(encounter.party);
  if (encounter.opening !== 'pincer') return { party, enemy: place(encounter.enemies) };
  const enemy: Placement[] = [];
  for (const flank of ['front', 'rear'] as const) {
    const slots = encounter.enemies.flatMap((c, i) => ((c.flank ?? 'front') === flank ? [i] : []));
    place(slots.map(i => encounter.enemies[i]!)).forEach((p, k) => { enemy[slots[k]!] = p; });
  }
  return { party, enemy };
}

const order = (a: Pick<Fighter, 'nextTick' | 'side' | 'slot'>, b: Pick<Fighter, 'nextTick' | 'side' | 'slot'>): number =>
  a.nextTick - b.nextTick || (a.side === b.side ? 0 : a.side === 'party' ? -1 : 1) || a.slot - b.slot;

export class BattleSession {
  private rng = 0;
  private fighters: Fighter[] = [];
  private phase: BattlePhase = 'command';
  private turn = 0;
  private events: BattleEvent[] = [];
  private readonly opening: Opening;

  constructor(readonly encounter: Encounter, private readonly items: ReadonlyMap<string, BattleItemUse> = new Map()) {
    this.opening = encounter.opening ?? 'normal';
    this.reset();
  }

  snapshot(): BattleSnapshot {
    const active = this.phase === 'command' ? this.next()?.id ?? null : null;
    return {
      encounterId: this.encounter.id, opening: this.opening, phase: this.phase, turn: this.turn, active,
      combatants: this.fighters.map(fighter => ({ ...fighter })),
      timeline: this.phase === 'command' ? this.preview() : [],
      events: [...this.events],
    };
  }

  /** Why a command cannot be taken now, or null. Pure: never changes state or the random stream. */
  validate(command: BattleCommand): RejectReason | null {
    if (this.phase !== 'command') return 'phase';
    const actor = this.next();
    if (!actor || actor.side !== 'party') return 'phase';
    if (command.type === 'attack') {
      const target = this.find(command.target);
      if (!target || target.side !== 'enemy' || target.hp <= 0) return 'invalid-target';
      return canReach(actor.reach, this.ahead(target, actor)) ? null : 'out-of-reach';
    }
    if (command.type === 'move') {
      const { lane, depth } = command.to;
      if (![lane, depth].every(n => Number.isInteger(n) && n >= 0 && n < GRID)) return 'invalid-cell';
      if (lane === actor.lane && depth === actor.depth) return 'invalid-cell';
      const occupant = this.occupant(actor, command.to);
      return occupant === undefined || (occupant.lanes === 1 && occupant.depths === 1) ? null : 'invalid-cell';
    }
    if (command.type === 'item') {
      if (!this.items.has(command.itemId)) return 'not-usable';
      const target = this.find(command.target);
      if (!target || target.side !== 'party' || target.hp <= 0) return 'invalid-target';
      return target.hp >= target.maxHp ? 'full-hp' : null;
    }
    if (command.type === 'guard' || command.type === 'escape') return null;
    return 'unknown-command';
  }

  /** The upcoming turns if the active hero took `command` now (no randomness, no state change). */
  preview(command?: BattleCommand, length = TIMELINE_LENGTH): TurnPreview[] {
    const sim = this.fighters.filter(fighter => fighter.hp > 0).map(fighter => ({ ...fighter }));
    const result: TurnPreview[] = [];
    let first = true;
    while (result.length < length && sim.length) {
      const actor = sim.reduce((best, fighter) => order(fighter, best) < 0 ? fighter : best);
      result.push({ actor: actor.id, tick: actor.nextTick });
      const weight = first && command && command.type !== 'escape' && command.type !== 'attack'
        ? ACTION_WEIGHT[command.type] : ACTION_WEIGHT.attack;
      actor.nextTick += actionDelay(actor.speed, weight);
      first = false;
    }
    return result;
  }

  /**
   * Resolve the active hero's command, then every enemy turn up to the next hero decision or the end of the battle.
   * An invalid command changes nothing. Callers spend items through their own transaction before calling this.
   */
  command(command: BattleCommand): BattleSnapshot {
    if (this.validate(command) !== null) return this.snapshot();
    const hero = this.next()!;
    this.events = [];
    hero.guarding = false;
    if (command.type === 'escape') {
      this.events.push({ kind: 'escape', actor: hero.id });
      this.phase = 'escaped';
      this.turn += 1;
      return this.snapshot();
    }
    if (command.type === 'attack') this.strike(hero, this.find(command.target)!);
    else if (command.type === 'guard') { hero.guarding = true; this.events.push({ kind: 'guard', actor: hero.id }); }
    else if (command.type === 'move') this.move(hero, command.to);
    else {
      const target = this.find(command.target)!;
      const amount = Math.min(this.items.get(command.itemId)!.heal, target.maxHp - target.hp);
      target.hp += amount;
      this.events.push({ kind: 'heal', actor: hero.id, target: target.id, itemId: command.itemId, amount });
    }
    hero.nextTick += actionDelay(hero.speed, command.type === 'attack' ? ACTION_WEIGHT.attack : ACTION_WEIGHT[command.type]);
    this.turn += 1;
    this.settle();
    while (this.phase === 'command') {
      const actor = this.next()!;
      if (actor.side === 'party') { actor.guarding = false; break; }
      const target = this.enemyTarget(actor);
      if (target) this.strike(actor, target);
      actor.nextTick += actionDelay(actor.speed, ACTION_WEIGHT.attack);
      this.turn += 1;
      this.settle();
    }
    return this.snapshot();
  }

  /** After a defeat, restart the same encounter with the same seed. Spent items are not refunded. */
  retry(): BattleSnapshot {
    if (this.phase === 'defeat') this.reset();
    return this.snapshot();
  }

  private reset(): void {
    const placements = gridPlacements(this.encounter);
    const build = (side: Side) => (combatant: Encounter['party'][number], slot: number): Fighter => ({
      id: combatant.id, side, slot, name: combatant.name, frame: combatant.frame,
      hp: combatant.hp, maxHp: combatant.hp, attack: combatant.attack, defense: combatant.defense, speed: combatant.speed,
      nextTick: actionDelay(combatant.speed, ACTION_WEIGHT.attack), guarding: false,
      ...placements[side][slot]!, reach: combatant.reach ?? 'melee', creature: combatant.creature ?? null, faces: combatant.faces ?? 'left', flank: side === 'enemy' && this.opening === 'pincer' ? combatant.flank ?? 'front' : null,
    });
    this.fighters = [...this.encounter.party.map(build('party')), ...this.encounter.enemies.map(build('enemy'))];
    this.rng = this.encounter.seed >>> 0;
    this.phase = 'command';
    this.turn = 0;
    this.events = [];
    // A battle that opens on enemy turns resolves them before the first hero decision.
    while (this.next()?.side === 'enemy') {
      const actor = this.next()!;
      const target = this.enemyTarget(actor);
      if (target) this.strike(actor, target);
      actor.nextTick += actionDelay(actor.speed, ACTION_WEIGHT.attack);
      this.turn += 1;
      this.settle();
      if (this.phase !== 'command') break;
    }
  }

  private strike(actor: Fighter, target: Fighter): void {
    const raw = this.damage(actor.attack, target.defense);
    const shields = this.ahead(target, actor);
    // Guard halves; shields take 20% or 35% off; rounded up once at the end (decision 0014).
    const damage = scaleDamage(raw, [target.guarding ? 50 : 100, shieldPercent(shields)]);
    target.hp = Math.max(0, target.hp - damage);
    this.events.push({ kind: 'attack', actor: actor.id, target: target.id, damage, guarded: target.guarding, defeated: target.hp === 0, shields });
  }

  /** Move to an empty cell of the actor's grid, or swap with the ally standing there. */
  private move(actor: Fighter, to: Cell): void {
    const from = { lane: actor.lane, depth: actor.depth };
    const other = this.occupant(actor, to);
    if (other) { other.lane = from.lane; other.depth = from.depth; }
    actor.lane = to.lane; actor.depth = to.depth;
    this.events.push({ kind: 'move', actor: actor.id, from, to: { ...to }, swapped: other?.id ?? null });
  }

  /** The ally (living or downed) covering a cell of the actor's grid, if any. */
  private occupant(actor: Fighter, cell: Cell): Fighter | undefined {
    return this.fighters.find(f => f !== actor && f.side === actor.side && f.flank === actor.flank
      && cell.lane >= f.lane && cell.lane < f.lane + f.lanes && cell.depth >= f.depth && cell.depth < f.depth + f.depths);
  }

  /** Which side of the target's grid an attack from `attacker` arrives on. Enemies are always attacked on their front. */
  private direction(target: Fighter, attacker: Fighter): Direction {
    if (target.side === 'enemy') return 'front';
    if (this.opening === 'back-attack') return 'rear';
    if (this.opening === 'pincer') return attacker.flank ?? 'front';
    return 'front';
  }

  /** Living allies between the target and this attacker, in the target's most open lane. */
  private ahead(target: Fighter, attacker: Fighter): number {
    const allies = this.fighters.filter(f => f !== target && f.hp > 0 && f.side === target.side && f.flank === target.flank);
    return alliesAhead(target, allies, this.direction(target, attacker));
  }

  /**
   * An enemy's choice, deterministic and free of random numbers: the reachable living party member with the fewest
   * allies ahead (front-facing first), then the lowest lane, then the frontmost.
   */
  private enemyTarget(actor: Fighter): Fighter | undefined {
    const reachable = this.living('party').map(f => ({ f, ahead: this.ahead(f, actor) })).filter(({ ahead }) => canReach(actor.reach, ahead));
    reachable.sort((a, b) => a.ahead - b.ahead || a.f.lane - b.f.lane || a.f.depth - b.f.depth || a.f.slot - b.f.slot);
    return reachable[0]?.f;
  }

  private settle(): void {
    if (this.living('enemy').length === 0) this.phase = 'victory';
    else if (this.living('party').length === 0) this.phase = 'defeat';
  }

  private next(): Fighter | undefined {
    const living = this.fighters.filter(fighter => fighter.hp > 0);
    return living.length ? living.reduce((best, fighter) => order(fighter, best) < 0 ? fighter : best) : undefined;
  }

  private living(side: Side): Fighter[] { return this.fighters.filter(fighter => fighter.side === side && fighter.hp > 0); }
  private find(id: string): Fighter | undefined { return this.fighters.find(fighter => fighter.id === id); }

  private damage(attack: number, defense: number): number {
    // LCG arithmetic is fixed to unsigned 32-bit integers for browser-independent traces.
    this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0;
    const variance = this.rng % 3 - 1;
    return Math.max(1, attack - defense + variance);
  }
}
