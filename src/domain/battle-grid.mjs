/**
 * Battle grid rules (decision 0014, Ariel's 3 × 3 grid). Pure functions shared by the content build and the battle
 * kernel: placement, who stands between a fighter and an attacker, reach, shields and area falloff.
 *
 * Coordinates are 0-based here: lane 0 (top) to 2 (bottom), depth 0 (front) to 2 (back). Content files use 1-based
 * numbers. "Front" means the side facing the opponents in an ordinary fight; a back attack or a pincer measures from
 * the attacker's side instead, with the same functions.
 */

export const GRID = 3;
/** Damage percentages by shield count: none, one living ally ahead in the lane, two (decision 0014: 20% and 35% less). */
export const SHIELD_PERCENT = Object.freeze([100, 80, 65]);
/** Area damage percentages by steps from the centre (across plus down): 0 to 4 (opposite corner). */
export const AREA_PERCENT = Object.freeze([100, 80, 65, 50, 34]);
/** Area shapes. Lines hit every fighter on them at full strength. */
export const AREA_SHAPES = Object.freeze(['radius', 'lane', 'column', 'diagonal-down', 'diagonal-up']);

/** @typedef {{ lane: number, depth: number, lanes: number, depths: number }} Placement */
/** @typedef {'front' | 'rear'} Direction */
/** @typedef {'melee' | 'reach' | 'ranged'} Reach */
/** @typedef {{ cell?: { lane: number, depth: number }, size?: { lanes: number, depths: number } }} Placeable */
/** @typedef {{ index: number, field: string, message: string }} PlacementIssue */

/**
 * Place one grid's fighters. A grid places all its fighters or none; unplaced grids fill the front column top to
 * bottom, then the middle, then the back (Ariel, November 12), so up to three fighters are all front-facing.
 * @param {readonly Placeable[]} fighters
 * @returns {{ placements: Placement[], issues: PlacementIssue[] }}
 */
export function placeGrid(fighters) {
  /** @type {PlacementIssue[]} */ const issues = [];
  const placed = fighters.filter((f) => f.cell !== undefined).length;
  if (placed && placed !== fighters.length) {
    fighters.forEach((f, index) => { if (!f.cell) issues.push({ index, field: 'cell', message: 'Place every fighter on this side of the grid, or none' }); });
    return { placements: [], issues };
  }
  /** @type {Placement[]} */ const placements = [];
  const taken = new Map();
  fighters.forEach((f, index) => {
    const lanes = f.size?.lanes ?? 1, depths = f.size?.depths ?? 1;
    let lane, depth;
    if (placed) { lane = /** @type {{lane:number}} */ (f.cell).lane - 1; depth = /** @type {{depth:number}} */ (f.cell).depth - 1; }
    else {
      const free = firstFree(taken, lanes, depths);
      if (!free) { issues.push({ index, field: 'size', message: 'No room left on the grid for this fighter' }); return; }
      ({ lane, depth } = free);
    }
    if (lane + lanes > GRID || depth + depths > GRID) { issues.push({ index, field: placed ? 'cell' : 'size', message: 'The fighter does not fit inside the 3 × 3 grid' }); return; }
    for (const [l, d] of cells({ lane, depth, lanes, depths })) {
      const key = `${l},${d}`;
      if (taken.has(key)) { issues.push({ index, field: 'cell', message: `Overlaps another fighter at lane ${l + 1}, depth ${d + 1}` }); return; }
    }
    for (const [l, d] of cells({ lane, depth, lanes, depths })) taken.set(`${l},${d}`, index);
    placements[index] = { lane, depth, lanes, depths };
  });
  return { placements, issues };
}

/** @param {Map<string, number>} taken @param {number} lanes @param {number} depths */
function firstFree(taken, lanes, depths) {
  for (let depth = 0; depth + depths <= GRID; depth++) {
    for (let lane = 0; lane + lanes <= GRID; lane++) {
      if (cells({ lane, depth, lanes, depths }).every(([l, d]) => !taken.has(`${l},${d}`))) return { lane, depth };
    }
  }
  return null;
}

