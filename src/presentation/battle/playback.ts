import type { BattleEvent, BattleSnapshot, Cell, Opening } from '../../domain/battle';
import { areaPercent } from '../../domain/battle-grid.mjs';

/**
 * Presentation timing for already-resolved battle events (M5.3b). Nothing here reads or changes battle rules:
 * playback only replays the events a BattleSession returned, so speed and skipping cannot change outcomes.
 */
export const PLAYBACK_SPEEDS = [1, 2, 4] as const;
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

// Break, stun, recovery, phase and round are told by the action line for now; M5.5c-2 gives them their own effects.
const BASE_MS: Record<BattleEvent['kind'], number> = { attack: 560, guard: 380, heal: 460, move: 420, escape: 520, area: 760,
  break: 620, stunned: 420, recover: 420, phase: 620, round: 420 };

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
    // An absorbed hit healed its target (decision 0018), so undoing it takes HP away.
    if (event.kind === 'attack') hp.set(event.target, hp.get(event.target)! + (event.affinity === 'absorb' ? -event.damage : event.damage));
    else if (event.kind === 'area') for (const hit of event.hits) hp.set(hit.target, hp.get(hit.target)! + (hit.affinity === 'absorb' ? -hit.damage : hit.damage));
    else if (event.kind === 'heal') hp.set(event.target, hp.get(event.target)! - event.amount);
  }
  return hp;
}

/** Grid layout on the 640 × 360 stage (decision 0014 M5.4b). */
export const STAGE_GRID = Object.freeze({
  /** Centre x of each side's front column; the party stands on the right, the enemies on the left, facing each other. */
  partyFrontX: 432, enemyFrontX: 208,
  /**
   * Horizontal step per depth (away from the other side) and vertical step per lane. The floor is too short for three
   * lanes of 64-pixel battlers, so the middle lane is shifted half a column away from the other side, like bricks
   * (Ariel, after M5.4f; it replaced a 14-pixel slant per lane): the top and bottom lanes line up 62 pixels apart and
   * barely overlap.
   */
  depthStep: 60, laneStep: 32,
  /** Centre y of the top lane, for the default floor (no skin; M5.3c's windows). */
  topY: 112,
});

/**
 * A pincer (decision 0014 M5.4e, Ariel: party in the middle) fits three grids on the stage: the front flank on the left,
 * the party centred and facing both ways, the rear flank on the right. The party keeps the ordinary column step, so its
 * members have room to move (Ariel, M5.4e: animated battlers will need it); the enemy flanks use a narrower step, out
 * toward the stage edges, at least 80 pixels clear of the party in every lane.
 */
export const PINCER_GRID = Object.freeze({ partyFrontX: 252, frontFlankX: 172, rearFlankX: 468, enemyStep: 44 });

/** Horizontal column step for a side in an opening. */
export function gridSpacing(opening: Opening = 'normal', side: 'party' | 'enemy' = 'party'): { depthStep: number } {
  return { depthStep: opening === 'pincer' && side === 'enemy' ? PINCER_GRID.enemyStep : STAGE_GRID.depthStep };
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
 * Where a battler stands, and its draw scale: the centre of the grid cells it covers. Lanes stack downwards, the middle
 * one shifted half a column (brick), so the stage stays compact. A big fighter is drawn larger: 2× for one cell, 3×
 * for two cells across, 4× for three.
 */
export interface StagePlacement { readonly lane: number; readonly depth: number; readonly lanes: number; readonly depths: number; readonly flank?: 'front' | 'rear' | null }
/**
 * Where a battler stands for an opening (decision 0014 M5.4e, Ariel's answers):
 * - normal: the party on the right with its front column nearest the enemies on the left;
 * - back attack: the party turns around, so its back column stands nearest the enemies and its front line at the far right;
 * - pincer: front-flank enemies on the left, the party in the middle (front column toward them), rear-flank enemies on the right.
 */
export function battlerPosition(side: 'party' | 'enemy', p: StagePlacement, floor?: StageFloor, opening: Opening = 'normal'): { x: number; y: number; scale: number } {
  const g = STAGE_GRID, { depthStep } = gridSpacing(opening, side), lane = p.lane + (p.lanes - 1) / 2;
  const depth = p.depth + (p.depths - 1) / 2, lanes = laneLayout(floor);
  // The brick shift: half a column for the middle lane, averaged over the lanes a big fighter covers.
  let brick = 0;
  for (let l = p.lane; l < p.lane + p.lanes; l++) brick += (l % 2) * depthStep / 2;
  brick /= p.lanes;
  const away = (d: number) => d * depthStep + brick;
  const x = opening === 'pincer'
    ? (side === 'party' ? PINCER_GRID.partyFrontX + away(depth) : p.flank === 'rear' ? PINCER_GRID.rearFlankX + away(depth) : PINCER_GRID.frontFlankX - away(depth))
    : side === 'party' ? g.partyFrontX + away(opening === 'back-attack' ? 2 - depth : depth) : g.enemyFrontX - away(depth);
  return {
    x: Math.round(x),
    y: Math.round(lanes.topY + lane * lanes.laneStep),
    scale: 1 + Math.min(3, Math.max(p.lanes, p.depths)),
  };
}

/** The share of an area attack a party cell takes (0 when the shape misses it), for lighting the floor. */
export function areaPercentAt(shape: Extract<BattleEvent, { kind: 'area' }>['shape'], centre: Cell, cell: Cell): number {
  if (shape === 'radius') return areaPercent(Math.abs(cell.lane - centre.lane) + Math.abs(cell.depth - centre.depth));
  const on = shape === 'lane' ? cell.lane === centre.lane : shape === 'column' ? cell.depth === centre.depth
    : shape === 'diagonal-down' ? cell.lane - cell.depth === centre.lane - centre.depth : cell.lane + cell.depth === centre.lane + centre.depth;
  return on ? 100 : 0;
}
