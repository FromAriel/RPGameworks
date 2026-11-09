import type { EncounterCatalog } from '../content/generated/encounters';

export type Encounter = EncounterCatalog['encounters'][number];
export type BattlePhase = 'command' | 'result' | 'victory' | 'defeat';
export type BattleCommand = 'attack' | 'guard';
export interface BattleEvent { readonly actor: 'hero' | 'enemy'; readonly kind: BattleCommand; readonly damage: number; }
export interface BattleSnapshot {
  readonly encounterId: string;
  readonly phase: BattlePhase;
  readonly round: number;
  readonly heroHp: number;
  readonly enemyHp: number;
  readonly events: readonly BattleEvent[];
}

/** Pure, transient rules. The gameplay seed belongs to this session alone. */
export class BattleSession {
  private rng: number;
  private heroHp: number;
  private enemyHp: number;
  private phase: BattlePhase = 'command';
  private round = 1;
  private events: BattleEvent[] = [];

  constructor(readonly encounter: Encounter) {
    this.rng = encounter.seed >>> 0;
    this.heroHp = encounter.hero.hp;
    this.enemyHp = encounter.enemy.hp;
  }

  snapshot(): BattleSnapshot {
    return { encounterId: this.encounter.id, phase: this.phase, round: this.round,
      heroHp: this.heroHp, enemyHp: this.enemyHp, events: [...this.events] };
  }

  /** An invalid or out-of-phase command has no effect, including on the random stream. */
  command(command: BattleCommand): BattleSnapshot {
    if (this.phase !== 'command' || (command !== 'attack' && command !== 'guard')) return this.snapshot();
    this.events = [];
    if (command === 'attack') {
      const damage = this.damage(this.encounter.hero.attack, this.encounter.enemy.defense);
      this.enemyHp = Math.max(0, this.enemyHp - damage);
      this.events.push({actor:'hero',kind:'attack',damage});
    } else this.events.push({actor:'hero',kind:'guard',damage:0});
    if (this.enemyHp === 0) this.phase = 'victory';
    else {
      const raw = this.damage(this.encounter.enemy.attack, this.encounter.hero.defense);
      const damage = command === 'guard' ? Math.ceil(raw / 2) : raw;
      this.heroHp = Math.max(0, this.heroHp - damage);
      this.events.push({actor:'enemy',kind:'attack',damage});
      this.phase = this.heroHp === 0 ? 'defeat' : 'result';
    }
    return this.snapshot();
  }

  continue(): BattleSnapshot {
    if (this.phase === 'result') { this.phase = 'command'; this.round += 1; this.events = []; }
    return this.snapshot();
  }

  retry(): BattleSnapshot {
    if (this.phase !== 'defeat') return this.snapshot();
    this.rng = this.encounter.seed >>> 0;
    this.heroHp = this.encounter.hero.hp;
    this.enemyHp = this.encounter.enemy.hp;
    this.phase = 'command'; this.round = 1; this.events = [];
    return this.snapshot();
  }

  private damage(attack: number, defense: number): number {
    // LCG arithmetic is fixed to unsigned 32-bit integers for browser-independent traces.
    this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0;
    const variance = this.rng % 3 - 1;
    return Math.max(1, attack - defense + variance);
  }
}
