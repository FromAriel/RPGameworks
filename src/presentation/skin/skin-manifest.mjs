/**
 * Window skin manifest, format version 2 (decision 0011 W3.1): a skin declares its own geometry.
 *
 * Pure and DOM-free, so the game (from W3.2), the audit tool and unit tests share one reader:
 *   readSkinManifest(json)  → a validated v2 skin, reading version 1 manifests as v2 with W1's values;
 *   validateSkinV2(skin)    → precise messages for every cross-field problem the schema cannot express;
 *   frameReach(skin)        → how far the frame reaches inward on each side;
 *   contentInsets(skin)     → where content may start: the skin's override, or reach + margin.
 *
 * Plain JavaScript with JSDoc types: Node runs the audit tool without type stripping, and TypeScript checks this file.
 */
import validateStructure from '../../content/generated/windowskin-validator.mjs';

/** @typedef {import('../../content/generated/windowskin').WindowSkinManifestV2} WindowSkinV2 */
/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/** @typedef {{ top: number, right: number, bottom: number, left: number }} Sides */
/** @typedef {'top' | 'right' | 'bottom' | 'left'} Side */
/** @typedef {{ ok: true, skin: WindowSkinV2, sourceVersion: 1 | 2 } | { ok: false, errors: string[] }} ReadResult */

export const DEFAULT_CONTENT_MARGIN = 4;
/** @type {readonly Side[]} */
export const SIDES = Object.freeze(['top', 'right', 'bottom', 'left']);

/** Every role the W1 compositor draws. Other tiles (fill variants, junctions, controls, icons) stay optional. */
export const REQUIRED_TILES = Object.freeze([
  'corner.tl', 'corner.tr', 'corner.bl', 'corner.br',
  'edge.top.left', 'edge.top.right', 'edge.bottom.left', 'edge.bottom.right',
  'edge.left.upper', 'edge.left.lower', 'edge.right.upper', 'edge.right.lower',
  'fill.plain', 'title.open', 'title.fill', 'title.close',
  'divider.cap.left', 'divider.cap.right', 'divider.h.repeat', 'divider.h.plain', 'divider.label.open', 'divider.label.close',
]);

/** Rail tiles per side; their thickness across the edge must equal that side's band. */
const RAILS = /** @type {const} */ ({
  top: ['edge.top.left', 'edge.top.right'],
  bottom: ['edge.bottom.left', 'edge.bottom.right'],
  left: ['edge.left.upper', 'edge.left.lower'],
  right: ['edge.right.upper', 'edge.right.lower'],
});
/** The two corners on each side, in drawing order along that edge. */
const CORNERS = /** @type {const} */ ({
  top: ['corner.tl', 'corner.tr'], bottom: ['corner.bl', 'corner.br'],
  left: ['corner.tl', 'corner.bl'], right: ['corner.tr', 'corner.br'],
});
const DIVIDER = ['divider.cap.left', 'divider.cap.right', 'divider.h.repeat', 'divider.h.plain', 'divider.label.open', 'divider.label.close'];

const horizontal = (/** @type {Side} */ side) => side === 'top' || side === 'bottom';
/** Thickness across the edge on this side. */
const across = (/** @type {Side} */ side, /** @type {Rect} */ r) => (horizontal(side) ? r.h : r.w);
/** Length along the edge on this side. */
const along = (/** @type {Side} */ side, /** @type {Rect} */ r) => (horizontal(side) ? r.w : r.h);

/**
 * Read a manifest of either version and validate it.
 * @param {unknown} value parsed JSON
 * @returns {ReadResult}
 */
