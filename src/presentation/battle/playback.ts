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

/** Grid layout on the 640 × 360 stage (decision 0014 M5.4b). */
export const STAGE_GRID = Object.freeze({
  /** Centre x of each side's front column; the party stands on the right, the enemies on the left, facing each other. */
  partyFrontX: 432, enemyFrontX: 208,
  /** Horizontal step per depth (away from the other side), vertical step per lane, and a slight slant per lane. */
  depthStep: 60, laneStep: 32, laneSlant: 14,
  /** Centre y of the top lane. */
  topY: 116,
});

/**
 * Where a battler stands, and its draw scale: the centre of the grid cells it covers. Lanes stack downwards with a
 * slight slant, so the three lanes overlap a little and the stage stays compact. A big fighter is drawn larger: 2× for
 * one cell, 3× for two cells across, 4× for three.
 */
export function battlerPosition(side: 'party' | 'enemy', p: { readonly lane: number; readonly depth: number; readonly lanes: number; readonly depths: number }): { x: number; y: number; scale: number } {
  const g = STAGE_GRID, lane = p.lane + (p.lanes - 1) / 2, depth = p.depth + (p.depths - 1) / 2;
  const away = depth * g.depthStep + lane * g.laneSlant;
  return {
    x: Math.round(side === 'party' ? g.partyFrontX + away : g.enemyFrontX - away),
    y: Math.round(g.topY + lane * g.laneStep),
    scale: 1 + Math.min(3, Math.max(p.lanes, p.depths)),
  };
}
