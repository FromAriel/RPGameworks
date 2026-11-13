import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readEncounters, readFacts, readItems, readParty, readQuests } from '../../src/content/validation.mjs';
import { BattleSession } from '../../src/domain/battle';
import type { Encounter } from '../../src/domain/battle';
import { battleEncounter, defaultParty } from '../../src/domain/party';
import type { AuthoredEncounter } from '../../src/domain/party';
import { createEnvelope, formatPlayTime, validateSaveEnvelope, validateStateIndex } from '../../src/domain/save';
import type { SaveContext } from '../../src/domain/save';
import { SessionState } from '../../src/domain/session';
import type { QuestDefinition } from '../../src/domain/session';

/** Decision 0014 M5.4d-1: the party roster, guests, the formation in the session, and save version 3 with play time. */
const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const demo = (file: string) => json(`content/games/demo/${file}`);
const roster = readParty(demo('party.json'), 'party.json', ['hero-left', 'archer-left', 'lancer-left', 'mage-left']);
const encounters = readEncounters(demo('encounters.json'), 'encounters.json', undefined, undefined, roster).encounters;
const authored = readEncounters(json('tests/fixtures/encounters/authored-party.json')).encounters;
const definitions = () => ({ items: readItems(demo('items.json')), facts: readFacts(demo('facts.json')), quests: readQuests(demo('quests.json')).quests as readonly QuestDefinition[], party: roster });
const issues = (run: () => unknown): string[] => {
  try { run(); return []; } catch (error) {
    return ((error as { issues?: { path: string; message: string }[] }).issues ?? [{ path: '', message: String(error) }]).map(i => `${i.path}: ${i.message}`);
  }
};

/** The demo's save state index, derived from content as the build does. */
function context(): SaveContext {
  const game = demo('game.json') as { maps: { file: string }[]; saveCompatibilityVersion: number };
  const maps = game.maps.map(entry => demo(entry.file)) as { id: string; name: string; width: number; height: number; spawns: { id: string }[]; objects: { id: string }[] }[];
  const defs = definitions();
  const index = validateStateIndex({
    schemaVersion: 3, gameId: 'demo:game.foundation', saveCompatibilityVersion: game.saveCompatibilityVersion,
    maps: maps.map(map => ({ id: map.id, name: map.name, width: map.width, height: map.height, spawns: map.spawns.map(s => s.id) })),
    itemIds: defs.items.items.map(i => i.id), factIds: defs.facts.facts.map(f => f.id), placementIds: maps.flatMap(m => m.objects.map(o => o.id)),
    questIds: defs.quests.map(q => q.id), party: { memberIds: roster.members.map(m => m.id), defaults: defaultParty(roster) },
  });
  return { gameId: 'demo:game.foundation', saveCompatibilityVersion: game.saveCompatibilityVersion, index };
}

describe('the party roster', () => {
  it('accepts the demo roster and reports mistakes with their place', () => {
    expect(roster.active).toEqual(['hero', 'archer', 'lancer', 'mage']);
    const raw = demo('party.json') as { members: Record<string, unknown>[]; active: string[] };
    const withMembers = (members: Record<string, unknown>[], active = raw.active) => ({ ...raw, members, active });
    expect(issues(() => readParty(withMembers([...raw.members, { ...raw.members[0]! }]), 'p.json'))).toEqual(['/members/4/id: Duplicate party member ID']);
    expect(issues(() => readParty(withMembers(raw.members, [...raw.active.slice(0, 3), 'thief']), 'p.json'))).toEqual(['/active/3: Unknown party member']);
    expect(issues(() => readParty(withMembers(raw.members, ['hero', 'hero']), 'p.json'))).toEqual(['/active/1: A member is in the party once']);
    expect(issues(() => readParty(withMembers(raw.members.map((m, i) => (i === 1 ? { ...m, cell: { lane: 2, depth: 1 } } : m))), 'p.json')))
      .toEqual(['/members/1/cell: Starting party: Overlaps another fighter at lane 2, depth 1']);
    expect(issues(() => readParty(raw, 'p.json', ['hero-left']))[0]).toBe('/members/1/frame: Unknown battler frame');
  });

  it('encounters take the roster, may add a guest, and keep an authored party only without guests', () => {
    const practice = (demo('encounters.json') as { encounters: Record<string, unknown>[] }).encounters[0]!;
    const guest = { id: 'mara', name: 'Mara', frame: 'hero-left', hp: 18, attack: 4, defense: 1, speed: 9 };
    const read = (encounter: Record<string, unknown>, list: typeof roster | null = roster) => issues(() => readEncounters({ schemaVersion: 2, encounters: [encounter] }, 'e.json', undefined, undefined, list));
    expect(read({ ...practice, guests: [guest] })).toEqual([]);
    expect(read(practice, null)).toEqual(['/encounters/0: This game has no party roster (party.json): give the encounter a party']);
    expect(read({ ...practice, guests: [{ ...guest, id: 'hero' }] })).toEqual(['/encounters/0/guests/0/id: A guest cannot share an ID with a party member']);
    expect(read({ ...practice, party: [guest], guests: [guest] })[0]).toBe('/encounters/0/guests: An encounter with its own party has no guests');
    expect(read({ ...practice, guests: [{ ...guest, size: { lanes: 2, depths: 1 } }] })).toEqual(['/encounters/0/guests/0/size: Only enemies can cover several cells']);
  });
});

