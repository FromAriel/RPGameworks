import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTION_WEIGHT, BattleSession, TIMELINE_LENGTH, actionDelay } from '../../src/domain/battle';
import { readEncounters, readItems } from '../../src/content/validation.mjs';
import type { BattleCommand, Encounter } from '../../src/domain/battle';

const catalog = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8')));
const practice = catalog.encounters[0]! as Encounter;
const TONIC = 'demo:item.tonic';
const uses = new Map([[TONIC, { heal: 12 }]]);
const session = (encounter: Encounter = practice) => new BattleSession(encounter, uses);
const fighter = (id: string, speed: number, extra: Partial<Encounter['party'][number]> = {}) =>
  ({ id, name: id, frame: 'sigil', hp: 20, attack: 5, defense: 1, speed, ...extra });

describe('turn timeline', () => {
  it('derives delays from speed and action weight, with lighter actions returning sooner', () => {
    expect(actionDelay(10, ACTION_WEIGHT.attack)).toBe(100);
    expect(actionDelay(14, ACTION_WEIGHT.attack)).toBe(72);
    expect(actionDelay(10, ACTION_WEIGHT.guard)).toBe(60);
    expect(actionDelay(10, ACTION_WEIGHT.item)).toBe(80);
    expect(actionDelay(3, 100)).toBe(334); // Always rounds up to whole ticks.
  });

  it('orders by tick, then party before enemies, then slot, and lets a faster enemy open', () => {
    const tied: Encounter = { ...practice, party: [fighter('hero', 10)], enemies: [fighter('b', 10), fighter('a', 10)] };
    expect(session(tied).snapshot().timeline.slice(0, 3).map(turn => turn.actor)).toEqual(['hero', 'b', 'a']);
    const opening = session().snapshot();
    expect(opening.events).toEqual([{ kind: 'attack', actor: 'shard', target: 'hero', damage: 1, guarded: false, defeated: false, shields: 0 }]);
    expect(opening).toMatchObject({ phase: 'command', active: 'hero', turn: 1 });
    expect(opening.timeline).toHaveLength(TIMELINE_LENGTH);
    expect(opening.timeline.map(turn => `${turn.actor}@${turn.tick}`)).toEqual(
      ['hero@100', 'sigil@125', 'shard@144', 'hero@200', 'shard@216', 'sigil@250', 'shard@288', 'hero@300']);
  });

  it('pins the seeded demo trace through victory without changing a caller-owned encounter', () => {
    const original = structuredClone(practice);
    const battle = session();
    const steps: BattleCommand[] = [
      { type: 'attack', target: 'shard' }, { type: 'attack', target: 'shard' }, { type: 'guard' },
      { type: 'attack', target: 'sigil' }, { type: 'attack', target: 'sigil' }, { type: 'attack', target: 'sigil' }, { type: 'attack', target: 'sigil' },
    ];
    const trace = steps.map(step => {
      const state = battle.command(step);
      return [state.phase, ...state.combatants.map(c => c.hp), state.events.map(e => e.kind === 'attack' ? `${e.actor}>${e.target}:${e.damage}` : `${e.actor}:${e.kind}`).join(' ')];
    });
    expect(trace).toEqual([
      ['command', 25, 20, 4, 'hero>shard:6 sigil>hero:2 shard>hero:2'],
      ['command', 22, 20, 0, 'hero>shard:8 sigil>hero:3'],
      ['command', 22, 20, 0, 'hero:guard'],
      ['command', 20, 13, 0, 'hero>sigil:7 sigil>hero:2'],
      ['command', 17, 6, 0, 'hero>sigil:7 sigil>hero:3'],
      ['command', 15, 1, 0, 'hero>sigil:5 sigil>hero:2'],
      ['victory', 15, 0, 0, 'hero>sigil:7'],
    ]);
    expect(battle.snapshot()).toMatchObject({ phase: 'victory', active: null, timeline: [] });
    expect(practice).toEqual(original);
  });

  it('executes exactly the previewed order until the next decision, minus defeated combatants', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const encounter: Encounter = {
        ...practice, seed,
        party: [fighter('hero', 5 + (seed % 9), { hp: 60, attack: 4 + (seed % 5) })],
        enemies: [fighter('e1', 3 + (seed % 11)), fighter('e2', 6 + (seed % 7), { hp: 8 }), fighter('e3', 9 + (seed % 4), { hp: 12 })],
      };
      const battle = session(encounter);
      for (let decision = 0; decision < 12 && battle.snapshot().phase === 'command'; decision += 1) {
        const before = battle.snapshot();
        const targets = before.combatants.filter(c => c.side === 'enemy' && c.hp > 0);
        const command: BattleCommand = decision % 3 === 2 ? { type: 'guard' } : { type: 'attack', target: targets[decision % targets.length]!.id };
        const preview = battle.preview(command, 64);
        const after = battle.command(command);
        const nextHero = preview.findIndex((turn, index) => index > 0 && turn.actor === 'hero');
        expect(nextHero).toBeGreaterThan(0);
        const defeated = new Set(after.combatants.filter(c => c.hp === 0).map(c => c.id));
        const expected = preview.slice(0, nextHero).map(turn => turn.actor).filter((actor, index) => index === 0 || !defeated.has(actor));
        const executed = after.events.map(event => event.actor);
        if (after.phase === 'command') {
          expect(executed).toEqual(expected);
          expect(after.active).toBe('hero');
          expect(after.combatants.find(c => c.id === 'hero')!.nextTick).toBe(preview[nextHero]!.tick);
        } else expect(expected.slice(0, executed.length)).toEqual(executed);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('previews a lighter Guard as an earlier next hero turn without consuming randomness', () => {
    const battle = session();
    const attack = battle.preview({ type: 'attack', target: 'sigil' });
    const guard = battle.preview({ type: 'guard' });
    expect(attack[0]).toEqual(guard[0]);
    expect(guard.slice(1).find(turn => turn.actor === 'hero')!.tick).toBeLessThan(attack.slice(1).find(turn => turn.actor === 'hero')!.tick);
    expect(battle.command({ type: 'attack', target: 'shard' })).toEqual(session().command({ type: 'attack', target: 'shard' }));
  });
});

describe('commands', () => {
  it('rejects invalid commands with a reason and without changing state or the random stream', () => {
    const battle = session();
    const opening = battle.snapshot();
    const invalid: [BattleCommand, string][] = [
      [{ type: 'attack', target: 'hero' }, 'invalid-target'],
      [{ type: 'attack', target: 'nobody' }, 'invalid-target'],
      [{ type: 'item', itemId: 'demo:item.lens', target: 'hero' }, 'not-usable'],
      [{ type: 'item', itemId: TONIC, target: 'sigil' }, 'invalid-target'],
      [{ type: 'teleport' } as unknown as BattleCommand, 'unknown-command'],
    ];
    for (const [command, reason] of invalid) {
      expect(battle.validate(command)).toBe(reason);
      expect(battle.command(command)).toEqual(opening);
    }
    const fresh = session(), healthy = new BattleSession({ ...practice, enemies: [fighter('slow', 1)] }, uses);
    expect(healthy.validate({ type: 'item', itemId: TONIC, target: 'hero' })).toBe('full-hp');
    expect(battle.command({ type: 'attack', target: 'shard' })).toEqual(fresh.command({ type: 'attack', target: 'shard' }));
    battle.command({ type: 'attack', target: 'shard' });
    expect(battle.validate({ type: 'attack', target: 'shard' })).toBe('invalid-target'); // Defeated.
  });

  it('Guard halves every hit, rounding up, until the hero acts again', () => {
    // Raw damage is 9 ± 1 against defense 0, so an unguarded hit is 8–10 and a guarded one ceil(raw / 2) = 4–5.
    const slowHero: Encounter = { ...practice, party: [fighter('hero', 2, { hp: 99, defense: 0 })], enemies: [fighter('brute', 10, { attack: 9 })] };
    const guarded = session(slowHero);
    const halved = guarded.command({ type: 'guard' }).events.filter(e => e.kind === 'attack' && e.actor === 'brute');
    expect(halved.length).toBeGreaterThan(1);
    for (const event of halved) expect(event).toMatchObject({ guarded: true, damage: expect.toSatisfy((d: number) => d === 4 || d === 5) });
    const next = guarded.command({ type: 'attack', target: 'brute' }).events.find(e => e.kind === 'attack' && e.actor === 'brute');
    expect(next).toMatchObject({ guarded: false });
  });

  it('a battle item heals one ally up to full and reports the amount', () => {
    const battle = session();
    battle.command({ type: 'attack', target: 'shard' });
    const hurt = battle.snapshot().combatants.find(c => c.id === 'hero')!;
    const healed = battle.command({ type: 'item', itemId: TONIC, target: 'hero' });
    expect(healed.events[0]).toEqual({ kind: 'heal', actor: 'hero', target: 'hero', itemId: TONIC, amount: Math.min(12, hurt.maxHp - hurt.hp) });
    expect(healed.combatants.find(c => c.id === 'hero')!.hp).toBeLessThanOrEqual(hurt.maxHp);
  });

  it('Escape always ends an ordinary battle and nothing resolves afterwards', () => {
    const battle = session();
    const escaped = battle.command({ type: 'escape' });
    expect(escaped).toMatchObject({ phase: 'escaped', active: null, timeline: [], events: [{ kind: 'escape', actor: 'hero' }] });
    expect(battle.validate({ type: 'guard' })).toBe('phase');
    expect(battle.command({ type: 'attack', target: 'sigil' })).toEqual(escaped);
    expect(battle.retry()).toEqual(escaped); // Retry belongs to defeat only.
  });

  it('defeat offers a retry with the identical opening, including the seeded stream', () => {
    const deadly: Encounter = { ...practice, enemies: practice.enemies.map(enemy => ({ ...enemy, attack: 40 })) };
    const battle = session(deadly);
    const opening = battle.snapshot();
    let state = opening;
    for (let guard = 0; guard < 10 && state.phase === 'command'; guard += 1) state = battle.command({ type: 'guard' });
    expect(state.phase).toBe('defeat');
    expect(state.timeline).toEqual([]);
    expect(battle.retry()).toEqual(opening);
  });
});

describe('authored encounter validation', () => {
  it('accepts the demo catalog and rejects duplicates, empty names, unknown frames and the old format', () => {
    expect(catalog.encounters).toHaveLength(1);
    const valid = { schemaVersion: 2, encounters: [practice] };
    expect(readEncounters(valid, 'encounters.json', ['hero-left', 'sigil', 'sigil-lit']).encounters).toHaveLength(1);
    expect(() => readEncounters({ schemaVersion: 2, encounters: [practice, practice] })).toThrow(/Duplicate encounter ID/);
    expect(() => readEncounters({ schemaVersion: 2, encounters: [{ ...practice, enemies: [...practice.enemies, { ...practice.enemies[0]! }] }] })).toThrow(/Duplicate combatant ID/);
    expect(() => readEncounters({ schemaVersion: 2, encounters: [{ ...practice, party: [{ ...practice.party[0]!, name: '   ' }] }] })).toThrow(/visible text/);
    expect(() => readEncounters(valid, 'encounters.json', ['sigil'])).toThrow(/Unknown battler frame/);
    expect(() => readEncounters({ ...valid, encounters: [{ ...practice, enemies: [] }] })).toThrow(/encounters.json/);
    expect(() => readEncounters({ ...valid, encounters: [{ ...practice, party: [{ ...practice.party[0]!, speed: 0 }] }] })).toThrow(/encounters.json/);
    expect(() => readEncounters({ schemaVersion: 1, encounters: [{ id: practice.id, name: 'Old', seed: 1, hero: {}, enemy: {} }] })).toThrow(/encounters.json/);
  });

  it('the demo tonic declares a bounded healing battle use', () => {
    const items = readItems(JSON.parse(readFileSync('content/games/demo/items.json', 'utf8')));
    expect(items.items.find(item => item.id === TONIC)).toMatchObject({ maxStack: 9, battleUse: { type: 'heal', amount: 12 } });
    const bad = structuredClone(items) as unknown as { items: { battleUse?: unknown }[] };
    bad.items.at(-1)!.battleUse = { type: 'heal', amount: 0 };
    expect(() => readItems(bad)).toThrow();
  });
});
