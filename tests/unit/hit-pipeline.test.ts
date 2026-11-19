import { describe, expect, it } from 'vitest';
import { readEncounters } from '../../src/content/validation.mjs';
import { ACTION_WEIGHT, BattleSession } from '../../src/domain/battle';
import type { Encounter } from '../../src/domain/battle';
import { CORE_ACTIONS, actionMap } from '../../src/domain/actions';
import { scaleDamage } from '../../src/domain/battle-grid.mjs';
import { HIT_STEPS, resolveHit } from '../../src/domain/hit';

/** Decision 0018 M5.5a: the hit pipeline and the action model, with no change to the rules they replaced. */
describe('the hit pipeline', () => {
  it('gives exactly the M5.4 damage for every combination of guard, shields and area falloff', () => {
    for (let attack = 1; attack <= 24; attack++) for (const defense of [0, 2, 5]) for (const variance of [-1, 0, 1])
      for (const guarded of [false, true]) for (const shields of [0, 1, 2]) for (const area of [100, 80, 65, 50, 34]) {
        const old = scaleDamage(Math.max(1, attack - defense + variance), [guarded ? 50 : 100, [100, 80, 65][shields]!, area]);
        expect(resolveHit({ formula: 'attack-defense', attack, defense, variance, guarded, shields, areaPercent: area }).damage).toBe(old);
      }
  });

  it('runs its steps in order and reports each one that changed the hit', () => {
    expect(HIT_STEPS.map(step => step.id)).toEqual(['base', 'power', 'affinity', 'break', 'guard', 'shield', 'falloff']);
    expect(resolveHit({ formula: 'attack-defense', attack: 9, defense: 1, variance: 0, guarded: false, shields: 0 })).toEqual({ damage: 8, reports: [], affinity: null });
    const hit = resolveHit({ formula: 'attack-defense', attack: 9, defense: 1, variance: 1, powerPercent: 150, guarded: true, shields: 2, areaPercent: 80 });
    expect(hit.reports).toEqual([{ step: 'power', percent: 150 }, { step: 'guard', percent: 50 }, { step: 'shield', percent: 65 }, { step: 'falloff', percent: 80 }]);
    expect(hit.damage).toBe(scaleDamage(9, [150, 50, 65, 80])); // Rounded up once, at the end.
    expect(resolveHit({ formula: 'attack-defense', attack: 1, defense: 9, variance: -1, guarded: true, shields: 2, areaPercent: 34 }).damage).toBe(1); // At least 1.
  });
});

describe('actions', () => {
  it('Attack, Guard and Item are built-in actions with the timeline weights they always had', () => {
    expect([CORE_ACTIONS.attack.weight, CORE_ACTIONS.guard.weight, CORE_ACTIONS.item.weight]).toEqual([100, 60, 80]);
    expect(ACTION_WEIGHT).toEqual({ attack: 100, guard: 60, item: 80, move: 60 });
    expect(CORE_ACTIONS.attack).toMatchObject({ targeting: 'enemy', power: { formula: 'attack-defense' }, effects: ['damage'] });
  });

  it('a catalog action defaults to weight 100, and a battle refuses a pattern naming an action it was not given', () => {
    const catalog = actionMap({ schemaVersion: 1, actions: [{ id: 'test:action.zap', name: 'Zap', targeting: 'area', shape: 'lane', power: { formula: 'attack-defense' }, effects: ['damage'] }] });
    expect(catalog.get('test:action.zap')!.weight).toBe(100);
    const encounter = readEncounters({ schemaVersion: 3, encounters: [{ id: 'test:encounter.zap', name: 'Zap', seed: 1,
      party: [{ id: 'a', name: 'A', frame: 'hero-left', hp: 10, attack: 3, defense: 0, speed: 5 }],
      enemies: [{ id: 'z', name: 'Z', frame: 'sigil', hp: 10, attack: 3, defense: 0, speed: 4, pattern: ['attack', 'test:action.zap'] }] }] }).encounters[0] as Encounter;
    expect(() => new BattleSession(encounter)).toThrow('z uses unknown action test:action.zap');
    expect(() => new BattleSession(encounter, new Map(), catalog)).not.toThrow();
  });
});
