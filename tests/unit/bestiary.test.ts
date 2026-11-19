import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bestiaryKinds, readActions, readCatalog, readEncounters, readFacts, readItems, readParty, readQuests } from '../../src/content/validation.mjs';
import { BattleSession, discoveriesOf } from '../../src/domain/battle';
import type { BattleSnapshot } from '../../src/domain/battle';
import { actionMap } from '../../src/domain/actions';
import { BattleMenu } from '../../src/domain/battle-menu';
import { battleEncounter, defaultParty } from '../../src/domain/party';
import { createEnvelope, validateSaveEnvelope, validateStateIndex } from '../../src/domain/save';
import type { SaveContext } from '../../src/domain/save';
import { SessionState, describeDiscoveries, mergeBestiary } from '../../src/domain/session';
import type { QuestDefinition } from '../../src/domain/session';

/** Decision 0017 M5.5d: enemy kinds, the bestiary in the session and in save version 4, and what it shows. */
const json = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const demo = (file: string) => json(`content/games/demo/${file}`);
const roster = readParty(demo('party.json'));
const encounters = readEncounters(demo('encounters.json'));
const kinds = bestiaryKinds(encounters);
const actions = actionMap(readActions(demo('actions.json')));
const GOLEM = 'demo:creature.clay-golem', BAT = 'demo:creature.bat', OGRE = 'demo:creature.two-headed-ogre';
const definitions = () => ({ items: readItems(demo('items.json')), facts: readFacts(demo('facts.json')), quests: readQuests(demo('quests.json')).quests as readonly QuestDefinition[], party: roster, bestiary: kinds });
function context(): SaveContext {
  const game = demo('game.json') as { maps: { file: string }[]; saveCompatibilityVersion: number };
  const maps = game.maps.map(entry => demo(entry.file)) as { id: string; name: string; width: number; height: number; spawns: { id: string }[]; objects: { id: string }[] }[];
  const defs = definitions();
  const index = validateStateIndex({
    schemaVersion: 4, gameId: 'demo:game.foundation', saveCompatibilityVersion: game.saveCompatibilityVersion,
    maps: maps.map(map => ({ id: map.id, name: map.name, width: map.width, height: map.height, spawns: map.spawns.map(s => s.id) })),
    itemIds: defs.items.items.map(i => i.id), factIds: defs.facts.facts.map(f => f.id), placementIds: maps.flatMap(m => m.objects.map(o => o.id)),
    questIds: defs.quests.map(q => q.id), party: { memberIds: roster.members.map(m => m.id), defaults: defaultParty(roster) }, bestiary: kinds,
  });
  return { gameId: 'demo:game.foundation', saveCompatibilityVersion: game.saveCompatibilityVersion, index };
}
const drill = () => new BattleSession(battleEncounter(encounters.encounters.find(e => e.id === 'demo:encounter.formation-drill')!, roster, defaultParty(roster)), new Map(), actions);

describe('enemy kinds in content', () => {
  it('every demo enemy has a kind, and the state index lists each kind with the tags it has affinities to', () => {
    expect(encounters.encounters.every(e => e.enemies.every(enemy => enemy.kind))).toBe(true);
    expect(kinds).toEqual({ [BAT]: ['pierce'], [GOLEM]: ['blunt', 'slash'], [OGRE]: ['fire', 'pierce'] });
  });

  it('a kind belongs to enemies, means the same affinities everywhere, and a Codex entry names a known kind once', () => {
    const issues = (run: () => unknown): string[] => {
      try { run(); return []; } catch (error) { return ((error as { issues?: { path: string; message: string }[] }).issues ?? []).map(i => `${i.path}: ${i.message}`); }
    };
    const fighter = (extra: Record<string, unknown>) => ({ id: 'x', name: 'X', frame: 'sigil', cell: { lane: 1, depth: 1 }, hp: 5, attack: 1, defense: 0, speed: 5, ...extra });
    const fight = (id: string, enemy: Record<string, unknown>, party: Record<string, unknown> = {}) =>
      ({ id: `test:encounter.${id}`, name: id, seed: 1, party: [fighter({ id: 'p', ...party })], enemies: [fighter(enemy)] });
    expect(issues(() => readEncounters({ schemaVersion: 3, encounters: [fight('a', {}, { kind: GOLEM })] }))).toEqual(['/encounters/0/party/0/kind: Only enemies have a kind']);
    expect(issues(() => readEncounters({ schemaVersion: 3, encounters: [fight('a', { kind: GOLEM, shield: 3 }), fight('b', { kind: GOLEM, shield: 2 })] })))
      .toEqual(['/encounters/1/enemies/0/kind: Every enemy of one kind needs the same affinities, shield and phases']);
    expect(issues(() => readEncounters({ schemaVersion: 3, encounters: [fight('a', { kind: GOLEM, affinities: { slash: 'resist', blunt: 'weak' } }), fight('b', { kind: GOLEM, affinities: { blunt: 'weak', slash: 'resist' } })] }))).toEqual([]);
    const codex = (entries: unknown[]) => readCatalog({ schemaVersion: 1, title: 'Codex', entries }, 'codex.json', { kinds: new Set([GOLEM]) });
    expect(issues(() => codex([{ id: 'demo:codex.a', title: 'A', text: ['a'], kind: BAT }]))).toEqual(['/entries/0/kind: Unknown creature kind: no enemy in the encounters has it']);
    expect(issues(() => codex([{ id: 'demo:codex.a', title: 'A', text: ['a'], kind: GOLEM }, { id: 'demo:codex.b', title: 'B', text: ['b'], kind: GOLEM }]))).toEqual(['/entries/1/kind: Each kind may have one entry']);
  });
});