export function readSkinManifest(value) {
  const version = isObject(value) ? value.formatVersion : undefined;
  if (version === 1) {
    const problems = v1Problems(value);
    if (problems.length) return { ok: false, errors: problems };
    const skin = fromV1(/** @type {any} */ (value));
    const errors = validateSkinV2(skin);
    return errors.length ? { ok: false, errors } : { ok: true, skin, sourceVersion: 1 };
  }
  if (version === 2) {
    if (!validateStructure(value)) {
      const first = validateStructure.errors?.[0];
      return { ok: false, errors: [`Manifest structure: ${first?.instancePath || '/'} ${first?.message ?? 'is invalid'}`] };
    }
    const errors = validateSkinV2(value);
    return errors.length ? { ok: false, errors } : { ok: true, skin: value, sourceVersion: 2 };
  }
  return { ok: false, errors: [`Unsupported window skin formatVersion: ${JSON.stringify(version)} (expected 1 or 2)`] };
}

/**
 * Read a W1 (version 1) manifest as v2 with exactly today's behaviour: 16-pixel bands, the title text centred on the
 * rail centre with a 4-pixel gap to its brackets (layout.ts), side and bottom medallions on edges of at least 96,
 * no top medallion, W1's mirrored-end spacing, and the right edge's plain gaps stretched from its rail's first row
 * (the derived connector in paint.ts). The declared content insets become overrides.
 * @param {any} v1
 * @returns {WindowSkinV2}
 */
export function fromV1(v1) {
  const band = v1.frame.band;
  /** @type {WindowSkinV2['geometry']['rails']['top']} */
  const h = { spacing: 'mirrored-end', gapFill: { tile: 'edge.h.plain' } };
  return {
    format: 'rpgameworks.windowskin', formatVersion: 2, theme: v1.theme, image: v1.image,
    size: { width: v1.size.width, height: v1.size.height },
    geometry: {
      band: { top: band, right: band, bottom: band, left: band },
      title: { textCenter: v1.frame.railCenter, textGap: 4 },
      rails: {
        top: h, bottom: { ...h },
        left: { spacing: 'mirrored-end', gapFill: { tile: 'edge.v.plain' } },
        right: { spacing: 'mirrored-end', gapFill: { railEdge: 'start' } },
      },
      midpoints: { right: { minEdge: 96 }, bottom: { minEdge: 96 }, left: { minEdge: 96 } },
      contentMargin: DEFAULT_CONTENT_MARGIN,
      contentInsets: { ...v1.frame.contentInsets },
    },
    tiles: v1.tiles.map((/** @type {{ id: string, rect: Rect }} */ t) => ({ id: t.id, rect: { ...t.rect } })),
  };
}

/** @param {any} v @returns {string[]} */
function v1Problems(v) {
  const problems = [];
  const int = (/** @type {unknown} */ n) => Number.isInteger(n) && /** @type {number} */ (n) >= 0;
  if (v.format !== 'rpgameworks.windowskin') problems.push('v1: format must be "rpgameworks.windowskin"');
  if (typeof v.theme !== 'string' || typeof v.image !== 'string') problems.push('v1: theme and image must be strings');
  if (!isObject(v.size) || !int(v.size.width) || !int(v.size.height)) problems.push('v1: size needs integer width and height');
  const f = v.frame;
  if (!isObject(f) || !int(f.band) || !int(f.railCenter) || !isObject(f.contentInsets) || !SIDES.every((s) => int(f.contentInsets[s]))) {
    problems.push('v1: frame needs integer band, railCenter and contentInsets.top/right/bottom/left');
  }
  if (!Array.isArray(v.tiles) || !v.tiles.every((/** @type {any} */ t) => isObject(t) && typeof t.id === 'string' && isObject(t.rect)
    && ['x', 'y', 'w', 'h'].every((k) => int(t.rect[k])))) {
    problems.push('v1: every tile needs a string id and an integer rect');
  }
  return problems;
}

/**
 * Resolve every tile id to its rectangle, following "same" aliases.
 * @param {WindowSkinV2} skin
 * @returns {Map<string, Rect>}
 */
