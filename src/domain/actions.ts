import type { ActionCatalog } from '../content/generated/actions';

/**
 * Battle actions (decision 0018): everything a fighter does that hits or helps is an action, resolved by one engine.
 * A game's own actions (enemy abilities now, skills from M5.5b) come from its action catalog; Attack, Guard and Item
 * are built into the engine below and resolved the same way. Move and Run stay commands. No Phaser, DOM or storage.
 */
export type AreaShape = 'radius' | 'lane' | 'column' | 'diagonal-down' | 'diagonal-up';
export type ActionEffect = 'damage' | 'heal' | 'guard';
export interface BattleAction {
  readonly id: string;
  readonly name: string;
  /** enemy: one opponent; ally: one fighter on the user's side; self: the user; area: a shape centred on an opponent. */
  readonly targeting: 'enemy' | 'ally' | 'self' | 'area';
  readonly shape?: AreaShape;
  /** Which opponents it can be aimed at; the user's own reach when absent. */
  readonly reach?: 'melee' | 'reach' | 'ranged';
  /** Timeline weight: lighter actions come around sooner. */
  readonly weight: number;
  readonly power?: { readonly formula: 'attack-defense'; readonly percent?: number };
  readonly effects: readonly ActionEffect[];
  /** The damage tags of its hits; a basic Attack takes its user's weapon's instead. */
  readonly tags?: readonly string[];
  /** Spent when it resolves (decision 0017). */
  readonly cost?: { readonly mp: number };
  /** Counts this many fewer allies shielding the target. */
  readonly ignoreShields?: number;
}
export type CatalogAction = ActionCatalog['actions'][number];

/** The engine's own actions: the commands every game has. Their weights are the timeline's (M5.3a, M5.4c). */
export const CORE_ACTIONS: { readonly attack: BattleAction; readonly guard: BattleAction; readonly item: BattleAction } = Object.freeze({
  attack: { id: 'core:action.attack', name: 'Attack', targeting: 'enemy', weight: 100, power: { formula: 'attack-defense' }, effects: ['damage'] },
  guard: { id: 'core:action.guard', name: 'Guard', targeting: 'self', weight: 60, effects: ['guard'] },
  item: { id: 'core:action.item', name: 'Item', targeting: 'ally', weight: 80, effects: ['heal'] },
});

/** A catalog's actions by ID, with the defaults filled in. */
export function actionMap(catalog: ActionCatalog | null | undefined): ReadonlyMap<string, BattleAction> {
  return new Map((catalog?.actions ?? []).map(a => [a.id, Object.freeze({ ...a, weight: a.weight ?? 100 }) as BattleAction]));
}
