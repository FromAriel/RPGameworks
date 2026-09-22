/** Pure character-pack v1 format rules: bounds, framing layout, manifest structure.
 * Shared by the offline encoder (tools/build-character-pack.mjs) and the strict
 * runtime reader (src/platform/character-pack.ts). No I/O, no compression, no crypto.
 */

export const PACK_MAGIC = 'RPGP';
export const PACK_VERSION = 1;
export const PACK_HEADER_SIZE = 10;
/** Manifest byte bound; malformed or oversized manifests fail before any JSON work. */
export const MAX_MANIFEST_BYTES = 256 * 1024;
/** One decompressed payload may never exceed this (64×64 RGBA cells are 16 KiB). */
export const MAX_DECODED_CELL_BYTES = 128 * 128 * 4;
/** Sum of all manifest-declared decoded payloads. */
export const MAX_TOTAL_DECODED_BYTES = 8 * 1024 * 1024;
/** Compressed payload body bound. */
export const MAX_PAYLOAD_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_PAYLOADS = 65535;
export const MAX_CELLS = 65536;
export const MAX_LAYERS = 16;
export const MAX_ANIMATIONS = 256;
export const MAX_FRAME_COUNT = 16;
/** The manifest's SHA-256 payload digests are lowercase hex. */
export const DIGEST_HEX_LENGTH = 64;

/**
 * Structural manifest validation: ranges, sequential payload offsets, uniform cell
 * size, animation coverage, cell-key uniqueness. Schema-valid JSON can still fail
 * here (cross-field rules JSON Schema cannot express cheaply).
 * @param {unknown} manifest
 * @returns {Readonly<{manifest: any, cellBytes: number}>}
 */
