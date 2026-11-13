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

  it('places up to four allies and six enemies inside 640 × 360, apart and facing each other', () => {
    const party = [0, 1, 2, 3].map(slot => battlerPosition('party', slot));
    const enemies = [0, 1, 2, 3, 4, 5].map(slot => battlerPosition('enemy', slot));
    for (const { x, y } of [...party, ...enemies]) {
      expect(x - 32).toBeGreaterThanOrEqual(0); expect(x + 32).toBeLessThanOrEqual(640);
      expect(y - 32).toBeGreaterThanOrEqual(48); expect(y + 60).toBeLessThanOrEqual(360);
    }
    expect(Math.min(...party.map(p => p.x))).toBeGreaterThan(Math.max(...enemies.map(e => e.x)) + 96);
    const keys = new Set([...party, ...enemies].map(({ x, y }) => `${x},${y}`));
    expect(keys.size).toBe(10);
  });
});
