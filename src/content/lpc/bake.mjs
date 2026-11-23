import { createHash } from 'node:crypto';
import { resizeWithSettings } from './pixippl-reducer.mjs';

/**
 * LPC party art from committed sheets (decision 0019, roadmap S1.5). Pure RGBA functions shared by the import tool, the
 * tests and (from S1.5c) the content build: reduce a source sheet with Ariel's PixiPPL reducer, recolour by palette
 * ramps, and composite a character's layers into one frame. These are ports of DanJen Delver's bake worker and
 * generator (tools/lpc/bake-worker.mjs, lib/lpc/images.mjs, rules.mjs recolorPixels, node-generator.mjs frame) and must
 * stay pixel-identical to them; the tests compare against references taken from DanJen's cache.
 *
 * @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Rgba
 * @typedef {{ source: string[], target: string[] }} Ramp
 * @typedef {{ file: string, ramps: number[], base?: boolean }} LayerRef
 */

/** SHA-256 of an image's RGBA bytes, for comparing pixels independently of PNG encoding. @param {Rgba} image */
export function rgbaHash(image) { return createHash('sha256').update(image.data).digest('hex'); }

/**
 * Reduce a whole source sheet cell by cell. A cell of 64 becomes 48 (41 reduced, placed at the geometry's offset); the
 * oversized 128 and 192 cells become 96 and 144, centred the same way. Empty cells stay empty.
 * @param {Rgba} source @param {number} cell @param {any} reduction the committed reduction.json
 * @returns {Rgba & { cell: number, cellOut: number }}
 */
export function reduceSheet(source, cell, reduction) {
  const { sourceCell, reducedCell, frame, offset: [ox, oy] } = reduction.geometry;
  if (source.width % cell || source.height % cell) throw new Error(`Sheet ${source.width}×${source.height} is not a whole number of ${cell}-pixel cells`);
  const factor = cell / sourceCell, cellOut = factor * frame, reduced = factor * reducedCell;
  const settings = structuredClone(reduction.reducer);
  settings.recipe.palette.alphaMode = reduction.layerAlphaMode;
  settings.recipe.target = { size: reduced, mode: 'square' };
  settings.canvas = { enabled: true, size: cellOut,
    x: Math.round((cellOut - frame) / 2 + ox - (cell - sourceCell) * reducedCell / (2 * sourceCell)),
    y: Math.round((cellOut - frame) / 2 + oy - (cell - sourceCell) * reducedCell / (2 * sourceCell)) };
  const cols = source.width / cell, rows = source.height / cell;
  const out = { width: cols * cellOut, height: rows * cellOut, data: new Uint8ClampedArray(cols * cellOut * rows * cellOut * 4), cell, cellOut };
  /** @type {Map<string, Rgba>} */ const seen = new Map();
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const piece = extractFrame(source, col, row, cell);
    if (!piece.data.some((value, i) => i % 4 === 3 && value !== 0)) continue;
    const key = rgbaHash(piece);
    let reducedFrame = seen.get(key);
    if (!reducedFrame) { reducedFrame = resizeWithSettings(piece, settings).frame; seen.set(key, /** @type {Rgba} */ (reducedFrame)); }
    for (let y = 0; y < cellOut; y++) {
      out.data.set(/** @type {Rgba} */ (reducedFrame).data.subarray(y * cellOut * 4, (y + 1) * cellOut * 4), ((row * cellOut + y) * out.width + col * cellOut) * 4);
    }
  }
  return out;
}

/** One cell of a sheet. @param {Rgba} image @param {number} col @param {number} row @param {number} size @returns {Rgba} */
export function extractFrame(image, col, row, size) {
  if (col < 0 || row < 0 || (col + 1) * size > image.width || (row + 1) * size > image.height) throw new Error(`Frame out of bounds: ${col},${row},${size}`);
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const start = ((row * size + y) * image.width + col * size) * 4;
    data.set(image.data.subarray(start, start + size * 4), y * size * 4);
  }
  return { width: size, height: size, data };
}

/** Each colour of a ramp's source (within 1 per channel) becomes the same entry of its target. @param {Rgba} image @param {Ramp[]} ramps @returns {Rgba} */
export function recolor(image, ramps) {
  const pairs = ramps.flatMap(ramp => ramp.source.flatMap((color, i) => (ramp.target[i] ? [{ source: hex(color), target: hex(/** @type {string} */ (ramp.target[i])) }] : [])));
  const data = new Uint8ClampedArray(image.data);
  if (!pairs.length) return { width: image.width, height: image.height, data };
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const pair = pairs.find(p => p.source.every((value, c) => Math.abs(/** @type {number} */ (data[i + c]) - value) <= 1));
    if (pair) data.set(pair.target, i);
  }
  return { width: image.width, height: image.height, data };
}