export function validateManifestLayout(manifest) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) throw new Error('pack manifest is not an object');
  const m = /** @type {Record<string, unknown>} */ (manifest);
  if (m.formatVersion !== PACK_VERSION) throw new Error(`unsupported pack format version: ${String(m.formatVersion)}`);
  const cell = /** @type {Record<string, unknown>} */ (m.cell);
  if (typeof cell !== 'object' || cell === null) throw new Error('pack manifest cell is not an object');
  const cellBytes = Number(cell.widthPx) * Number(cell.heightPx) * 4;
  if (!Number.isInteger(cellBytes) || cellBytes < 4 || cellBytes > MAX_DECODED_CELL_BYTES) throw new Error(`pack cell decodes to ${cellBytes} bytes, outside 4..${MAX_DECODED_CELL_BYTES}`);
  const layers = /** @type {string[]} */ (m.layers);
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS) throw new Error(`pack layers must number 1..${MAX_LAYERS}`);
  const layerIds = new Set();
  for (const layer of layers) {
    if (typeof layer !== 'object' || layer === null) throw new Error('pack layer is not an object');
    const id = /** @type {Record<string, unknown>} */ (layer).id;
    if (typeof id !== 'string' || layerIds.has(id)) throw new Error(`pack layer ID is missing or duplicated: ${String(id)}`);
    layerIds.add(id);
  }
  const animations = /** @type {unknown[]} */ (m.animations);
  if (!Array.isArray(animations) || animations.length < 1 || animations.length > MAX_ANIMATIONS) throw new Error(`pack animations must number 1..${MAX_ANIMATIONS}`);
  /** @type {Map<string, number>} */
  const frameCounts = new Map();
  /** @type {Map<string, string|null>} */
  const directions = new Map();
  for (const animation of animations) {
    if (typeof animation !== 'object' || animation === null) throw new Error('pack animation is not an object');
    const entry = /** @type {Record<string, unknown>} */ (animation);
    const name = entry.name;
    const direction = entry.direction;
    if (typeof name !== 'string' || name.length < 1) throw new Error('pack animation name is missing');
    if (direction !== null && direction !== 'down' && direction !== 'side' && direction !== 'up') throw new Error(`pack animation ${name}: invalid direction`);
    const frameCount = entry.frameCount;
    if (typeof frameCount !== 'number' || !Number.isInteger(frameCount) || frameCount < 1 || frameCount > MAX_FRAME_COUNT) throw new Error(`pack animation ${name}: frameCount out of range`);
    if (typeof entry.loop !== 'boolean') throw new Error(`pack animation ${name}: loop must be boolean`);
    const key = `${name}|${direction}`;
    if (frameCounts.has(key)) throw new Error(`pack animation duplicate: ${key}`);
    frameCounts.set(key, frameCount);
    directions.set(key, /** @type {string|null} */ (direction));
  }
  const payloads = /** @type {unknown[]} */ (m.payloads);
  if (!Array.isArray(payloads) || payloads.length < 1 || payloads.length > MAX_PAYLOADS) throw new Error(`pack payloads must number 1..${MAX_PAYLOADS}`);
  let expectedOffset = 0;
  let totalDecoded = 0;
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    if (typeof payload !== 'object' || payload === null) throw new Error(`pack payload ${index} is not an object`);
    const entry = /** @type {Record<string, unknown>} */ (payload);
    const offset = entry.offset;
    const length = entry.length;
    const decodedLength = entry.decodedLength;
    const digest = entry.digest;
    if (!Number.isInteger(offset) || /** @type {number} */ (offset) !== expectedOffset) throw new Error(`pack payload ${index}: offset ${String(offset)} breaks sequential layout (expected ${expectedOffset})`);
    if (!Number.isInteger(length) || /** @type {number} */ (length) < 1) throw new Error(`pack payload ${index}: length out of range`);
    if (decodedLength !== cellBytes) throw new Error(`pack payload ${index}: decodedLength ${String(decodedLength)} is not the uniform cell size ${cellBytes}`);
    if (typeof digest !== 'string' || digest.length !== DIGEST_HEX_LENGTH || !/^[0-9a-f]{64}$/.test(digest)) throw new Error(`pack payload ${index}: digest is not ${DIGEST_HEX_LENGTH} lowercase hex characters`);
    expectedOffset += /** @type {number} */ (length);
    totalDecoded += /** @type {number} */ (decodedLength);
    if (expectedOffset > MAX_PAYLOAD_BODY_BYTES) throw new Error(`pack payload body exceeds ${MAX_PAYLOAD_BODY_BYTES} bytes`);
    if (totalDecoded > MAX_TOTAL_DECODED_BYTES) throw new Error(`pack decoded total exceeds ${MAX_TOTAL_DECODED_BYTES} bytes`);
  }
  const cells = /** @type {unknown[]} */ (m.cells);
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_CELLS) throw new Error(`pack cells must number 1..${MAX_CELLS}`);
  /** @type {Set<string>} */
  const cellKeys = new Set();
  /** @type {Map<string, Set<number>>} */
  const framesByAnimation = new Map();
  for (const binding of cells) {
    if (typeof binding !== 'object' || binding === null) throw new Error('pack cell binding is not an object');
    const b = /** @type {Record<string, unknown>} */ (binding);
    const cell = /** @type {Record<string, unknown>} */ (b.cell);
    if (typeof cell !== 'object' || cell === null) throw new Error('pack cell binding has no cell');
    const animation = cell.animation;
    const direction = cell.direction;
    const frameIndex = cell.frameIndex;
    const layer = b.layer;
    const payloadIndex = b.payload;
    if (typeof animation !== 'string') throw new Error('pack cell binding animation is missing');
    if (direction !== null && direction !== 'down' && direction !== 'side' && direction !== 'up') throw new Error(`pack cell ${animation}: invalid direction`);
    if (!Number.isInteger(frameIndex) || /** @type {number} */ (frameIndex) < 0) throw new Error(`pack cell ${animation}: frameIndex out of range`);
    const key = `${animation}|${direction}`;
    const frameCount = frameCounts.get(key);
    if (frameCount === undefined) throw new Error(`pack cell ${key}: references an unregistered animation`);
    if (/** @type {number} */ (frameIndex) >= /** @type {number} */ (frameCount)) throw new Error(`pack cell ${key}|${String(frameIndex)}: frameIndex exceeds frameCount ${frameCount}`);
    if (directions.get(key) !== /** @type {string|null} */ (direction)) throw new Error(`pack cell ${key}|${String(frameIndex)}: direction contradicts the animation entry`);
    if (typeof layer !== 'string' || !layerIds.has(layer)) throw new Error(`pack cell ${key}|${String(frameIndex)}: unknown layer ${String(layer)}`);
    if (!Number.isInteger(payloadIndex) || /** @type {number} */ (payloadIndex) < 0 || /** @type {number} */ (payloadIndex) >= payloads.length) throw new Error(`pack cell ${key}|${String(frameIndex)}: payload index ${String(payloadIndex)} out of range`);
    const cellKey = `${key}|${String(frameIndex)}|${layer}`;
    if (cellKeys.has(cellKey)) throw new Error(`pack cell duplicate: ${cellKey}`);
    cellKeys.add(cellKey);
    let frames = framesByAnimation.get(key);
    if (!frames) { frames = new Set(); framesByAnimation.set(key, frames); }
    frames.add(/** @type {number} */ (frameIndex));
  }
  for (const [key, frameCount] of frameCounts) {
    const frames = framesByAnimation.get(key);
    for (let index = 0; index < frameCount; index += 1) {
      if (!frames?.has(index)) throw new Error(`pack animation ${key}: missing frame ${index}`);
    }
  }
  return Object.freeze({ manifest: m, cellBytes });
}

/**
 * File-size framing check: magic, version, reserved byte, manifest bound, exact
 * payload body extent. Pure so the encoder and tests share it with the reader.
 * @param {Uint8Array} bytes
 * @returns {{manifestStart: number, manifestLength: number}}
 */
export function validatePackFraming(bytes) {
  if (bytes.length < PACK_HEADER_SIZE + 2) throw new Error(`pack is ${bytes.length} bytes; too small for a header and manifest`);
  const magic = new TextDecoder('ascii').decode(bytes.subarray(0, 4));
  if (magic !== PACK_MAGIC) throw new Error(`pack magic ${JSON.stringify(magic)} is not ${PACK_MAGIC}`);
  const version = bytes[4];
  const reserved = bytes[5];
  if (version !== PACK_VERSION) throw new Error(`unsupported pack format version: ${version}`);
  if (reserved !== 0) throw new Error(`pack reserved header byte is ${reserved}, expected 0`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const manifestLength = view.getUint32(6, false);
  if (manifestLength < 2 || manifestLength > MAX_MANIFEST_BYTES) throw new Error(`pack manifest length ${manifestLength} is outside 2..${MAX_MANIFEST_BYTES}`);
  const manifestStart = PACK_HEADER_SIZE;
  if (manifestStart + manifestLength > bytes.length) throw new Error(`pack is truncated: header declares a ${manifestLength}-byte manifest but only ${bytes.length - manifestStart} bytes follow`);
  return { manifestStart, manifestLength };
}
