import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readEncounters, readParty } from '../../src/content/validation.mjs';
import { BattleSession } from '../../src/domain/battle';
import type { BattleEvent, Encounter } from '../../src/domain/battle';
import { scaleDamage } from '../../src/domain/battle-grid.mjs';
import { battleEncounter, defaultParty } from '../../src/domain/party';
import { areaPercentAt, hpBefore } from '../../src/presentation/battle/playback';

/** Decision 0014 M5.4f: enemy area attacks from a repeating action pattern, resolved on the party grid. */
type Area = Extract<BattleEvent, { kind: 'area' }>;
const member = (id: string, lane: number, depth: number, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, frame: 'hero-left', cell: { lane, depth }, hp: 40, attack: 5, defense: 1, speed: 5, ...extra });
const caster = (pattern: string[], shape: string, extra: Record<string, unknown> = {}) => ({
  // Speed 6 against the party's 5: the caster acts once before the party's first turn, then about once per round.
  id: 'caster', name: 'Caster', frame: 'sigil', hp: 200, attack: 9, defense: 0, speed: 6,
  abilities: [{ id: 'burst', name: 'Burst', shape, reach: 'ranged' }], pattern, ...extra,
});
/** The party in an L: two in the middle lane, one above the front, one at the back of the bottom lane. */
const party = [member('a', 2, 1), member('b', 2, 2), member('c', 1, 1), member('d', 3, 3)];
const fight = (enemy: Record<string, unknown>, members = party) => new BattleSession(readEncounters({ schemaVersion: 2, encounters: [
  { id: 'test:encounter.area', name: 'Area', seed: 99, party: members, enemies: [enemy] }] }).encounters[0] as Encounter);
const areas = (events: readonly BattleEvent[]) => events.filter((e): e is Area => e.kind === 'area');