describe('the bestiary', () => {
  it('merges discoveries: levels are added once in a fixed order, and broken stays true', () => {
    let b = mergeBestiary({}, { [OGRE]: { affinities: { fire: ['resist'] }, broken: true } }, kinds)!;
    b = mergeBestiary(b, { [OGRE]: { affinities: { fire: ['weak', 'resist'], pierce: ['weak'] }, broken: false } }, kinds)!;
    expect(b).toEqual({ [OGRE]: { affinities: { fire: ['weak', 'resist'], pierce: ['weak'] }, broken: true } });
  });

  it('rejects an unknown kind, a tag the kind has no affinity to, an unknown level or a malformed record', () => {
    for (const bad of [
      { 'demo:creature.slime': { affinities: {}, broken: false } },
      { [BAT]: { affinities: { fire: ['weak'] }, broken: false } },
      { [BAT]: { affinities: { pierce: ['fragile'] }, broken: false } },
      { [BAT]: { affinities: { pierce: [] }, broken: false } },
      { [BAT]: { affinities: { pierce: ['weak'] } } },
      { [BAT]: { affinities: { pierce: ['weak'] }, broken: 'yes' } },
    ]) expect(mergeBestiary({}, bad, kinds)).toBeNull();
  });

  it('records through one session transaction; a repeat changes nothing, and a bad record changes nothing at all', () => {
    const session = new SessionState(definitions());
    const discoveries = { [GOLEM]: { affinities: { blunt: ['weak' as const] }, broken: true } };
    const first = session.transact({ actions: [{ type: 'recordDiscoveries', discoveries }] });
    expect(first.kind).toBe('committed');
    expect([...first.changed]).toEqual([`bestiary:${GOLEM}`]);
    expect(session.discoveries(GOLEM)).toEqual({ affinities: { blunt: ['weak'] }, broken: true });
    expect(session.transact({ actions: [{ type: 'recordDiscoveries', discoveries }] }).kind).toBe('unchanged');
    const before = session.snapshot();
    const bad = session.transact({ actions: [{ type: 'changeItem', itemId: 'demo:item.tonic', delta: 1 }, { type: 'recordDiscoveries', discoveries: { [BAT]: { affinities: { blunt: ['weak'] }, broken: false } } }] });
    expect(bad).toMatchObject({ kind: 'rejected', reason: 'invalid' });
    expect(session.snapshot()).toBe(before); // The tonic was not added either.
  });

  it('reads as Codex lines', () => {
    expect(describeDiscoveries(undefined)).toEqual(['Affinities: none found yet.']);
    expect(describeDiscoveries({ affinities: { fire: ['weak', 'resist'], pierce: ['weak'] }, broken: true })).toEqual(['Weak: fire, pierce. Resists: fire.', 'Broken in battle.']);
  });
});