/** Every [lane, depth] a placement covers. @param {Placement} p @returns {[number, number][]} */
export function cells(p) {
  /** @type {[number, number][]} */ const out = [];
  for (let l = p.lane; l < p.lane + p.lanes; l++) for (let d = p.depth; d < p.depth + p.depths; d++) out.push([l, d]);
  return out;
}

/**
 * How many living allies stand between `target` and an attacker coming from `from`, in the target's most open lane
 * (a big fighter is exposed through any open lane; Ariel, November 12). 0 means front-facing.
 * @param {Placement} target
 * @param {readonly Placement[]} livingAllies the target's living allies on the same grid, not including the target
 * @param {Direction} from
 */
export function alliesAhead(target, livingAllies, from) {
  let fewest = Infinity;
  for (let lane = target.lane; lane < target.lane + target.lanes; lane++) {
    const count = livingAllies.filter((a) => lane >= a.lane && lane < a.lane + a.lanes && (from === 'front'
      ? a.depth + a.depths - 1 < target.depth
      : a.depth > target.depth + target.depths - 1)).length;
    fewest = Math.min(fewest, count);
  }
  return fewest === Infinity ? 0 : fewest;
}

/** Whether an attack with this reach can hit a target with `ahead` living allies in front of it. @param {Reach} reach @param {number} ahead */
export function canReach(reach, ahead) {
  return reach === 'ranged' || ahead <= (reach === 'reach' ? 1 : 0);
}

/** @param {number} ahead */
export function shieldPercent(ahead) {
  return /** @type {number} */ (SHIELD_PERCENT[Math.min(ahead, SHIELD_PERCENT.length - 1)]);
}

/** Steps across plus down between the nearest cells of two placements. @param {Placement} a @param {Placement} b */
export function steps(a, b) {
  let best = Infinity;
  for (const [la, da] of cells(a)) for (const [lb, db] of cells(b)) best = Math.min(best, Math.abs(la - lb) + Math.abs(da - db));
  return best;
}

/** @param {number} distance */
export function areaPercent(distance) {
  return /** @type {number} */ (AREA_PERCENT[Math.min(distance, AREA_PERCENT.length - 1)]);
}

/**
 * Who an area attack centred on `centre` hits on one grid, and at what percentage. Radius falls off by steps; lines
 * (the centre's lane, its front column, or a diagonal through its top front cell) hit at full strength.
 * @param {(typeof AREA_SHAPES)[number]} shape
 * @param {Placement} centre
 * @param {readonly Placement[]} fighters everyone on that grid who can be hit, the centre included
 * @returns {{ index: number, percent: number }[]}
 */
export function areaHits(shape, centre, fighters) {
  /** @type {{ index: number, percent: number }[]} */ const hits = [];
  fighters.forEach((f, index) => {
    if (shape === 'radius') { hits.push({ index, percent: areaPercent(steps(centre, f)) }); return; }
    const on = cells(f).some(([l, d]) => shape === 'lane' ? l === centre.lane
      : shape === 'column' ? d === centre.depth
        : shape === 'diagonal-down' ? l - d === centre.lane - centre.depth
          : l + d === centre.lane + centre.depth);
    if (on) hits.push({ index, percent: 100 });
  });
  return hits;
}

/**
 * Damage after percentage factors (guard, shield, area): rounds up, at least 1. Integer arithmetic, so the same
 * numbers give the same result in every browser.
 * @param {number} raw @param {readonly number[]} percents
 */
export function scaleDamage(raw, percents) {
  let numerator = raw, denominator = 1;
  for (const p of percents) { numerator *= p; denominator *= 100; }
  return Math.max(1, Math.floor((numerator + denominator - 1) / denominator));
}
