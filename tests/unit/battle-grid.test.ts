import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alliesAhead, areaHits, areaPercent, canReach, placeGrid, scaleDamage, shieldPercent, steps } from '../../src/domain/battle-grid.mjs';
import type { Placement } from '../../src/domain/battle-grid.mjs';
import { ACTION_WEIGHT, BattleSession, actionDelay } from '../../src/domain/battle';
import type { BattleCommand, BattleSnapshot, Encounter } from '../../src/domain/battle';
import { readEncounters } from '../../src/content/validation.mjs';

/** Decision 0014 M5.4a: Ariel's 3 × 3 battle grid, in the pure rules and in the battle kernel. */
type Combatant = Encounter['party'][number];
const at = (lane: number, depth: number, lanes = 1, depths = 1): Placement => ({ lane, depth, lanes, depths });
const fighter = (id: string, extra: Partial<Combatant> = {}): Combatant =>
  ({ id, name: id, frame: 'sigil', hp: 40, attack: 12, defense: 2, speed: 10, ...extra });
const cell = (lane: number, depth: number) => ({ cell: { lane, depth } }); // 1-based, as content writes it.
const encounter = (party: Combatant[], enemies: Combatant[], extra: Partial<Encounter> = {}): Encounter =>
  ({ id: 'demo:encounter.grid-test', name: 'Grid test', seed: 4242, party, enemies, ...extra });
const ids = (snapshot: BattleSnapshot) => new Map(snapshot.combatants.map(c => [c.id, c]));

describe('grid rules (pure)', () => {
  it('auto-places a side down the front column, then the middle, then the back; up to three are all at the front', () => {
    const { placements, issues } = placeGrid([{}, {}, {}, {}, {}]);
    expect(issues).toEqual([]);
    expect(placements.map(p => [p.lane, p.depth])).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]);
    const big = placeGrid([{ size: { lanes: 2, depths: 2 } }, {}]);
    expect(big.placements).toEqual([at(0, 0, 2, 2), at(2, 0)]);
  });

  it('rejects mixed placement, overlaps and fighters outside the grid', () => {
    expect(placeGrid([{ cell: { lane: 1, depth: 1 } }, {}]).issues).toEqual([{ index: 1, field: 'cell', message: 'Place every fighter on this side of the grid, or none' }]);
    expect(placeGrid([{ cell: { lane: 1, depth: 1 }, size: { lanes: 2, depths: 1 } }, { cell: { lane: 2, depth: 1 } }]).issues)
      .toEqual([{ index: 1, field: 'cell', message: 'Overlaps another fighter at lane 2, depth 1' }]);
    expect(placeGrid([{ cell: { lane: 3, depth: 2 }, size: { lanes: 2, depths: 1 } }]).issues).toEqual([{ index: 0, field: 'cell', message: 'The fighter does not fit inside the 3 × 3 grid' }]);
  });

  it('counts living allies between a fighter and the attacker in its lane, from either side, through a big fighter’s most open lane', () => {
    const front = at(1, 0), middle = at(1, 1), back = at(1, 2);
    expect(alliesAhead(back, [front, middle], 'front')).toBe(2);
    expect(alliesAhead(middle, [front, back], 'front')).toBe(1);
    expect(alliesAhead(front, [middle, back], 'front')).toBe(0);
    expect(alliesAhead(front, [middle, back], 'rear')).toBe(2); // A back attack turns the grid around.
    expect(alliesAhead(back, [at(0, 0)], 'front')).toBe(0); // Another lane does not shield.
    const big = at(0, 1, 2, 2);
    expect(alliesAhead(big, [at(0, 0)], 'front')).toBe(0); // Lane 1 is open.
    expect(alliesAhead(big, [at(0, 0), at(1, 0)], 'front')).toBe(1);
  });

  it('reach, shields, area distance and line shapes', () => {
    expect([0, 1, 2].map(n => [canReach('melee', n), canReach('reach', n), canReach('ranged', n)]))
      .toEqual([[true, true, true], [false, true, true], [false, false, true]]);
    expect([0, 1, 2, 3].map(shieldPercent)).toEqual([100, 80, 65, 65]);
    expect([0, 1, 2, 3, 4].map(areaPercent)).toEqual([100, 80, 65, 50, 34]);
    expect(steps(at(0, 0), at(2, 2))).toBe(4); // Corner to opposite corner.
    expect(steps(at(0, 0), at(1, 1))).toBe(2); // A diagonal neighbour is two steps.
    expect(steps(at(0, 1, 2, 2), at(2, 0))).toBe(2); // To a big fighter's nearest cell.
    const grid = [at(0, 0), at(1, 1), at(2, 2), at(1, 0), at(0, 2)];
    expect(areaHits('radius', grid[1]!, grid)).toEqual([{ index: 0, percent: 65 }, { index: 1, percent: 100 }, { index: 2, percent: 65 }, { index: 3, percent: 80 }, { index: 4, percent: 65 }]);
    expect(areaHits('lane', grid[1]!, grid).map(h => h.index)).toEqual([1, 3]);
    expect(areaHits('column', grid[0]!, grid).map(h => h.index)).toEqual([0, 3]);
    expect(areaHits('diagonal-down', grid[0]!, grid).map(h => h.index)).toEqual([0, 1, 2]);
    expect(areaHits('diagonal-up', grid[4]!, grid).map(h => h.index)).toEqual([1, 4]);
  });

  it('scales damage with whole-number arithmetic, rounding up once, at least 1', () => {
    expect(scaleDamage(20, [65])).toBe(13); // Not 14 from 20 × 0.65 = 13.000000000000002.
    expect(scaleDamage(7, [50, 80])).toBe(3); // 2.8 → 3.
    expect(scaleDamage(10, [80, 80])).toBe(7); // 6.4 → 7: shields multiply with area.
    expect(scaleDamage(1, [50, 65])).toBe(1);
  });
});

