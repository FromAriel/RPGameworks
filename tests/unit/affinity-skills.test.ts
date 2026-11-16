import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readActions, readEncounters, readParty } from '../../src/content/validation.mjs';
import { BattleSession } from '../../src/domain/battle';
import type { BattleEvent, Encounter } from '../../src/domain/battle';
import { actionMap } from '../../src/domain/actions';
import { scaleDamage } from '../../src/domain/battle-grid.mjs';
import { affinityOf, resolveHit } from '../../src/domain/hit';
import { hpBefore } from '../../src/presentation/battle/playback';

/** Decision 0018 M5.5b-1: damage tags, the four affinity levels, MP, weapons and skills. */
const catalog = readActions(JSON.parse(readFileSync('content/games/demo/actions.json', 'utf8')));
const actions = actionMap(catalog);
const issues = (run: () => unknown): string[] => {
  try { run(); return []; } catch (error) {
    return ((error as { issues?: { path: string; message: string }[] }).issues ?? [{ path: '', message: String(error) }]).map(i => `${i.path}: ${i.message}`);
  }
};
const member = (id: string, lane: number, depth: number, weapon: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, frame: 'hero-left', cell: { lane, depth }, hp: 40, attack: 10, defense: 1, speed: 20, weapon: { name: weapon, tags: [weapon] }, mp: 10, ...extra });
const foe = (id: string, lane: number, depth: number, affinities: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, frame: 'sigil', cell: { lane, depth }, hp: 60, attack: 1, defense: 2, speed: 1, affinities, ...extra });
const fight = (party: unknown[], enemies: unknown[], opening?: string) => new BattleSession(readEncounters({ schemaVersion: 3, encounters: [
  { id: 'test:encounter.tags', name: 'Tags', seed: 7, party, enemies, ...(opening ? { opening } : {}) }] }).encounters[0] as Encounter, new Map(), actions);
type Hit = Extract<BattleEvent, { kind: 'attack' }>;
const hitOf = (events: readonly BattleEvent[]) => events.find((e): e is Hit => e.kind === 'attack' && e.actor.length === 1)!;
const raws = (attack: number, defense: number) => [-1, 0, 1].map(v => Math.max(1, attack - defense + v));

describe('affinities', () => {
  it('follow absorb, then immune, then weak, then resist, for a hit with several tags', () => {
    const a = { pierce: 'weak', fire: 'immune', slash: 'resist', ice: 'absorb' } as const;
    expect(affinityOf(a, ['pierce', 'fire'])).toBe('immune');
    expect(affinityOf(a, ['pierce', 'slash'])).toBe('weak');
    expect(affinityOf(a, ['slash'])).toBe('resist');
    expect(affinityOf(a, ['ice', 'fire', 'pierce'])).toBe('absorb');
    expect(affinityOf(a, ['blunt'])).toBeNull();
    expect(affinityOf(undefined, ['pierce'])).toBeNull();
  });
  it('scale a hit in the pipeline: weak ×1.25, resist ×0.5, immune nothing, absorb flagged for healing', () => {
    const base = { formula: 'attack-defense' as const, attack: 10, defense: 2, variance: 0, guarded: false, shields: 0 };
    expect(resolveHit({ ...base, affinity: 'weak' })).toMatchObject({ damage: 10, affinity: 'weak', reports: [{ step: 'affinity', affinity: 'weak', percent: 125 }] });
    expect(resolveHit({ ...base, affinity: 'resist' }).damage).toBe(4);
    expect(resolveHit({ ...base, affinity: 'immune' }).damage).toBe(0); // Not the usual minimum of 1.
    expect(resolveHit({ ...base, affinity: 'absorb' })).toMatchObject({ damage: 8, affinity: 'absorb' });
    expect(resolveHit({ ...base, affinity: 'weak', guarded: true, shields: 1 }).damage).toBe(scaleDamage(8, [125, 50, 80])); // Multiplied in, rounded once.
  });
  it('apply to a basic Attack through the weapon\'s tags, in battle', () => {
    const weak = hitOf(fight([member('a', 1, 1, 'pierce')], [foe('e', 1, 1, { pierce: 'weak' })]).command({ type: 'attack', target: 'e' }).events);
    expect(weak).toMatchObject({ affinity: 'weak' });
    expect(raws(10, 2).map(r => scaleDamage(r, [125]))).toContain(weak.damage);
    expect(hitOf(fight([member('a', 1, 1, 'slash')], [foe('e', 1, 1, { slash: 'resist' })]).command({ type: 'attack', target: 'e' }).events).affinity).toBe('resist');
    const immune = fight([member('a', 1, 1, 'blunt')], [foe('e', 1, 1, { blunt: 'immune' })]).command({ type: 'attack', target: 'e' });
    expect(hitOf(immune.events)).toMatchObject({ affinity: 'immune', damage: 0, defeated: false });
    expect(immune.combatants.find(c => c.id === 'e')!.hp).toBe(60);
  });
  it('an absorbed hit heals, up to the maximum, and playback can undo it', () => {
    const battle = fight([member('a', 1, 1, 'slash'), member('b', 2, 1, 'pierce')], [foe('e', 1, 1, { fire: 'absorb' })]);
    battle.command({ type: 'attack', target: 'e' }); // a hurts it first.
    const hurt = battle.snapshot().combatants.find(c => c.id === 'e')!.hp;
    const after = battle.command({ type: 'skill', action: 'demo:action.fire-bolt', target: 'e' }); // Unknown to b: refused.
    expect(after.combatants.find(c => c.id === 'e')!.hp).toBe(hurt);
    const mage = fight([member('m', 1, 1, 'blunt', { skills: ['demo:action.fire-bolt'], reach: 'ranged' })], [foe('e', 1, 1, { fire: 'absorb' }, { hp: 60 })]);
    const healed = mage.command({ type: 'skill', action: 'demo:action.fire-bolt', target: 'e' });
    expect(hitOf(healed.events)).toMatchObject({ affinity: 'absorb', damage: 0 }); // Already at full HP: it heals nothing.
    expect(hpBefore(healed, healed.events).get('e')).toBe(60);
  });
});