export function tileRects(skin) {
  /** @type {Map<string, Rect>} */
  const own = new Map();
  for (const t of skin.tiles) if (t.rect) own.set(t.id, t.rect);
  /** @type {Map<string, Rect>} */
  const all = new Map(own);
  for (const t of skin.tiles) {
    const target = t.same === undefined ? undefined : own.get(t.same);
    if (target) all.set(t.id, target);
  }
  return all;
}

/**
 * Cross-field rules the schema cannot express. Every message names the tiles, sides or values involved.
 * @param {WindowSkinV2} skin
 * @returns {string[]}
 */
export function validateSkinV2(skin) {
  const errors = [];
  const { width: W, height: H } = skin.size;
  const g = skin.geometry;
  /** @type {Map<string, (typeof skin.tiles)[number]>} */
  const byId = new Map();
  for (const t of skin.tiles) {
    if (byId.has(t.id)) errors.push(`Duplicate tile id: ${t.id}`);
    byId.set(t.id, t);
  }
  for (const t of skin.tiles) {
    if ((t.rect === undefined) === (t.same === undefined)) errors.push(`Tile ${t.id} needs exactly one of "rect" or "same"`);
    if (t.same !== undefined) {
      const target = byId.get(t.same);
      if (t.same === t.id) errors.push(`Tile ${t.id} cannot reuse itself`);
      else if (!target) errors.push(`Tile ${t.id} reuses ${t.same}, which does not exist`);
      else if (!target.rect) errors.push(`Tile ${t.id} reuses ${t.same}, which is itself an alias; point at the tile that has the rectangle`);
    }
    if (t.outset && (t.outset.x || t.outset.y)) {
      errors.push(`Tile ${t.id} reaches outside the window box (outset ${t.outset.x}, ${t.outset.y}); outward overhang is not supported yet (decision 0011 D10)`);
    }
    if (t.rect) {
      const r = t.rect;
      if (r.x + r.w > W || r.y + r.h > H) errors.push(`Tile ${t.id} (${describe(r)}) lies outside the ${W} × ${H} atlas`);
    }
  }
  const owned = skin.tiles.filter((t) => t.rect);
  for (let i = 0; i < owned.length; i++) {
    for (let j = i + 1; j < owned.length; j++) {
      const a = /** @type {Rect} */ (owned[i]?.rect), b = /** @type {Rect} */ (owned[j]?.rect);
      const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
      if (x0 < x1 && y0 < y1) {
        errors.push(`Tiles ${owned[i]?.id} and ${owned[j]?.id} overlap at x ${x0}, y ${y0} (${x1 - x0} × ${y1 - y0}); use "same" to reuse art`);
      }
    }
  }
  const rects = tileRects(skin);
  const missing = REQUIRED_TILES.filter((id) => !rects.has(id));
  for (const id of missing) errors.push(`Missing required tile: ${id}`);
  for (const side of SIDES) if (g.band[side] < 1) errors.push(`band.${side} must be at least 1 pixel`);
  if (missing.length || errors.length) return errors; // The geometry checks below need every role and a sane band.

  const r = (/** @type {string} */ id) => /** @type {Rect} */ (rects.get(id));
  for (const side of SIDES) {
    for (const id of RAILS[side]) {
      const thick = across(side, r(id));
      if (thick !== g.band[side]) errors.push(`${id} is ${thick} pixels thick, but the ${side} band is ${g.band[side]}`);
    }
    const fill = g.rails[side].gapFill;
    if ((fill.tile === undefined) === (fill.railEdge === undefined)) {
      errors.push(`rails.${side}.gapFill needs exactly one of "tile" or "railEdge"`);
    } else if (fill.tile !== undefined) {
      const plain = rects.get(fill.tile);
      if (!plain) errors.push(`rails.${side}.gapFill uses ${fill.tile}, which does not exist`);
      else if (across(side, plain) !== g.band[side]) {
        errors.push(`rails.${side}.gapFill tile ${fill.tile} is ${across(side, plain)} pixels thick, but the ${side} band is ${g.band[side]}`);
      }
    }
    for (const id of CORNERS[side]) {
      const thick = across(side, r(id));
      if (thick < g.band[side]) {
        errors.push(`${id} is ${thick} pixels deep on the ${side} side, thinner than the ${side} band (${g.band[side]}); the rail would show past it`);
      }
    }
  }
  const titleBand = r('title.open').h;
  if (r('title.fill').h !== titleBand || r('title.close').h !== titleBand) {
    errors.push(`title.open, title.fill and title.close must share one height (${r('title.open').h}, ${r('title.fill').h}, ${r('title.close').h})`);
  } else {
    if (titleBand < g.band.top) errors.push(`The title band (${titleBand}) is thinner than the top band (${g.band.top}); the rail would show around the title`);
    if (g.title.textCenter >= titleBand) errors.push(`title.textCenter (${g.title.textCenter}) must lie inside the title band (0–${titleBand - 1})`);
  }
  const dividerHeights = DIVIDER.map((id) => r(id).h);
  if (new Set(dividerHeights).size !== 1) errors.push(`Divider tiles must share one height (${DIVIDER.map((id, i) => `${id} ${dividerHeights[i]}`).join(', ')})`);
  for (const side of SIDES) {
    const mid = g.midpoints?.[side];
    if (!mid) continue;
    const tile = rects.get(`mid.${side}`);
    if (!tile) { errors.push(`midpoints.${side} is enabled but tile mid.${side} does not exist`); continue; }
    if (across(side, tile) < g.band[side]) errors.push(`mid.${side} is ${across(side, tile)} pixels thick, thinner than the ${side} band (${g.band[side]})`);
    const [a, b] = CORNERS[side];
    const needed = along(side, r(a)) + along(side, tile) + along(side, r(b));
    if (mid.minEdge < needed) errors.push(`midpoints.${side}.minEdge (${mid.minEdge}) is shorter than ${a}, mid.${side} and ${b} together (${needed}); the medallion would overlap a corner`);
  }
  if (g.contentInsets) {
    const reach = frameReach(skin);
    for (const side of SIDES) {
      if (g.contentInsets[side] < reach[side]) {
        errors.push(`contentInsets.${side} (${g.contentInsets[side]}) would put content on the frame, which reaches ${reach[side]} pixels in on that side`);
      }
    }
  }
  return errors;
}

