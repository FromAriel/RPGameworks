import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../src/domain/battle';
import { readEncounters } from '../../src/content/validation.mjs';
import type { Encounter } from '../../src/domain/battle';

const practice: Encounter = {
  id: 'demo:encounter.practice', name: 'Practice Sigil', seed: 1776,
  hero: { name: 'Hero', hp: 24, attack: 6, defense: 2 },
  enemy: { name: 'Sigil', hp: 18, attack: 4, defense: 1 },
};

describe('pure battle session', () => {
  it('pins the seeded attack trace and victory without changing a caller-owned encounter', () => {
    const original = structuredClone(practice);
    const battle = new BattleSession(practice);
    const rounds = [];
    while (battle.snapshot().phase === 'command') {
      rounds.push(battle.command('attack'));
      if (battle.snapshot().phase === 'result') battle.continue();
    }
    expect(rounds.map(round => [round.heroHp, round.enemyHp, round.phase])).toEqual([
      [23, 13, 'result'], [20, 9, 'result'], [18, 3, 'result'], [18, 0, 'victory'],
    ]);
    expect(practice).toEqual(original);
  });

  it('guard consumes a turn, rounds damage up, and retry restores the exact seed', () => {
    const battle = new BattleSession(practice);
    const first = battle.command('guard');
    expect(first.events).toEqual([{ actor:'hero', kind:'guard', damage:0 }, { actor:'enemy', kind:'attack', damage:1 }]);
    expect(battle.command('attack')).toEqual(first);
    battle.continue();
    const second = battle.command('guard');
    expect(second.round).toBe(2);
    while (battle.snapshot().phase !== 'defeat') {
      battle.continue();
      battle.command('guard');
    }
    expect(battle.retry()).toMatchObject({ phase:'command', round:1, heroHp:24, enemyHp:18 });
    expect(battle.command('guard')).toEqual(first);
  });

  it('rejects invalid commands without consuming random choices', () => {
    const battle = new BattleSession(practice);
    expect(battle.command('item' as 'attack')).toEqual(battle.snapshot());
    expect(battle.command('attack')).toEqual(new BattleSession(practice).command('attack'));
  });
});

describe('authored encounter validation', () => {
  it('accepts the catalog and rejects duplicate IDs and invalid bounds', () => {
    expect(readEncounters({schemaVersion:1, encounters:[practice]}).encounters).toHaveLength(1);
    expect(() => readEncounters({schemaVersion:1, encounters:[practice,practice]})).toThrow(/Duplicate encounter ID/);
    expect(() => readEncounters({schemaVersion:1, encounters:[{...practice,enemy:{...practice.enemy,hp:0}}]})).toThrow(/encounters.json/);
  });
});
