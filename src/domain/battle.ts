import type { EncounterCatalog } from '../content/generated/encounters';

/**
 * Pure, transient battle rules on a visible turn timeline (decision 0006, M5.3a).
 *
 * Every combatant has a `nextTick`. The living combatant with the lowest tick acts next; ties go to the party, then
 * to the lower slot. Acting moves the actor later by `delay(speed, weight)`. The timeline preview is computed from
 * the same rule, so the order it shows is the order that executes until the hero's next decision, except that
 * defeated combatants drop out. Damage uses the battle's own seeded stream; previews and invalid commands never
 * consume it. No Phaser, DOM, storage or wall-clock dependency.
 */
export type Encounter = EncounterCatalog['encounters'][number];
export type Side = 'party' | 'enemy';
export type BattlePhase = 'command' | 'victory' | 'defeat' | 'escaped';
export type BattleCommand =
  | { readonly type: 'attack'; readonly target: string }
  | { readonly type: 'guard' }
  | { readonly type: 'item'; readonly itemId: string; readonly target: string }
  | { readonly type: 'escape' };
export type BattleEvent =
  | { readonly kind: 'attack'; readonly actor: string; readonly target: string; readonly damage: number; readonly guarded: boolean; readonly defeated: boolean }
  | { readonly kind: 'guard'; readonly actor: string }
  | { readonly kind: 'heal'; readonly actor: string; readonly target: string; readonly itemId: string; readonly amount: number }
  | { readonly kind: 'escape'; readonly actor: string };
export type RejectReason = 'phase' | 'unknown-command' | 'invalid-target' | 'not-usable' | 'full-hp';
export interface BattleItemUse { readonly heal: number }
export interface CombatantSnapshot {
  readonly id: string; readonly side: Side; readonly slot: number; readonly name: string; readonly frame: string;
  readonly hp: number; readonly maxHp: number; readonly attack: number; readonly defense: number; readonly speed: number;
  readonly nextTick: number; readonly guarding: boolean;
}
export interface TurnPreview { readonly actor: string; readonly tick: number }
export interface BattleSnapshot {
  readonly encounterId: string;
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
export const ACTION_WEIGHT = { attack: 100, guard: 60, item: 80 } as const;
export const TIMELINE_LENGTH = 8;

export function actionDelay(speed: number, weight: number): number {
  return Math.ceil((TIMELINE_BASE * weight) / (100 * speed));
}

interface Fighter extends Omit<CombatantSnapshot, 'nextTick' | 'guarding' | 'hp'> { hp: number; nextTick: number; guarding: boolean }

const order = (a: Pick<Fighter, 'nextTick' | 'side' | 'slot'>, b: Pick<Fighter, 'nextTick' | 'side' | 'slot'>): number =>
  a.nextTick - b.nextTick || (a.side === b.side ? 0 : a.side === 'party' ? -1 : 1) || a.slot - b.slot;

export class BattleSession {
  private rng = 0;
  private fighters: Fighter[] = [];
  private phase: BattlePhase = 'command';
  private turn = 0;
  private events: BattleEvent[] = [];

  constructor(readonly encounter: Encounter, private readonly items: ReadonlyMap<string, BattleItemUse> = new Map()) {
    this.reset();
  }

  snapshot(): BattleSnapshot {
    const active = this.phase === 'command' ? this.next()?.id ?? null : null;
    return {
      encounterId: this.encounter.id, phase: this.phase, turn: this.turn, active,
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
      return target && target.side === 'enemy' && target.hp > 0 ? null : 'invalid-target';
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
      const target = this.living('party').reduce((best, fighter) => fighter.slot < best.slot ? fighter : best);
      this.strike(actor, target);
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
    const build = (side: Side) => (combatant: Encounter['party'][number], slot: number): Fighter => ({
      id: combatant.id, side, slot, name: combatant.name, frame: combatant.frame,
      hp: combatant.hp, maxHp: combatant.hp, attack: combatant.attack, defense: combatant.defense, speed: combatant.speed,
      nextTick: actionDelay(combatant.speed, ACTION_WEIGHT.attack), guarding: false,
    });
    this.fighters = [...this.encounter.party.map(build('party')), ...this.encounter.enemies.map(build('enemy'))];
    this.rng = this.encounter.seed >>> 0;
    this.phase = 'command';
    this.turn = 0;
    this.events = [];
    // A battle that opens on enemy turns resolves them before the first hero decision.
    while (this.next()?.side === 'enemy') {
      const actor = this.next()!;
      this.strike(actor, this.living('party').reduce((best, fighter) => fighter.slot < best.slot ? fighter : best));
      actor.nextTick += actionDelay(actor.speed, ACTION_WEIGHT.attack);
      this.turn += 1;
      this.settle();
      if (this.phase !== 'command') break;
    }
  }

  private strike(actor: Fighter, target: Fighter): void {
    const raw = this.damage(actor.attack, target.defense);
    const damage = target.guarding ? Math.ceil(raw / 2) : raw;
    target.hp = Math.max(0, target.hp - damage);
    this.events.push({ kind: 'attack', actor: actor.id, target: target.id, damage, guarded: target.guarding, defeated: target.hp === 0 });
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
