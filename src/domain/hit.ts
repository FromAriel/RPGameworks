import { scaleDamage, shieldPercent } from './battle-grid.mjs';

/** How a damage tag affects a fighter (decision 0018). */
export type Affinity = 'weak' | 'resist' | 'immune' | 'absorb';
/** Damage percentages for the scaling affinities. Starting values, tuned by play. */
export const AFFINITY_PERCENT = Object.freeze({ weak: 125, resist: 50 });
/** Damage while broken (decision 0017 §5): ×1.5, so a weakness hit on a broken enemy is ×1.875. Tuned by play. */
export const BREAK_PERCENT = 150;

/**
 * The affinity that applies to a hit with these tags (Ariel, decision 0018): absorb on any tag, else immune on any tag,
 * else weak on any tag, else resist on any tag; otherwise none.
 */
export function affinityOf(affinities: Readonly<Record<string, Affinity>> | undefined, tags: readonly string[]): Affinity | null {
  if (!affinities) return null;
  const levels = new Set(tags.map(tag => affinities[tag]).filter((a): a is Affinity => a !== undefined));
  for (const level of ['absorb', 'immune', 'weak', 'resist'] as const) if (levels.has(level)) return level;
  return null;
}

/**
 * The hit pipeline (decision 0018 §4): a hit's damage runs through an ordered list of registered steps, each a small
 * pure function that may report what it did. Percent steps multiply together and the total rounds up once at the end,
 * minimum 1, exactly as the M5.4 rules did; new rules (affinity, break) join as steps, not as edits to the middle.
 *
 * Randomness stays with the battle: the kernel draws the variance from its seeded stream and passes it in.
 */
export interface HitInput {
  /** The registered formula for the base damage. */
  readonly formula: keyof typeof FORMULAS;
  readonly attack: number; readonly defense: number;
  /** The seeded −1, 0 or +1. */
  readonly variance: number;
  /** The action's power scale. Default 100. */
  readonly powerPercent?: number;
  readonly guarded: boolean;
  /** Living allies ahead of the target in its lane (decision 0014). */
  readonly shields: number;
  /** Area falloff for this target. Default 100. */
  readonly areaPercent?: number;
  /** The target's affinity to this hit's tags (`affinityOf`), if any. */
  readonly affinity?: Affinity | null;
  /** The target is broken (decision 0017): it takes extra damage until its shield comes back. */
  readonly broken?: boolean;
}
/** One step's record of what it did, for playback, previews, the screen reader and tests. */
export interface HitReport { readonly step: string; readonly percent?: number; readonly affinity?: Affinity }
/**
 * The hit's damage and reports. An immune hit does no damage (0, not the usual minimum of 1); an absorbed hit's
 * `damage` is what it heals the target instead, which the battle applies.
 */
export interface HitResult { readonly damage: number; readonly reports: readonly HitReport[]; readonly affinity: Affinity | null }

interface HitState { raw: number; readonly percents: number[]; readonly reports: HitReport[] }
interface HitStep { readonly id: string; apply(state: HitState, input: HitInput): void }

/** Registered base-damage formulas. Content names one; it never supplies an expression. */
export const FORMULAS = Object.freeze({
  'attack-defense': (input: HitInput): number => Math.max(1, input.attack - input.defense + input.variance),
});

const percentStep = (id: string, percent: (input: HitInput) => number): HitStep => ({
  id,
  apply(state, input) {
    const p = percent(input);
    if (p === 100) return;
    state.percents.push(p);
    state.reports.push({ step: id, percent: p });
  },
});

/** The steps, in order. */
export const HIT_STEPS: readonly HitStep[] = Object.freeze([
  { id: 'base', apply(state, input) { state.raw = FORMULAS[input.formula](input); } },
  percentStep('power', input => input.powerPercent ?? 100),
  {
    id: 'affinity',
    apply(state, input) {
      const affinity = input.affinity ?? null;
      if (!affinity) return;
      if (affinity === 'weak' || affinity === 'resist') state.percents.push(AFFINITY_PERCENT[affinity]);
      state.reports.push({ step: 'affinity', affinity, ...(affinity === 'weak' || affinity === 'resist' ? { percent: AFFINITY_PERCENT[affinity] } : {}) });
    },
  },
  percentStep('break', input => (input.broken ? BREAK_PERCENT : 100)),
  percentStep('guard', input => (input.guarded ? 50 : 100)),
  percentStep('shield', input => shieldPercent(input.shields)),
  percentStep('falloff', input => input.areaPercent ?? 100),
]);

export function resolveHit(input: HitInput): HitResult {
  const state: HitState = { raw: 0, percents: [], reports: [] };
  for (const step of HIT_STEPS) step.apply(state, input);
  const affinity = input.affinity ?? null;
  return { damage: affinity === 'immune' ? 0 : scaleDamage(state.raw, state.percents), reports: state.reports, affinity };
}
