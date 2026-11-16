import { scaleDamage, shieldPercent } from './battle-grid.mjs';

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
}
/** One step's record of what it did, for playback, previews, the screen reader and tests. */
export interface HitReport { readonly step: string; readonly percent?: number }
export interface HitResult { readonly damage: number; readonly reports: readonly HitReport[] }

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
  percentStep('guard', input => (input.guarded ? 50 : 100)),
  percentStep('shield', input => shieldPercent(input.shields)),
  percentStep('falloff', input => input.areaPercent ?? 100),
]);

export function resolveHit(input: HitInput): HitResult {
  const state: HitState = { raw: 0, percents: [], reports: [] };
  for (const step of HIT_STEPS) step.apply(state, input);
  return { damage: scaleDamage(state.raw, state.percents), reports: state.reports };
}
