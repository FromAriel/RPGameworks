import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readActions, readEncounters } from '../../src/content/validation.mjs';
import { BREAK, BattleSession, MOMENTUM, ROUND_TICKS, actionDelay } from '../../src/domain/battle';
import type { BattleEvent, BattleSnapshot, Encounter } from '../../src/domain/battle';
import { actionMap } from '../../src/domain/actions';
import { BREAK_PERCENT, resolveHit } from '../../src/domain/hit';
import { scaleDamage } from '../../src/domain/battle-grid.mjs';

/** Decision 0017, M5.5c-1: shields, break, recovery, phases, momentum, rounds and MP recovery. */
const catalog = readActions(JSON.parse(readFileSync('content/games/demo/actions.json', 'utf8')));
const actions = actionMap(catalog);
const tags = new Set(Object.values(catalog.tagGroups ?? {}).flat()), actionIds = new Set(actions.keys());
const PIERCE = 'demo:action.pierce';
const member = (id: string, lane: number, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, frame: 'hero-left', cell: { lane, depth: 1 }, hp: 100, attack: 10, defense: 0, speed: 20, weapon: { name: 'Spear', tags: ['pierce'] }, ...extra });
const foe = (extra: Record<string, unknown> = {}) =>
  ({ id: 'e', name: 'Foe', frame: 'sigil', cell: { lane: 1, depth: 1 }, hp: 200, attack: 1, defense: 0, speed: 10, affinities: { pierce: 'weak' }, ...extra });
const fight = (party: unknown[], enemies: unknown[]) => new BattleSession(readEncounters({ schemaVersion: 3, encounters: [
  { id: 'test:encounter.break', name: 'Break', seed: 5, party, enemies }] }, 'encounters.json', undefined, undefined, null, actionIds, tags).encounters[0] as Encounter, new Map(), actions);
const foeOf = (s: BattleSnapshot) => s.combatants.find(c => c.id === 'e')!;
const kinds = (s: BattleSnapshot) => s.events.map(e => e.kind);
const attack = (b: BattleSession) => b.command({ type: 'attack', target: 'e' });
type Hit = Extract<BattleEvent, { kind: 'attack' }>;
const partyHit = (s: BattleSnapshot) => s.events.find((e): e is Hit => e.kind === 'attack' && e.actor === 'a')!;