describe('the party in battle', () => {
  it('plays the Formation Drill exactly as when its party was authored in the encounter', () => {
    const drill = battleEncounter(encounters[1]!, roster, defaultParty(roster));
    expect(drill).toEqual(authored[1]);
    const play = (encounter: Encounter) => { const battle = new BattleSession(encounter); const trace = []; for (let i = 0; i < 6; i += 1) { const s = battle.snapshot(); if (s.phase !== 'command') break; const target = s.combatants.find(c => c.side === 'enemy' && c.hp > 0 && battle.validate({ type: 'attack', target: c.id }) === null); trace.push(battle.command(target ? { type: 'attack', target: target.id } : { type: 'guard' }).events); } return trace; };
    expect(play(drill)).toEqual(play(authored[1] as Encounter));
  });

  it('brings all four members to the practice fight at their saved cells, and seats a guest', () => {
    const session = new SessionState(definitions());
    expect(session.transact({ actions: [{ type: 'setFormation', cells: { hero: { lane: 1, depth: 1 }, archer: { lane: 1, depth: 3 }, lancer: { lane: 2, depth: 1 }, mage: { lane: 3, depth: 3 } } }] }).kind).toBe('committed');
    const practice = battleEncounter(encounters[0]!, roster, session.party());
    expect(practice.party.map(m => [m.id, m.cell])).toEqual([['hero', { lane: 1, depth: 1 }], ['archer', { lane: 1, depth: 3 }], ['lancer', { lane: 2, depth: 1 }], ['mage', { lane: 3, depth: 3 }]]);
    expect(new BattleSession(practice).snapshot().combatants.filter(c => c.side === 'party')).toHaveLength(4);
    const guest = { id: 'mara', name: 'Mara', frame: 'hero-left', hp: 18, attack: 4, defense: 1, speed: 9 };
    const withGuest = (cell?: { lane: number; depth: number }) => battleEncounter({ ...encounters[0]!, guests: [{ ...guest, ...(cell ? { cell } : {}) }] } as AuthoredEncounter, roster, session.party()).party.at(-1)!.cell;
    expect(withGuest({ lane: 2, depth: 2 })).toEqual({ lane: 2, depth: 2 }); // Free: the guest's own cell.
    expect(withGuest({ lane: 1, depth: 1 })).toEqual({ lane: 3, depth: 1 }); // Taken by the hero: the first free cell.
    expect(withGuest()).toEqual({ lane: 3, depth: 1 });
    expect(battleEncounter(authored[0]!, null, null).party.map(m => m.id)).toEqual(['hero']); // An authored party stays.
  });
});