describe('enemy area attacks', () => {
  it('a radius burst hits the whole party, falling off by steps, with shields multiplied in', () => {
    const opening = fight(caster(['burst'], 'radius')).snapshot();
    const [burst] = areas(opening.events);
    // The usual target: front-facing first, then the lowest lane: c (top lane, front).
    expect(burst!.centre).toEqual({ lane: 0, depth: 0 });
    expect(burst!.hits.map(h => [h.target, h.percent, h.shields])).toEqual([['a', 80, 0], ['b', 65, 1], ['c', 100, 0], ['d', 34, 0]]);
    // Each hit: raw = 9 - 1 ± 1, then shield and falloff, rounded up once.
    for (const hit of burst!.hits) {
      const possible = [7, 8, 9].map(raw => scaleDamage(raw, [100, hit.shields ? 80 : 100, hit.percent]));
      expect(possible).toContain(hit.damage);
    }
    expect(opening.combatants.find(c => c.id === 'b')!.hp).toBe(40 - burst!.hits[1]!.damage);
  });

  it('a lane attack hits only its target\'s lane, at full strength', () => {
    const [sweep] = areas(fight(caster(['burst'], 'lane')).snapshot().events);
    expect(sweep!.hits.map(h => [h.target, h.percent])).toEqual([['c', 100]]);
    const middle = fight(caster(['burst'], 'lane'), [member('a', 2, 1), member('b', 2, 2)]).snapshot();
    expect(areas(middle.events)[0]!.hits.map(h => [h.target, h.percent, h.shields])).toEqual([['a', 100, 0], ['b', 100, 1]]);
  });

  it('follows its pattern in order, repeating, and Retry starts the pattern again', () => {
    const battle = fight(caster(['attack', 'burst', 'burst'], 'radius', { attack: 16 }));
    const kinds: string[] = [];
    let state = battle.snapshot();
    for (let i = 0; i < 80 && state.phase === 'command'; i++) {
      kinds.push(...state.events.filter(e => e.actor === 'caster').map(e => e.kind));
      state = battle.command({ type: 'guard' });
    }
    kinds.push(...state.events.filter(e => e.actor === 'caster').map(e => e.kind));
    expect(kinds.slice(0, 6)).toEqual(['attack', 'area', 'area', 'attack', 'area', 'area']);
    expect(state.phase).toBe('defeat');
    const first = fight(caster(['attack', 'burst', 'burst'], 'radius', { attack: 16 })).snapshot();
    expect(battle.retry()).toEqual(first); // Same opening, same pattern position, same random stream.
  });

  it('guard halves an area hit, and the hits land together: one defeated member does not shield another', () => {
    // b (speed 30) always guards and acts first; the caster bursts before a (speed 5) ever acts, so a is still standing.
    const battle = fight(caster(['burst'], 'radius', { speed: 9, attack: 30 }), [member('a', 2, 1, { hp: 5 }), member('b', 2, 2, { speed: 30 })]);
    let state = battle.snapshot();
    while (state.phase === 'command' && !areas(state.events).length) state = battle.command({ type: 'guard' });
    const [burst] = areas(state.events);
    const b = burst!.hits.find(h => h.target === 'b')!;
    expect(b.guarded).toBe(true);
    expect(b.shields).toBe(1); // a was still standing when the burst was worked out.
    expect(burst!.hits.find(h => h.target === 'a')!.defeated).toBe(true);
    expect([28, 29, 30].map(raw => scaleDamage(raw, [50, 80, 80]))).toContain(b.damage);
  });

  it('the playback can rebuild HP from area events, and lights the same cells the rules hit', () => {
    const opening = fight(caster(['burst'], 'radius')).snapshot();
    expect(hpBefore(opening, opening.events).get('a')).toBe(40);
    const [burst] = areas(opening.events);
    const cells = { a: { lane: 1, depth: 0 }, b: { lane: 1, depth: 1 }, c: { lane: 0, depth: 0 }, d: { lane: 2, depth: 2 } } as const;
    for (const hit of burst!.hits) expect(areaPercentAt('radius', burst!.centre, cells[hit.target as keyof typeof cells])).toBe(hit.percent);
    expect(areaPercentAt('lane', { lane: 1, depth: 0 }, { lane: 1, depth: 2 })).toBe(100);
    expect(areaPercentAt('lane', { lane: 1, depth: 0 }, { lane: 0, depth: 0 })).toBe(0);
    expect(areaPercentAt('diagonal-down', { lane: 0, depth: 0 }, { lane: 2, depth: 2 })).toBe(100);
  });

  it('content mistakes are reported with their place', () => {
    const read = (enemy: Record<string, unknown>, members: unknown[] = [member('a', 1, 1)]) => {
      try { readEncounters({ schemaVersion: 2, encounters: [{ id: 'test:encounter.x', name: 'X', seed: 1, party: members, enemies: [enemy] }] }); return []; }
      catch (error) { return ((error as { issues?: { path: string; message: string }[] }).issues ?? [{ path: '', message: String(error) }]).map(i => `${i.path}: ${i.message}`); }
    };
    expect(read(caster(['burst', 'nova'], 'radius'))).toEqual(['/encounters/0/enemies/0/pattern/1: Unknown action: use "attack" or one of this enemy\'s abilities']);
    expect(read({ ...caster(['attack'], 'radius'), abilities: [{ id: 'attack', name: 'Hit', shape: 'lane' }] })).toEqual(['/encounters/0/enemies/0/abilities/0/id: "attack" is the ordinary attack; give the ability another ID']);
    expect(read({ ...caster(['burst'], 'radius'), abilities: [{ id: 'burst', name: 'A', shape: 'lane' }, { id: 'burst', name: 'B', shape: 'lane' }] })).toEqual(['/encounters/0/enemies/0/abilities/1/id: Duplicate ability ID']);
    expect(read(caster(['burst'], 'radius'), [member('a', 1, 1, { pattern: ['attack'] })])).toEqual(['/encounters/0/party/0/pattern: Only enemies have abilities and an action pattern for now']);
    expect(read(caster(['burst'], 'cone'))[0]).toContain('/encounters/0/enemies/0/abilities/0/shape');
  });
});

describe('the Formation Drill', () => {
  const roster = readParty(JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')));
  const drill = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8'))).encounters.find(e => e.id === 'demo:encounter.formation-drill')!;
  it('pins the Clay Golem\'s Shard Burst and the Ogre\'s Sweep for the same choices', () => {
    const battle = new BattleSession(battleEncounter(drill, roster, defaultParty(roster)));
    let state = battle.snapshot();
    const seen: string[] = [];
    for (let i = 0; i < 40 && state.phase === 'command'; i++) {
      const target = ['bat', 'golem', 'ogre'].find(id => state.combatants.find(c => c.id === id)!.hp > 0 && battle.validate({ type: 'attack', target: id }) === null)!;
      state = battle.command({ type: 'attack', target });
      for (const e of areas(state.events)) seen.push(`${state.turn} ${e.name} @${e.centre.lane},${e.centre.depth}: ${e.hits.map(h => `${h.target} ${h.damage} ${h.percent}% s${h.shields}`).join(', ')}`);
    }
    expect(seen).toEqual([
      '12 Shard Burst @1,0: hero 3 100% s0, archer 3 80% s1, lancer 4 80% s0, mage 2 50% s1',
      '24 Ogre Sweep @1,0: hero 6 100% s0, archer 6 100% s1',
    ]);
    expect(state).toMatchObject({ phase: 'victory', turn: 31 });
  });
});
