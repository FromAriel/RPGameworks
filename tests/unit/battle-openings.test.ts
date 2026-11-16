import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readEncounters, readParty } from '../../src/content/validation.mjs';
import { BattleSession } from '../../src/domain/battle';
import { battleEncounter, defaultParty } from '../../src/domain/party';
import { battlerPosition } from '../../src/presentation/battle/playback';

/** Decision 0014 M5.4e: where each side stands in a back attack and a pincer (Ariel's answers), and the two drills. */
const one = (lane: number, depth: number, flank?: 'front' | 'rear') => ({ lane, depth, lanes: 1, depths: 1, ...(flank ? { flank } : {}) });
const roster = readParty(JSON.parse(readFileSync('content/games/demo/party.json', 'utf8')));
const encounters = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8')), 'encounters.json', undefined, undefined, roster).encounters;
const drill = (id: string) => new BattleSession(battleEncounter(encounters.find(e => e.id === `demo:encounter.${id}`)!, roster, defaultParty(roster)));

describe('the stage for each opening', () => {
  it('keeps an ordinary fight exactly where it was', () => {
    for (let lane = 0; lane < 3; lane++) for (let depth = 0; depth < 3; depth++) {
      expect(battlerPosition('party', one(lane, depth), undefined, 'normal')).toEqual(battlerPosition('party', one(lane, depth)));
      expect(battlerPosition('enemy', one(lane, depth), undefined, 'normal')).toEqual(battlerPosition('enemy', one(lane, depth)));
    }
  });

  it('lays the lanes out like bricks: the top and bottom lanes line up, the middle one shifted half a column', () => {
    for (const side of ['party', 'enemy'] as const) for (let depth = 0; depth < 3; depth++) {
      const [top, middle, bottom] = [0, 1, 2].map(lane => battlerPosition(side, one(lane, depth)));
      expect(top!.x).toBe(bottom!.x);
      expect(Math.abs(middle!.x - top!.x)).toBe(30); // Half of the 60-pixel column.
      expect(Math.sign(middle!.x - top!.x)).toBe(side === 'party' ? 1 : -1); // Away from the other side.
    }
  });

  it('turns the party around in a back attack: its back column stands nearest the enemies', () => {
    for (let lane = 0; lane < 3; lane++) {
      const xs = [0, 1, 2].map(depth => battlerPosition('party', one(lane, depth), undefined, 'back-attack').x);
      expect(xs[2]).toBeLessThan(xs[1]!); expect(xs[1]).toBeLessThan(xs[0]!);
      expect(xs[2]).toBe(battlerPosition('party', one(lane, 0)).x); // The back column takes the front column's place.
    }
    expect(battlerPosition('enemy', one(1, 1), undefined, 'back-attack')).toEqual(battlerPosition('enemy', one(1, 1)));
  });

  it('puts the party in the middle of a pincer, every cell of all three grids on the stage and in order', () => {
    const xs = (side: 'party' | 'enemy', flank?: 'front' | 'rear') => [0, 1, 2].flatMap(lane => [0, 1, 2].map(depth => battlerPosition(side, one(lane, depth, flank), undefined, 'pincer').x));
    const front = xs('enemy', 'front'), party = xs('party'), rear = xs('enemy', 'rear');
    expect(Math.max(...front)).toBeLessThan(Math.min(...party));
    expect(Math.max(...party)).toBeLessThan(Math.min(...rear));
    for (const x of [...front, ...party, ...rear]) { expect(x - 40).toBeGreaterThanOrEqual(0); expect(x + 40).toBeLessThanOrEqual(640); } // As for an ordinary fight.
    // The party keeps its ordinary 60-pixel columns, room to move for animated battlers (Ariel, M5.4e), and stays
    // at least 80 pixels clear of each flank.
    expect(battlerPosition('party', one(0, 1), undefined, 'pincer').x - battlerPosition('party', one(0, 0), undefined, 'pincer').x).toBe(60);
    // Measured lane by lane, since the lanes are staggered sideways.
    for (let lane = 0; lane < 3; lane++) {
      const at = (xs: number[]) => xs.slice(lane * 3, lane * 3 + 3);
      expect(Math.min(...at(party)) - Math.max(...at(front))).toBeGreaterThanOrEqual(80);
      expect(Math.min(...at(rear)) - Math.max(...at(party))).toBeGreaterThanOrEqual(80);
    }
    // Each flank's front column is nearest the party.
    expect(battlerPosition('enemy', one(0, 0, 'front'), undefined, 'pincer').x).toBeGreaterThan(battlerPosition('enemy', one(0, 2, 'front'), undefined, 'pincer').x);
    expect(battlerPosition('enemy', one(0, 0, 'rear'), undefined, 'pincer').x).toBeLessThan(battlerPosition('enemy', one(0, 2, 'rear'), undefined, 'pincer').x);
    // A big enemy (2 × 2, drawn at 3×) still fits on either flank.
    const big = (flank: 'front' | 'rear') => battlerPosition('enemy', { lane: 1, depth: 1, lanes: 2, depths: 2, flank }, undefined, 'pincer');
    expect(big('front').x - 48).toBeGreaterThanOrEqual(0); expect(big('rear').x + 48).toBeLessThanOrEqual(640);
  });
});

describe('the two practice drills', () => {
  it('Ambush Drill opens from behind: the Bats strike the Archer, exposed at the back of the middle lane', () => {
    const opening = drill('ambush-drill').snapshot();
    expect(opening.opening).toBe('back-attack');
    expect(opening.events.map(e => e.kind === 'attack' ? `${e.actor}>${e.target}` : e.kind)).toEqual(['bat-a>archer', 'bat-b>archer']);
    expect(opening.active).toBe('archer');
  });
  it('Pincer Drill has two flanks of two, each choosing its own target', () => {
    const opening = drill('pincer-drill').snapshot();
    expect(opening.opening).toBe('pincer');
    expect(opening.combatants.filter(c => c.side === 'enemy').map(c => [c.id, c.flank])).toEqual([['golem-a', 'front'], ['bat-a', 'front'], ['bat-b', 'rear'], ['golem-b', 'rear']]);
    expect(opening.events.map(e => e.kind === 'attack' ? `${e.actor}>${e.target}` : e.kind)).toEqual(['bat-a>hero', 'bat-b>archer']);
  });
});