/** @param {string} value */
function hex(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid colour ${value}`);
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
}

/** Source-over composition of same-sized layers, bottom first. @param {Rgba[]} layers @param {number} size @returns {Rgba} */
export function composite(layers, size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (const image of layers) {
    if (image.width !== size || image.height !== size) throw new Error('Layer geometry mismatch');
    for (let i = 0; i < data.length; i += 4) {
      const sa = /** @type {number} */ (image.data[i + 3]) / 255;
      if (!sa) continue;
      const da = /** @type {number} */ (data[i + 3]) / 255, alpha = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) data[i + c] = Math.round((/** @type {number} */ (image.data[i + c]) * sa + /** @type {number} */ (data[i + c]) * da * (1 - sa)) / alpha);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  return { width: size, height: size, data };
}

/** Pixels at or above the threshold become opaque; the rest become fully transparent. @param {Rgba} image @param {number} threshold @returns {Rgba} */
export function binaryAlpha(image, threshold) {
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4) {
    if (/** @type {number} */ (data[i + 3]) < threshold) data.fill(0, i, i + 4);
    else data[i + 3] = 255;
  }
  return { ...image, data };
}

/** A smaller frame centred in a larger one. @param {Rgba} image @param {number} size @returns {Rgba} */
function centre(image, size) {
  if (image.width === size) return image;
  const offset = (size - image.width) / 2;
  if (!Number.isInteger(offset) || offset < 0) throw new Error('Unsupported centring');
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < image.height; y++) data.set(image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4), ((y + offset) * size + offset) * 4);
  return { width: size, height: size, data };
}

/** Directions in sheet row order. */
export const LPC_DIRECTIONS = Object.freeze(['up', 'left', 'down', 'right']);

/**
 * One finished frame of a character's action from the manifest (decision 0019): each layer's reduced sheet cut at the
 * right cell, recoloured, composited bottom first, then binary alpha. Standard actions take column `cycle[phase]` on
 * the direction's row. Custom (oversized) actions name a base action and column per frame: base layers come from the
 * 48-pixel base sheets, centred, and the action's own layers from its large sheets.
 * @param {any} manifest the committed LPC manifest @param {string} character @param {string} action
 * @param {string} direction @param {number} phase
 * @param {(file: string) => Rgba & { cellOut: number }} reduced the reduced sheet of a committed file
 * @param {number} threshold the final alpha threshold
 * @returns {Rgba}
 */
export function bakeFrame(manifest, character, action, direction, phase, reduced, threshold) {
  const spec = manifest.characters[character]?.actions[action];
  if (!spec) throw new Error(`No ${action} for ${character}`);
  const row = LPC_DIRECTIONS.indexOf(direction);
  if (row < 0) throw new Error(`Unknown direction ${direction}`);
  /** @param {LayerRef} layer */
  const ramps = layer => layer.ramps.map(i => manifest.ramps[i]);
  if (spec.kind === 'standard') return bakeColumn(manifest, spec, spec.cycle[phase % spec.cycle.length], row, reduced, threshold);
  const frames = spec.frames[row];
  if (!frames) throw new Error(`No ${direction} row for ${action}`);
  const phaseIndex = phase % frames.length;
  const [base, column] = frames[phaseIndex];
  const layers = spec.layers[base].map((/** @type {LayerRef} */ layer) => {
    const sheet = reduced(layer.file);
    const sourceColumn = !layer.base && !spec.sourceSingleAnimation ? phaseIndex : column;
    return centre(recolor(extractFrame(sheet, sourceColumn, row, sheet.cellOut), ramps(layer)), spec.size);
  });
  return binaryAlpha(composite(layers, spec.size), threshold);
}

/**
 * A walk's standing frame (decision 0019 S1.5f): LPC's walk sheets keep the figure at rest, feet together, in column 0,
 * outside the stepping cycle. A standard walk cuts that column; an oversized walk already lists it as its first frame.
 * @param {any} manifest @param {string} character @param {string} action @param {string} direction
 * @param {(file: string) => Rgba & { cellOut: number }} reduced @param {number} threshold
 * @returns {Rgba}
 */
export function bakeStandFrame(manifest, character, action, direction, reduced, threshold) {
  const spec = manifest.characters[character]?.actions[action];
  if (!spec) throw new Error(`No ${action} for ${character}`);
  if (spec.kind !== 'standard') return bakeFrame(manifest, character, action, direction, 0, reduced, threshold);
  const row = LPC_DIRECTIONS.indexOf(direction);
  if (row < 0) throw new Error(`Unknown direction ${direction}`);
  return bakeColumn(manifest, spec, 0, row, reduced, threshold);
}

/** A standard action's frame at one column and row. */
function bakeColumn(/** @type {any} */ manifest, /** @type {any} */ spec, /** @type {number} */ col, /** @type {number} */ row, /** @type {(file: string) => Rgba & { cellOut: number }} */ reduced, /** @type {number} */ threshold) {
  const ramps = (/** @type {LayerRef} */ layer) => layer.ramps.map(i => manifest.ramps[i]);
  const layers = spec.layers.map((/** @type {LayerRef} */ layer) => recolor(extractFrame(reduced(layer.file), col, row, spec.size), ramps(layer)));
  return binaryAlpha(composite(layers, spec.size), threshold);
}
