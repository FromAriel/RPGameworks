import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../src/domain/battle';
import { battlerPosition, hpBefore, nextSpeed, stepDuration, PLAYBACK_SPEEDS } from '../../src/presentation/battle/playback';
import { readEncounters } from '../../src/content/validation.mjs';
import type { BattleEvent, Encounter } from '../../src/domain/battle';

const practice = readEncounters(JSON.parse(readFileSync('content/games/demo/encounters.json', 'utf8'))).encounters[0]! as Encounter;

describe('battle playback timing', () => {
  it('shortens every step with speed and cycles 1×, 2×, 4×', () => {
    const attack: BattleEvent = { kind: 'attack', actor: 'a', target: 'b', damage: 3, guarded: false, defeated: false, shields: 0 };
    expect(PLAYBACK_SPEEDS.map(speed => stepDuration(attack, speed))).toEqual([560, 280, 140]);
    expect(stepDuration({ kind: 'guard', actor: 'a' }, 4)).toBe(95); // Rounds up to whole milliseconds.
    expect([nextSpeed(1), nextSpeed(2), nextSpeed(4)]).toEqual([2, 4, 1]);
  });

  it('reconstructs the HP shown before a resolution from its events, without touching the session', () => {
    const battle = new BattleSession(practice, new Map([['demo:item.tonic', { heal: 12 }]]));
    const opening = battle.snapshot();
    const openingBefore = hpBefore(opening, opening.events);
    expect(Object.fromEntries(openingBefore)).toEqual({ hero: 30, sigil: 20, shard: 10 });
    const before = Object.fromEntries(battle.snapshot().combatants.map(c => [c.id, c.hp]));
    const after = battle.command({ type: 'attack', target: 'shard' });
    expect(Object.fromEntries(hpBefore(after, after.events))).toEqual(before);
    const healed = battle.command({ type: 'item', itemId: 'demo:item.tonic', target: 'hero' });
    const hpAfterAttack = Object.fromEntries(after.combatants.map(c => [c.id, c.hp]));
    expect(Object.fromEntries(hpBefore(healed, healed.events))).toEqual(hpAfterAttack);
  });

  it('places every grid cell of both sides inside 640 × 360, apart and facing each other (decision 0014 M5.4b)', () => {
    const cells = [0, 1, 2].flatMap(lane => [0, 1, 2].map(depth => ({ lane, depth, lanes: 1, depths: 1 })));
    const party = cells.map(c => battlerPosition('party', c)), enemies = cells.map(c => battlerPosition('enemy', c));
    for (const { x, y, scale } of [...party, ...enemies]) {
      expect(scale).toBe(2);
      expect(x - 40).toBeGreaterThanOrEqual(0); expect(x + 40).toBeLessThanOrEqual(640);
      expect(y - 20 * scale).toBeGreaterThanOrEqual(72); expect(y + 19 * scale + 5).toBeLessThanOrEqual(224); // Below the timeline, HP bar above the bottom windows.
    }
    expect(Math.min(...party.map(p => p.x))).toBeGreaterThan(Math.max(...enemies.map(e => e.x)) + 96);
    expect(new Set([...party, ...enemies].map(({ x, y }) => `${x},${y}`)).size).toBe(18);
    // Front columns face each other; a lane further down sits lower; a big fighter is centred on its cells, drawn larger.
    expect(battlerPosition('party', { lane: 0, depth: 0, lanes: 1, depths: 1 }).x).toBeLessThan(battlerPosition('party', { lane: 0, depth: 1, lanes: 1, depths: 1 }).x);
    expect(battlerPosition('enemy', { lane: 0, depth: 0, lanes: 1, depths: 1 }).x).toBeGreaterThan(battlerPosition('enemy', { lane: 0, depth: 1, lanes: 1, depths: 1 }).x);
    expect(battlerPosition('enemy', { lane: 0, depth: 0, lanes: 2, depths: 2 })).toEqual({ x: 171, y: 128, scale: 3 });
    // A thick battle skin makes the bottom windows taller: the lanes close up so the bottom lane's HP bar stays clear.
    const floor = { top: 84, bottom: 200 };
    for (const lane of [0, 1, 2]) {
      const { y, scale } = battlerPosition('party', { lane, depth: 0, lanes: 1, depths: 1 }, floor);
      expect(y + 19 * scale + 5).toBeLessThanOrEqual(floor.bottom);
      expect(y - 20 * scale).toBeGreaterThanOrEqual(floor.top - 12); // The 4-pixel sprite pad may overhang the strip.
    }
  });
});