describe('skills and MP', () => {
  const lancer = member('l', 2, 1, 'pierce', { skills: ['demo:action.pierce'], reach: 'reach', mp: 4 });
  it('are refused when unknown, too costly or out of reach, and spend MP when used', () => {
    const battle = fight([lancer], [foe('front', 2, 1), foe('back', 2, 2), foe('far', 2, 3)]);
    expect(battle.validate({ type: 'skill', action: 'demo:action.fire-bolt', target: 'front' })).toBe('unknown-skill');
    expect(battle.validate({ type: 'skill', action: 'demo:action.pierce', target: 'far' })).toBe('out-of-reach'); // Two allies ahead: beyond reach.
    expect(battle.validate({ type: 'skill', action: 'demo:action.pierce', target: 'back' })).toBeNull();
    const used = battle.command({ type: 'skill', action: 'demo:action.pierce', target: 'back' });
    expect(used.combatants.find(c => c.id === 'l')!.mp).toBe(1);
    expect(hitOf(used.events)).toMatchObject({ action: 'demo:action.pierce', name: 'Pierce', shields: 0 }); // Pierces the one shield ahead.
    expect(battle.validate({ type: 'skill', action: 'demo:action.pierce', target: 'back' })).toBe('not-enough-mp');
  });
  it('Pierce counts one fewer shield, and hits with its power', () => {
    const pierce = hitOf(fight([lancer], [foe('front', 2, 1), foe('back', 2, 2)]).command({ type: 'skill', action: 'demo:action.pierce', target: 'back' }).events);
    expect(raws(10, 2).map(r => scaleDamage(r, [110]))).toContain(pierce.damage);
    expect(pierce.reports).toEqual([{ step: 'power', percent: 110 }]); // No shield step: the one ally ahead was pierced.
  });
  it('Volley and Cleave hit the enemy grid; in a pincer, only the centre\'s flank', () => {
    const archer = member('r', 2, 2, 'pierce', { skills: ['demo:action.volley'], reach: 'ranged' });
    const volley = fight([archer], [foe('x', 1, 1), foe('y', 2, 1), foe('z', 3, 3)]).command({ type: 'skill', action: 'demo:action.volley', target: 'x' });
    const area = volley.events.find((e): e is Extract<BattleEvent, { kind: 'area' }> => e.kind === 'area')!;
    expect(area.hits.map(h => [h.target, h.percent])).toEqual([['x', 100], ['y', 80], ['z', 34]]); // z is the opposite corner, 4 steps away.
    const hero = member('h', 2, 1, 'slash', { skills: ['demo:action.cleave'] });
    const pincer = fight([hero], [foe('f1', 2, 1, {}, { flank: 'front' }), foe('f2', 2, 2, {}, { flank: 'front' }), foe('r1', 2, 1, {}, { flank: 'rear' })], 'pincer')
      .command({ type: 'skill', action: 'demo:action.cleave', target: 'f1' });
    const cleave = pincer.events.find((e): e is Extract<BattleEvent, { kind: 'area' }> => e.kind === 'area')!;
    expect(cleave.hits.map(h => h.target)).toEqual(['f1', 'f2']); // The rear flank's grid is another grid.
    expect(pincer.combatants.find(c => c.id === 'h')!.mp).toBe(6);
  });
  it('the demo roster carries its weapons, MP and skills into battle', () => {
    const roster = readParty(JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')));
    expect(roster.members.map(m => [m.id, m.weapon?.name, m.mp, m.skills])).toEqual([
      ['hero', 'Sword', 12, ['demo:action.cleave']], ['archer', 'Bow', 14, ['demo:action.volley']],
      ['lancer', 'Spear', 10, ['demo:action.pierce']], ['mage', 'Staff', 20, ['demo:action.fire-bolt']],
    ]);
  });
});

describe('content checks', () => {
  const tags = new Set(Object.values(catalog.tagGroups!).flat()), ids = new Set(catalog.actions.map(a => a.id));
  it('weapons, skills and affinities must use the catalog; the party has no affinities and enemies no kit', () => {
    const raw = JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')) as { members: Record<string, unknown>[] };
    const withHero = (extra: Record<string, unknown>) => ({ ...raw, members: raw.members.map((m, i) => (i === 0 ? { ...m, ...extra } : m)) });
    expect(issues(() => readParty(withHero({ weapon: { name: 'Axe', tags: ['chop'] } }), 'p.json', undefined, { tags, actions: ids }))).toEqual(['/members/0/weapon/tags/0: Unknown damage tag (declare it in the action catalog)']);
    expect(issues(() => readParty(withHero({ skills: ['demo:action.nova'] }), 'p.json', undefined, { tags, actions: ids }))).toEqual(['/members/0/skills/0: Unknown skill: not in the action catalog']);
    const enc = (party: unknown[], enemies: unknown[]) => issues(() => readEncounters({ schemaVersion: 3, encounters: [{ id: 'test:encounter.x', name: 'X', seed: 1, party, enemies }] }, 'e.json', undefined, undefined, undefined, ids, tags));
    expect(enc([member('a', 1, 1, 'slash')], [foe('e', 1, 1, { frost: 'weak' })])).toEqual(['/encounters/0/enemies/0/affinities/frost: Unknown damage tag (declare it in the action catalog)']);
    expect(enc([member('a', 1, 1, 'slash', { affinities: { fire: 'weak' } })], [foe('e', 1, 1)])).toEqual(['/encounters/0/party/0/affinities: Only enemies have affinities for now']);
    expect(enc([member('a', 1, 1, 'slash')], [foe('e', 1, 1, {}, { mp: 5 })])).toEqual(['/encounters/0/enemies/0/mp: Only the party has weapons, MP and skills for now']);
    expect(enc([member('a', 1, 1, 'slash')], [foe('e', 1, 1, { fire: 'melts' })])[0]).toContain('/encounters/0/enemies/0/affinities/fire'); // Only the four levels.
  });
  it('tags are declared once, and actions may only use declared tags', () => {
    expect(issues(() => readActions({ ...catalog, tagGroups: { weapon: ['slash'], element: ['slash'] } }))[0]).toBe('/tagGroups/element/0: Each damage tag belongs to one group, once');
    expect(issues(() => readActions({ schemaVersion: 1, tagGroups: { weapon: ['slash'] }, actions: [{ id: 'test:action.x', name: 'X', targeting: 'enemy', tags: ['fire'], power: { formula: 'attack-defense' }, effects: ['damage'] }] })))
      .toEqual(['/actions/0/tags/0: Unknown damage tag (declare it in tagGroups)']);
  });
});