describe('grid content validation', () => {
  const errors = (enc: Encounter) => {
    try { readEncounters({ schemaVersion: 2, encounters: [enc] }); return []; } catch (error) {
      return (error as { issues: { path: string; message: string }[] }).issues.map(i => `${i.path}: ${i.message}`);
    }
  };
  it('reports each invalid formation with its place and reason', () => {
    expect(errors(encounter([fighter('a', cell(1, 1)), fighter('b')], [fighter('x')]))).toEqual(['/encounters/0/party/1/cell: Place every fighter on this side of the grid, or none']);
    expect(errors(encounter([fighter('a', { size: { lanes: 2, depths: 1 } })], [fighter('x')]))).toEqual(['/encounters/0/party/0/size: Only enemies can cover several cells']);
    expect(errors(encounter([fighter('a')], [fighter('x', { ...cell(1, 1), size: { lanes: 2, depths: 2 } }), fighter('y', cell(2, 2))])))
      .toEqual(['/encounters/0/enemies/1/cell: Overlaps another fighter at lane 2, depth 2']);
    expect(errors(encounter([fighter('a')], [fighter('x')], { opening: 'pincer' }))).toEqual([
      '/encounters/0/enemies/0/flank: Every enemy in a pincer needs a flank (front or rear)',
      '/encounters/0/enemies: A pincer needs enemies on both flanks; none on the front',
      '/encounters/0/enemies: A pincer needs enemies on both flanks; none on the rear',
    ]);
    expect(errors(encounter([fighter('a')], [fighter('x', { flank: 'rear' })]))).toEqual(['/encounters/0/enemies/0/flank: Only pincer encounters give enemies a flank']);
    expect(errors(encounter([fighter('a')], [fighter('x', { flank: 'front' }), fighter('y', { flank: 'rear' })], { opening: 'pincer' }))).toEqual([]);
  });
});