describe('shields and break', () => {
  it('each weakness hit removes a shield point and reveals the tag; at zero the enemy breaks and is pushed back', () => {
    const b = fight([member('a', 1)], [foe({ shield: 2 })]);
    expect(foeOf(b.snapshot())).toMatchObject({ shield: 2, maxShield: 2, broken: false, revealed: [] });
    let s = attack(b);
    expect(partyHit(s)).toMatchObject({ affinity: 'weak', shieldLeft: 1 });
    expect(foeOf(s)).toMatchObject({ shield: 1, revealed: ['pierce'] });
    expect(s.momentum).toBe(MOMENTUM.weak);
    const before = foeOf(s).nextTick;
    s = attack(b);
    expect(kinds(s)).toEqual(['attack', 'break']);
    expect(s.events[1]).toEqual({ kind: 'break', actor: 'e', by: 'a' });
    expect(foeOf(s)).toMatchObject({ shield: 0, broken: true, stunned: true, nextTick: before + actionDelay(10, BREAK.pushBackWeight) });
    expect(s.momentum).toBe(2 * MOMENTUM.weak + MOMENTUM.break);
  });

  it('a broken enemy takes ×1.5, loses its next turn, and on the turn after gets its full shield back and acts', () => {
    const b = fight([member('a', 1)], [foe({ shield: 1 })]);
    let s = attack(b);
    expect(kinds(s)).toEqual(['attack', 'break']);
    s = attack(b); // While broken: the break step multiplies in; the shield cannot go lower.
    expect(partyHit(s).reports).toContainEqual({ step: 'break', percent: BREAK_PERCENT });
    expect(partyHit(s).shieldLeft).toBeUndefined();
    const seen: string[] = [];
    for (let i = 0; i < 6 && !seen.includes('recover'); i++) { s = attack(b); seen.push(...kinds(s)); }
    // The stunned turn comes first, then recovery on its second turn, followed by its ordinary action.
    expect(seen.filter(k => k === 'stunned' || k === 'recover')).toEqual(['stunned', 'recover']);
    const recovered = s.events.findIndex(e => e.kind === 'recover');
    expect(s.events[recovered]).toEqual({ kind: 'recover', actor: 'e', shield: 1 });
    expect(s.events[recovered + 1]).toMatchObject({ kind: 'attack', actor: 'e', target: 'a' });
    expect(foeOf(s)).toMatchObject({ shield: 1, broken: false, stunned: false });
  });

  it('only a weakness touches the shield: resist, immune, absorb and untyped hits never do, and an enemy without a shield never breaks', () => {
    for (const affinity of ['resist', 'immune', 'absorb'] as const) {
      const b = fight([member('a', 1)], [foe({ shield: 1, affinities: { pierce: affinity } })]);
      const s = attack(b);
      expect(partyHit(s).shieldLeft).toBeUndefined();
      expect(foeOf(s)).toMatchObject({ shield: 1, broken: false, revealed: [] });
      expect(s.momentum).toBe(0);
    }
    const b = fight([member('a', 1)], [foe()]);
    const s = attack(b);
    expect(kinds(s)).not.toContain('break');
    expect(foeOf(s)).toMatchObject({ shield: 0, broken: false, revealed: ['pierce'] }); // Still weak, so still revealed.
  });

  it('a weakness hit on a broken enemy multiplies once: ×1.25 × 1.5, rounded up at the end', () => {
    const hit = resolveHit({ formula: 'attack-defense', attack: 10, defense: 0, variance: 0, guarded: false, shields: 0, affinity: 'weak', broken: true });
    expect(hit.damage).toBe(scaleDamage(10, [125, 150]));
    expect(hit.reports.map(r => r.step)).toEqual(['affinity', 'break']);
  });
});

describe('phases', () => {
  it('falling to a threshold starts the phase: new affinities, a full new shield, and no shield damage from that hit', () => {
    const b = fight([member('a', 1)], [foe({ hp: 40, shield: 2, phases: [{ below: 50, affinities: { fire: 'weak', pierce: 'resist' }, shield: 3 }] })]);
    let s = attack(b);
    expect(foeOf(s)).toMatchObject({ phase: 0, shield: 1 });
    s = attack(b); // 40 → about 14 HP: at or below half.
    expect(kinds(s).slice(0, 2)).toEqual(['attack', 'phase']);
    expect(s.events[1]).toEqual({ kind: 'phase', actor: 'e', phase: 1, shield: 3 });
    expect(partyHit(s).shieldLeft).toBeUndefined();
    expect(foeOf(s)).toMatchObject({ phase: 1, shield: 3, maxShield: 3, affinities: { fire: 'weak', pierce: 'resist' }, revealed: ['pierce'] });
    s = attack(b);
    expect(partyHit(s).affinity).toBe('resist'); // The new phase's affinities apply.
  });

  it('a phase ends a break in progress', () => {
    const b = fight([member('a', 1)], [foe({ hp: 40, shield: 1, phases: [{ below: 50 }] })]);
    let s = attack(b);
    expect(foeOf(s).broken).toBe(true);
    s = attack(b);
    expect(kinds(s)).toContain('phase');
    expect(foeOf(s)).toMatchObject({ phase: 1, broken: false, stunned: false, shield: 1 }); // Shield unchanged by the phase, so refilled.
  });
});