describe('the formation in the session', () => {
  it('starts from the roster defaults and changes only as one whole, valid formation', () => {
    const session = new SessionState(definitions());
    expect(session.party()).toEqual(defaultParty(roster));
    const cells = { ...defaultParty(roster).cells };
    const set = (next: Record<string, unknown>) => session.transact({ actions: [{ type: 'setFormation', cells: next as never }] });
    expect(set({ ...cells, archer: cells.hero })).toMatchObject({ kind: 'rejected', reason: 'invalid' }); // Overlap.
    expect(set({ hero: cells.hero, archer: cells.archer, lancer: cells.lancer })).toMatchObject({ kind: 'rejected', reason: 'invalid' }); // Missing a member.
    expect(set({ ...cells, mage: { lane: 4, depth: 1 } })).toMatchObject({ kind: 'rejected', reason: 'invalid' });
    expect(set(cells)).toMatchObject({ kind: 'unchanged' });
    // A formation change and a failing item change in one transaction: neither happens.
    expect(session.transact({ actions: [{ type: 'setFormation', cells: { ...cells, hero: { lane: 1, depth: 1 } } }, { type: 'changeItem', itemId: 'demo:item.tonic', delta: -1 }] })).toMatchObject({ kind: 'rejected', reason: 'insufficient' });
    expect(session.party()).toEqual(defaultParty(roster));
    const moved = set({ ...cells, hero: { lane: 1, depth: 1 } });
    expect(moved.kind).toBe('committed');
    expect([...moved.changed]).toEqual(['party:formation']);
    expect(Object.isFrozen(session.party()!.cells.hero)).toBe(true);
  });

  it('counts play time from the deltas it is given, in whole seconds', () => {
    const session = new SessionState(definitions());
    session.advancePlayTime(999); expect(session.playTime()).toBe(0);
    session.advancePlayTime(1); expect(session.playTime()).toBe(1);
    session.advancePlayTime(-5000); session.advancePlayTime(Number.NaN); expect(session.playTime()).toBe(1);
    const revision = session.snapshot().revision;
    session.advancePlayTime(3_725_000); expect(session.snapshot().revision).toBe(revision); // Not a transaction.
    expect(formatPlayTime(session.playTime())).toBe('1:02');
    expect(formatPlayTime(0)).toBe('0:00');
  });
});

describe('save version 3', () => {
  const checkpoint = { mapId: 'demo:map.workshop', tile: { x: 10, y: 7 }, facing: 'down' as const };

  it('keeps the formation and play time through a save and a load', () => {
    const session = new SessionState(definitions());
    session.transact({ actions: [{ type: 'setFormation', cells: { ...defaultParty(roster).cells, mage: { lane: 1, depth: 3 } } }] });
    session.advancePlayTime(4_000_500);
    const envelope = createEnvelope('slot-1', 1, context(), checkpoint, session);
    expect(envelope).toMatchObject({ schemaVersion: 3, saveCompatibilityVersion: 3, session: { playTime: 4000, party: { active: ['hero', 'archer', 'lancer', 'mage'] } } });
    const restored = new SessionState(definitions(), validateSaveEnvelope(JSON.parse(JSON.stringify(envelope)), context()).session);
    expect(restored.party()!.cells.mage).toEqual({ lane: 1, depth: 3 });
    expect(restored.playTime()).toBe(4000);
  });

  it('matches the v3 fixture, and rejects a damaged party or play time', () => {
    const fixture = json('tests/fixtures/saves/v3-formation-moved.json') as Record<string, any>;
    const loaded = validateSaveEnvelope(fixture, context());
    expect(loaded.session.party).toEqual({ active: ['hero', 'archer', 'lancer', 'mage'], cells: { hero: { lane: 1, depth: 1 }, archer: { lane: 2, depth: 2 }, lancer: { lane: 3, depth: 1 }, mage: { lane: 2, depth: 3 } } });
    const damaged = (session: Record<string, unknown>) => () => validateSaveEnvelope({ ...fixture, session: { ...fixture.session, ...session } }, context());
    expect(damaged({ party: { ...fixture.session.party, cells: { ...fixture.session.party.cells, mage: { lane: 1, depth: 1 } } } })).toThrow('two members share lane 1, depth 1');
    expect(damaged({ party: { ...fixture.session.party, active: ['hero', 'thief'] } })).toThrow('unknown party member thief');
    expect(damaged({ playTime: -1 })).toThrow('Invalid saved play time');
    expect(damaged({ playTime: 1.5 })).toThrow('Invalid saved play time');
    const { playTime: _omit, ...withoutTime } = fixture.session;
    expect(() => validateSaveEnvelope({ ...fixture, session: withoutTime }, context())).toThrow('Saved session is invalid');
  });

  it('loads version 2 and version 1 saves with the default party and no play time, without changing them', () => {
    for (const file of ['v2-lens-held-beside-mara.json', 'v1-lens-collected.json', 'v1-empty.json']) {
      const old = json(`tests/fixtures/saves/${file}`);
      const original = JSON.stringify(old);
      const loaded = validateSaveEnvelope(old, context());
      expect(loaded).toMatchObject({ schemaVersion: 3, saveCompatibilityVersion: 3, session: { party: defaultParty(roster), playTime: 0, quests: expect.any(Object) } });
      expect(JSON.stringify(old)).toBe(original);
      expect(new SessionState(definitions(), loaded.session).party()).toEqual(defaultParty(roster));
    }
  });
});