describe('the battle kernel on the grid', () => {
  // Party: a fighter in front of an archer (top lane), a lancer alone in the middle lane at the back. Enemies: a
  // brute in front of a shaman (top lane). Everyone is slow except the party, so the party acts first.
  const formation = () => encounter(
    [fighter('guard', { ...cell(1, 1), speed: 30 }), fighter('archer', { ...cell(1, 2), reach: 'ranged', speed: 29 }), fighter('lancer', { ...cell(2, 3), reach: 'reach', speed: 28 })],
    [fighter('brute', { ...cell(1, 1), speed: 1 }), fighter('shaman', { ...cell(1, 2), speed: 1 })],
  );

  it('rejects melee on a shielded enemy, lets reach go one layer deeper and ranged anywhere', () => {
    const battle = new BattleSession(formation());
    expect(battle.snapshot().active).toBe('guard');
    expect(battle.validate({ type: 'attack', target: 'shaman' })).toBe('out-of-reach');
    expect(battle.validate({ type: 'attack', target: 'brute' })).toBeNull();
    battle.command({ type: 'guard' });
    expect(battle.snapshot().active).toBe('archer');
    expect(battle.validate({ type: 'attack', target: 'shaman' })).toBeNull();
    battle.command({ type: 'guard' });
    expect(battle.snapshot().active).toBe('lancer');
    expect(battle.validate({ type: 'attack', target: 'shaman' })).toBeNull(); // One layer behind the brute.
  });

  it('takes 20% or 35% off for one or two shields, with the same random draw', () => {
    const lane = (enemies: Combatant[]) => encounter([fighter('archer', { reach: 'ranged', speed: 30 })], enemies);
    const hit = (enc: Encounter) => { const b = new BattleSession(enc); const e = b.command({ type: 'attack', target: 'boss' }).events[0]!; return e.kind === 'attack' ? e : null; };
    const open = hit(lane([fighter('boss', { ...cell(1, 1), speed: 1 })]))!;
    const one = hit(lane([fighter('wall', { ...cell(1, 1), speed: 1 }), fighter('boss', { ...cell(1, 2), speed: 1 })]))!;
    const two = hit(lane([fighter('wall', { ...cell(1, 1), speed: 1 }), fighter('wall2', { ...cell(1, 2), speed: 1 }), fighter('boss', { ...cell(1, 3), speed: 1 })]))!;
    expect([open.shields, one.shields, two.shields]).toEqual([0, 1, 2]);
    expect(one.damage).toBe(scaleDamage(open.damage, [80]));
    expect(two.damage).toBe(scaleDamage(open.damage, [65]));
  });

  it('exposes a fighter the moment the ally shielding it falls', () => {
    const enc = encounter([fighter('hero', { attack: 99, speed: 30 })], [fighter('wall', { ...cell(1, 1), hp: 5, defense: 0, speed: 1 }), fighter('boss', { ...cell(1, 2), speed: 1 })]);
    const battle = new BattleSession(enc);
    expect(battle.validate({ type: 'attack', target: 'boss' })).toBe('out-of-reach');
    battle.command({ type: 'attack', target: 'wall' });
    expect(battle.validate({ type: 'attack', target: 'boss' })).toBeNull();
  });

  it('enemies strike the front-facing party member in the lowest lane, and a back attack turns the party around', () => {
    const party = [fighter('front', cell(2, 1)), fighter('back', cell(2, 3)), fighter('top', cell(1, 2))];
    const enemy = [fighter('wolf', { speed: 30 })];
    const normal = new BattleSession(encounter(party, enemy)).snapshot().events;
    expect(normal.slice(0, 1).map(e => e.kind === 'attack' && e.target)).toEqual(['top']); // Top lane is open: lane 1 before lane 2.
    const behind = new BattleSession(encounter([party[0]!, party[1]!], enemy, { opening: 'back-attack' })).snapshot().events;
    expect(behind.slice(0, 1).map(e => e.kind === 'attack' && e.target)).toEqual(['back']); // From the rear, the back fighter faces them.
  });

  it('a pincer measures each attack from the attacker’s flank, with each flank on its own grid', () => {
    const party = [fighter('front', { ...cell(2, 1), speed: 1 }), fighter('back', { ...cell(2, 3), speed: 1 })];
    const enc = encounter(party, [fighter('ahead', { flank: 'front', speed: 30 }), fighter('behind', { flank: 'rear', speed: 29 })], { opening: 'pincer' });
    const opening = new BattleSession(enc).snapshot();
    expect(opening.opening).toBe('pincer');
    expect(opening.events.slice(0, 2).map(e => e.kind === 'attack' && `${e.actor}>${e.target}`)).toEqual(['ahead>front', 'behind>back']);
    expect(ids(opening).get('behind')).toMatchObject({ flank: 'rear', lane: 0, depth: 0 }); // Own grid: both enemies at its front.
  });

  it('a big enemy is front-facing through any open lane', () => {
    const enc = encounter([fighter('hero', { speed: 30 })], [fighter('minion', { ...cell(1, 1), speed: 1 }), fighter('giant', { ...cell(1, 2), size: { lanes: 2, depths: 2 }, speed: 1 })]);
    const battle = new BattleSession(enc);
    expect(battle.validate({ type: 'attack', target: 'giant' })).toBeNull(); // Its lower lane is open.
    expect(ids(battle.snapshot()).get('giant')).toMatchObject({ lane: 0, depth: 1, lanes: 2, depths: 2 });
  });

  it('Move goes to an empty cell or swaps with an ally, at Guard’s light cost, and changes who is shielded', () => {
    const enc = encounter([fighter('hero', { ...cell(1, 1), speed: 10 }), fighter('mage', { ...cell(2, 1), speed: 9 })], [fighter('wolf', { speed: 1 })]);
    const battle = new BattleSession(enc);
    const reject = (to: { lane: number; depth: number }) => battle.validate({ type: 'move', to });
    expect([reject({ lane: 0, depth: 0 }), reject({ lane: 3, depth: 0 }), reject({ lane: 0, depth: -1 })]).toEqual(['invalid-cell', 'invalid-cell', 'invalid-cell']);
    const before = battle.snapshot().timeline;
    const moved = battle.command({ type: 'move', to: { lane: 1, depth: 2 } });
    expect(moved.events[0]).toEqual({ kind: 'move', actor: 'hero', from: { lane: 0, depth: 0 }, to: { lane: 1, depth: 2 }, swapped: null });
    expect(ids(moved).get('hero')!.nextTick - before[0]!.tick).toBe(actionDelay(10, ACTION_WEIGHT.move));
    expect(moved.active).toBe('mage');
    const swapped = battle.command({ type: 'move', to: { lane: 1, depth: 2 } });
    expect(swapped.events[0]).toEqual({ kind: 'move', actor: 'mage', from: { lane: 1, depth: 0 }, to: { lane: 1, depth: 2 }, swapped: 'hero' });
    expect(ids(swapped).get('hero')).toMatchObject({ lane: 1, depth: 0 });
  });

  it('keeps the demo encounter on the old rules: one fighter per lane at the front, nobody shielded', () => {
    const demo = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8'))).encounters[0] as Encounter;
    const snapshot = new BattleSession(demo).snapshot();
    expect(snapshot.combatants.map(c => [c.id, c.lane, c.depth, c.reach])).toEqual([['hero', 0, 0, 'melee'], ['sigil', 0, 0, 'melee'], ['shard', 1, 0, 'melee']]);
    expect(snapshot.opening).toBe('normal');
  });

  it('pins seeded traces for a party of four in formation, a big enemy, a back attack and a pincer', () => {
    const run = (enc: Encounter, commands: BattleCommand[]) => {
      const battle = new BattleSession(enc);
      const lines = [battle.snapshot(), ...commands.map(c => battle.command(c))].map(s => s.events.map(e =>
        e.kind === 'attack' ? `${e.actor}>${e.target}:${e.damage}${e.shields ? `/${e.shields}` : ''}` : e.kind === 'move' ? `${e.actor}~${e.to.lane}${e.to.depth}${e.swapped ? `<>${e.swapped}` : ''}` : `${e.actor}:${e.kind}`).join(' '));
      return [...lines, battle.snapshot().combatants.map(c => `${c.id}=${c.hp}`).join(' ')];
    };
    const four = encounter(
      [fighter('knight', { ...cell(1, 1), speed: 12 }), fighter('cleric', { ...cell(1, 2), reach: 'ranged', speed: 9 }),
        fighter('lancer', { ...cell(2, 2), reach: 'reach', speed: 11 }), fighter('ranger', { ...cell(3, 3), reach: 'ranged', speed: 10 })],
      [fighter('ogre', { ...cell(1, 1), size: { lanes: 2, depths: 2 }, hp: 60, attack: 14, speed: 8 }), fighter('imp', { ...cell(3, 2), reach: 'ranged', speed: 13 })],
    );
    expect(run(four, [{ type: 'attack', target: 'ogre' }, { type: 'attack', target: 'imp' }, { type: 'attack', target: 'ogre' }, { type: 'move', to: { lane: 2, depth: 0 } }])).toMatchInlineSnapshot(`
      [
        "imp>knight:9",
        "knight>ogre:10",
        "lancer>imp:9",
        "ranger>ogre:10",
        "cleric~20 ogre>knight:11 imp>knight:11",
        "knight=9 cleric=40 lancer=40 ranger=40 ogre=40 imp=31",
      ]
    `);
    expect(run({ ...four, opening: 'back-attack' }, [{ type: 'attack', target: 'ogre' }, { type: 'guard' }])).toMatchInlineSnapshot(`
      [
        "imp>cleric:9",
        "knight>ogre:10",
        "lancer:guard",
        "knight=40 cleric=31 lancer=40 ranger=40 ogre=50 imp=40",
      ]
    `);
    const pincer = encounter(four.party, [fighter('ogre', { flank: 'front', size: { lanes: 2, depths: 1 }, hp: 60, attack: 14, speed: 8 }), fighter('imp', { flank: 'rear', reach: 'ranged', speed: 13 })], { opening: 'pincer' });
    expect(run(pincer, [{ type: 'attack', target: 'imp' }, { type: 'attack', target: 'ogre' }])).toMatchInlineSnapshot(`
      [
        "imp>cleric:9",
        "knight>imp:10",
        "lancer>ogre:9",
        "knight=40 cleric=31 lancer=40 ranger=40 ogre=51 imp=30",
      ]
    `);
  });
});
