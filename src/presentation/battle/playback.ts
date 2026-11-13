import type { BattleEvent, BattleSnapshot } from '../../domain/battle';

/**
 * Presentation timing for already-resolved battle events (M5.3b). Nothing here reads or changes battle rules:
 * playback only replays the events a BattleSession returned, so speed and skipping cannot change outcomes.
 */
export const PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

const BASE_MS: Record<BattleEvent['kind'], number> = { attack: 560, guard: 380, heal: 460, move: 420, escape: 520 };

export function stepDuration(event: BattleEvent, speed: PlaybackSpeed): number {
  return Math.ceil(BASE_MS[event.kind] / speed);
}

export function nextSpeed(speed: PlaybackSpeed): PlaybackSpeed {
  return PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(speed) + 1) % PLAYBACK_SPEEDS.length]!;
}

/** HP for each combatant just before `events` resolved, reconstructed from the resulting snapshot. */
export function hpBefore(after: BattleSnapshot, events: readonly BattleEvent[]): Map<string, number> {
  const hp = new Map(after.combatants.map(combatant => [combatant.id, combatant.hp]));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.kind === 'attack') hp.set(event.target, hp.get(event.target)! + event.damage);
    else if (event.kind === 'heal') hp.set(event.target, hp.get(event.target)! - event.amount);
  }
  return hp;
}

/** Screen positions in the 640 × 360 battle view: enemies on the left, the party on the right, facing each other. */
export function battlerPosition(side: 'party' | 'enemy', slot: number): { x: number; y: number } {
  return side === 'enemy'
    ? { x: 200 - (slot % 3) * 64, y: 128 + (slot % 3) * 22 + Math.floor(slot / 3) * 8 }
    : { x: 448 + (slot % 4) * 40, y: 128 + (slot % 4) * 22 };
}