describe('momentum, rounds and MP', () => {
  it('Guard adds momentum, a fallen member takes it away, and the gauge stays between empty and five pips', () => {
    const b = fight([member('a', 1), member('b', 2)], [foe()]);
    b.command({ type: 'guard' });
    expect(b.snapshot().momentum).toBe(MOMENTUM.guard);
    // Many weakness hits fill it to the top and no further.
    const full = fight([member('a', 1, { speed: 99 })], [foe({ hp: 999, shield: 1, speed: 1 })]);
    let s = full.snapshot();
    for (let i = 0; i < 40; i++) s = attack(full);
    expect(s.momentum).toBe(MOMENTUM.pips * MOMENTUM.pip);
    // A fallen member costs momentum; it never goes below empty.
    const lost = fight([member('a', 1, { hp: 1, speed: 1 }), member('b', 2, { speed: 30 })], [foe({ attack: 50, speed: 40, affinities: {} })]);
    expect(lost.snapshot().combatants.find(c => c.id === 'a')!.hp).toBe(0);
    expect(lost.snapshot().momentum).toBe(0);
    // With momentum built up by guarding, the fall costs exactly MOMENTUM.fallen.
    const fall = fight([member('a', 1, { hp: 1, speed: 1 }), member('b', 2, { speed: 99 })], [foe({ attack: 50, speed: 2, affinities: {} })]);
    let before = 0, after = fall.snapshot();
    for (let i = 0; i < 80 && after.combatants.find(c => c.id === 'a')!.hp > 0; i++) { before = after.momentum; after = fall.command({ type: 'guard' }); }
    expect(after.combatants.find(c => c.id === 'a')!.hp).toBe(0);
    expect(before).toBeGreaterThan(-MOMENTUM.fallen);
    expect(after.momentum).toBe(Math.min(MOMENTUM.pips * MOMENTUM.pip, before + MOMENTUM.guard) + MOMENTUM.fallen);
  });

  it('a round ends every ROUND_TICKS ticks; each full pip then restores 1 MP to every living member, up to the maximum', () => {
    const b = fight([member('a', 1, { mp: 10, skills: [PIERCE] }), member('b', 2, { mp: 4 })], [foe({ shield: 1 })]);
    let s = b.command({ type: 'skill', action: PIERCE, target: 'e' }); // A weakness hit that breaks: 125 momentum, one pip.
    expect(s.momentum).toBe(MOMENTUM.weak + MOMENTUM.break);
    expect(s.combatants.find(c => c.id === 'a')!.mp).toBe(7);
    const rounds: Extract<BattleEvent, { kind: 'round' }>[] = [];
    for (let i = 0; i < 8; i++) {
      expect(s.round).toBe(Math.floor(s.timeline[0]!.tick / ROUND_TICKS)); // Rounds follow the timeline.
      rounds.push(...s.events.filter((e): e is Extract<BattleEvent, { kind: 'round' }> => e.kind === 'round'));
      s = b.command({ type: 'guard' });
    }
    // Only a is short of MP, so only a recovers, 1 per round, until full; b at its maximum never appears.
    expect(rounds.length).toBeGreaterThan(0);
    for (const round of rounds) expect(round.recovered).toEqual({ a: 1 });
    expect(s.combatants.find(c => c.id === 'a')!.mp).toBe(Math.min(10, 7 + rounds.length));
  });

  it('nothing is restored at zero pips, so a fight with nothing authored keeps its events', () => {
    const b = fight([member('a', 1, { mp: 10, skills: [PIERCE] })], [foe({ affinities: {} })]);
    let s = b.command({ type: 'skill', action: PIERCE, target: 'e' });
    for (let i = 0; i < 6; i++) { s = b.command({ type: 'guard' }); expect(kinds(s)).not.toContain('round'); }
    expect(s.round).toBeGreaterThan(0);
  });

  it('Retry restores shields, breaks, phases, momentum and rounds with the same seed', () => {
    const b = fight([member('a', 1, { hp: 5, speed: 30 })], [foe({ hp: 999, shield: 1, attack: 40, speed: 5 })]);
    let s = b.snapshot();
    for (let i = 0; i < 40 && s.phase === 'command'; i++) s = attack(b);
    expect(s.phase).toBe('defeat');
    const again = b.retry();
    expect(foeOf(again)).toMatchObject({ shield: 1, broken: false, stunned: false, phase: 0, revealed: [] });
    expect(again).toMatchObject({ momentum: 0, round: Math.floor(again.timeline[0]!.tick / ROUND_TICKS) });
  });
});