/**
 * How far the frame reaches inward on each side: the deepest of the band, the corners, the title band (top) and an
 * enabled medallion. Call only on a skin that passed validateSkinV2.
 * @param {WindowSkinV2} skin
 * @returns {Sides}
 */
export function frameReach(skin) {
  const rects = tileRects(skin), g = skin.geometry;
  const depth = (/** @type {Side} */ side, /** @type {string} */ id) => {
    const rect = rects.get(id);
    return rect ? across(side, rect) : 0;
  };
  /** @type {Sides} */
  const reach = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const side of SIDES) {
    const parts = [g.band[side], ...CORNERS[side].map((id) => depth(side, id))];
    if (g.midpoints?.[side]) parts.push(depth(side, `mid.${side}`));
    if (side === 'top') parts.push(depth(side, 'title.open'));
    reach[side] = Math.max(...parts);
  }
  return reach;
}

/**
 * Content insets: the skin's explicit override, or frame reach plus the content margin (default 4).
 * @param {WindowSkinV2} skin
 * @returns {Sides}
 */
export function contentInsets(skin) {
  const override = skin.geometry.contentInsets;
  if (override) return { top: override.top, right: override.right, bottom: override.bottom, left: override.left };
  const reach = frameReach(skin), margin = skin.geometry.contentMargin ?? DEFAULT_CONTENT_MARGIN;
  return { top: reach.top + margin, right: reach.right + margin, bottom: reach.bottom + margin, left: reach.left + margin };
}

/** @param {Rect} r */
const describe = (r) => `x ${r.x}, y ${r.y}, ${r.w} × ${r.h}`;
/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
