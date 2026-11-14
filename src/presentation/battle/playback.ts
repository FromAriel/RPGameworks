import type { BattleEvent, BattleSnapshot, Opening } from '../../domain/battle';

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
  /** Centre y of the top lane, for the default floor (no skin; M5.3c's windows). */
  topY: 112,
});

/**
 * A pincer (decision 0014 M5.4e, Ariel: party in the middle) fits three grids on the stage: the front flank on the left,
 * the party centred and facing both ways, the rear flank on the right. The party keeps the ordinary column step, so its
 * members have room to move (Ariel, M5.4e: animated battlers will need it); the enemy flanks use a narrower step and a
 * smaller lane slant, out toward the stage edges, 80 pixels clear of the party on each side.
 */
export const PINCER_GRID = Object.freeze({ partyFrontX: 252, frontFlankX: 172, rearFlankX: 468, enemyStep: 44, laneSlant: 8 });

/** Horizontal spacing for a side in an opening: the column step and the slant per lane. */
export function gridSpacing(opening: Opening = 'normal', side: 'party' | 'enemy' = 'party'): { depthStep: number; laneSlant: number } {
  if (opening !== 'pincer') return { depthStep: STAGE_GRID.depthStep, laneSlant: STAGE_GRID.laneSlant };
  return { depthStep: side === 'party' ? STAGE_GRID.depthStep : PINCER_GRID.enemyStep, laneSlant: PINCER_GRID.laneSlant };
}

/** The floor band the lanes must fit in: from below the turn timeline down to the top of the bottom windows. */
export interface StageFloor { readonly top: number; readonly bottom: number }
/** Room a 2× battler needs above its centre (sprite top) and below it (its HP bar and a margin). */
const ABOVE = 34, BELOW = 46;

/**
 * Lane centres for a floor: the top lane as high as the floor allows (but no higher than the default), the lanes no
 * further apart than the default step, and the bottom lane's HP bar clear of the windows whatever the battle skin's
 * window size (decision 0014 M5.4c: six commands can make a thick skin's windows taller).
 */
export function laneLayout(floor?: StageFloor): { topY: number; laneStep: number } {
  if (!floor) return { topY: STAGE_GRID.topY, laneStep: STAGE_GRID.laneStep };
  const topY = Math.max(STAGE_GRID.topY, floor.top + ABOVE);
  return { topY, laneStep: Math.max(16, Math.min(STAGE_GRID.laneStep, Math.floor((floor.bottom - BELOW - topY) / 2))) };
}

/**
 * Where a battler stands, and its draw scale: the centre of the grid cells it covers. Lanes stack downwards with a
 * slight slant, so the three lanes overlap a little and the stage stays compact. A big fighter is drawn larger: 2× for
 * one cell, 3× for two cells across, 4× for three.
 */
export interface StagePlacement { readonly lane: number; readonly depth: number; readonly lanes: number; readonly depths: number; readonly flank?: 'front' | 'rear' | null }
/**
 * Where a battler stands for an opening (decision 0014 M5.4e, Ariel's answers):
 * - normal: the party on the right with its front column nearest the enemies on the left;
 * - back attack: the party turns around, so its back column stands nearest the enemies and its front line at the far right;
 * - pincer: front-flank enemies on the left, the party in the middle (front column toward them), rear-flank enemies on the right.
 */
export function battlerPosition(side: 'party' | 'enemy', p: StagePlacement, floor?: StageFloor, opening: Opening = 'normal'): { x: number; y: number; scale: number } {
  const g = STAGE_GRID, { depthStep, laneSlant } = gridSpacing(opening, side), lane = p.lane + (p.lanes - 1) / 2;
  const depth = p.depth + (p.depths - 1) / 2, lanes = laneLayout(floor);
  const away = (d: number) => d * depthStep + lane * laneSlant;
  const x = opening === 'pincer'
    ? (side === 'party' ? PINCER_GRID.partyFrontX + away(depth) : p.flank === 'rear' ? PINCER_GRID.rearFlankX + away(depth) : PINCER_GRID.frontFlankX - away(depth))
    : side === 'party' ? g.partyFrontX + away(opening === 'back-attack' ? 2 - depth : depth) : g.enemyFrontX - away(depth);
  return {
    x: Math.round(x),
    y: Math.round(lanes.topY + lane * lanes.laneStep),
    scale: 1 + Math.min(3, Math.max(p.lanes, p.depths)),
  };
}