describe('the demo content (Ariel\'s M5.5c table)', () => {
  it('the Mage\'s staff breaks the Clay Golem in the Formation Drill: three weakness hits, a stunned turn, then recovery', async () => {
    const { readParty } = await import('../../src/content/validation.mjs');
    const { battleEncounter, defaultParty } = await import('../../src/domain/party');
    const roster = readParty(JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')));
    const drill = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8'))).encounters.find(e => e.id === 'demo:encounter.formation-drill')!;
    const b = new BattleSession(battleEncounter(drill, roster, defaultParty(roster)), new Map(), actions);
    expect(b.snapshot().combatants.find(c => c.id === 'golem')).toMatchObject({ shield: 3, affinities: { blunt: 'weak', slash: 'resist' } });
    let s = b.snapshot();
    const seen: string[] = [];
    for (let i = 0; i < 40 && s.phase === 'command' && !seen.includes('recover golem'); i++) {
      // The Mage strikes the Golem until it breaks; everyone else guards (a broken Golem would fall to ×1.875 hits).
      const broken = s.combatants.find(c => c.id === 'golem')!.broken;
      s = b.command(s.active === 'mage' && !broken ? { type: 'attack', target: 'golem' } : { type: 'guard' });
      for (const e of s.events) {
        if (e.kind === 'attack' && e.actor === 'mage') seen.push(`mage ${e.affinity} shield ${e.shieldLeft}`);
        if (e.kind === 'break' || e.kind === 'stunned' || e.kind === 'recover') seen.push(`${e.kind} ${e.actor}`);
      }
    }
    expect(seen).toEqual(['mage weak shield 2', 'mage weak shield 1', 'mage weak shield 0', 'break golem', 'stunned golem', 'recover golem']);
  });
});

describe('content', () => {
  const issues = (enemy: Record<string, unknown>, party: Record<string, unknown> = member('a', 1)): string[] => {
    try {
      readEncounters({ schemaVersion: 3, encounters: [{ id: 'test:encounter.bad', name: 'Bad', seed: 1, party: [party], enemies: [enemy] }] }, 'encounters.json', undefined, undefined, null, actionIds, tags);
      return [];
    } catch (error) { return ((error as { issues?: { path: string; message: string }[] }).issues ?? []).map(i => `${i.path}: ${i.message}`); }
  };
  it('shields and phases belong to enemies; phases fall in order and use declared tags', () => {
    expect(issues(foe({ shield: 3, phases: [{ below: 60, shield: 2 }, { below: 25, affinities: { fire: 'weak' } }] }))).toEqual([]);
    expect(issues(foe(), member('a', 1, { shield: 2 }))).toEqual(['/encounters/0/party/0/shield: Only enemies have shields and phases']);
    expect(issues(foe({ phases: [{ below: 30 }, { below: 40 }] }))).toEqual(['/encounters/0/enemies/0/phases/1/below: Each phase must start at a lower HP share than the one before']);
    expect(issues(foe({ phases: [{ below: 50, affinities: { frost: 'weak' } }] }))).toEqual(['/encounters/0/enemies/0/phases/0/affinities/frost: Unknown damage tag (declare it in the action catalog)']);
    expect(issues(foe({ shield: 0 }))[0]).toContain('/encounters/0/enemies/0/shield');
  });
});