describe('save version 4', () => {
  it('keeps the bestiary through a save and a load', () => {
    const session = new SessionState(definitions());
    session.transact({ actions: [{ type: 'recordDiscoveries', discoveries: { [BAT]: { affinities: { pierce: ['weak'] }, broken: false } } }] });
    const envelope = createEnvelope('slot-1', 1, context(), { mapId: 'demo:map.workshop', tile: { x: 10, y: 7 }, facing: 'down' }, session);
    expect(envelope).toMatchObject({ schemaVersion: 4, session: { bestiary: { [BAT]: { affinities: { pierce: ['weak'] }, broken: false } } } });
    const restored = new SessionState(definitions(), validateSaveEnvelope(JSON.parse(JSON.stringify(envelope)), context()).session);
    expect(restored.discoveries(BAT)).toEqual({ affinities: { pierce: ['weak'] }, broken: false });
  });

  it('matches the v4 fixture, and rejects a damaged or missing bestiary', () => {
    const fixture = json('tests/fixtures/saves/v4-bestiary.json');
    const loaded = validateSaveEnvelope(fixture, context());
    const session = new SessionState(definitions(), loaded.session);
    expect(session.discoveries(GOLEM)).toEqual({ affinities: { blunt: ['weak'], slash: ['resist'] }, broken: true });
    expect(session.discoveries(OGRE)).toEqual({ affinities: { fire: ['weak', 'resist'] }, broken: false });
    const damaged = (bestiary: unknown) => () => validateSaveEnvelope({ ...fixture, session: { ...fixture.session, bestiary } }, context());
    expect(damaged({ [GOLEM]: { affinities: { fire: ['weak'] }, broken: true } })).toThrow('Invalid saved bestiary');
    expect(damaged({ 'demo:creature.slime': { affinities: {}, broken: false } })).toThrow('Invalid saved bestiary');
    const { bestiary: _omit, ...without } = fixture.session;
    expect(() => validateSaveEnvelope({ ...fixture, session: without }, context())).toThrow('Saved session is invalid');
  });
});

describe('discoveries in battle', () => {
  it('each hit records the affinity it showed for the tags behind it; a break is recorded; discoveriesOf groups by kind', () => {
    const b = drill();
    let s: BattleSnapshot = b.snapshot();
    // The Mage strikes the Golem until it breaks; the Hero strikes it once (slash: resisted); the others guard.
    let heroHit = false;
    for (let i = 0; i < 40 && s.phase === 'command' && !s.combatants.find(c => c.id === 'golem')!.everBroken; i++) {
      if (s.active === 'mage') s = b.command({ type: 'attack', target: 'golem' });
      else if (s.active === 'hero' && !heroHit && b.validate({ type: 'attack', target: 'golem' }) === null) { s = b.command({ type: 'attack', target: 'golem' }); heroHit = true; }
      else s = b.command({ type: 'guard' });
    }
    const golem = s.combatants.find(c => c.id === 'golem')!;
    expect(golem).toMatchObject({ kind: GOLEM, everBroken: true });
    expect(golem.seen.blunt).toEqual(['weak']);
    const found = discoveriesOf(s);
    expect(heroHit).toBe(true);
    expect(found[GOLEM]).toEqual({ affinities: { blunt: ['weak'], slash: ['resist'] }, broken: true });
    expect(Object.keys(found)).toEqual([GOLEM]); // Nothing was learned about the others.
  });

  it('the help line names weaknesses remembered from earlier battles from the first turn, only in the phase they hold', () => {
    const b = drill();
    const menu = new BattleMenu();
    const s = b.snapshot();
    menu.begin({ phase: s.phase, active: s.active, combatants: s.combatants, items: [], actions, validate: c => b.validate(c),
      knownWeak: kind => (kind === GOLEM ? ['blunt'] : kind === OGRE ? ['pierce'] : []) });
    menu.choose('attack');
    const help = (id: string) => menu.state().entries.find(e => e.id === `target:${id}`)?.help ?? '';
    expect(help('golem')).toContain('Weak: blunt');
    expect(help('ogre') + help('golem')).not.toContain('Weak: pierce'); // The Ogre is weak to pierce only in its second phase.
  });
});

describe('the demo encounter', () => {
  it('plays the Formation Drill exactly as before kinds were added', () => {
    const plain = encounters.encounters.find(e => e.id === 'demo:encounter.formation-drill')!;
    const stripped = { ...plain, enemies: plain.enemies.map(({ kind: _k, ...enemy }) => enemy) };
    const play = (encounter: unknown) => {
      const b = new BattleSession(battleEncounter(encounter as typeof plain, roster, defaultParty(roster)), new Map(), actions);
      let s = b.snapshot();
      for (let i = 0; i < 40 && s.phase === 'command'; i++) {
        const target = ['bat', 'golem', 'ogre'].find(id => s.combatants.find(c => c.id === id)!.hp > 0 && b.validate({ type: 'attack', target: id }) === null)!;
        s = b.command({ type: 'attack', target });
      }
      return { phase: s.phase, turn: s.turn, hp: s.combatants.map(c => c.hp) };
    };
    expect(play(plain)).toEqual(play(stripped));
    expect(play(plain)).toMatchObject({ phase: 'victory', turn: 29 });
  });
});
