/** Validate everything first, then emit one deterministic, versioned character pack blob.
 *
 * Pack v1 layout (docs/decisions/0003-character-pack-v1.md):
 *   bytes 0..3    magic "RPGP"
 *   byte  4       format version (1)
 *   byte  5       reserved (0)
 *   bytes 6..9    manifest byte length (uint32 BE, bounded)
 *   bytes 10..N   UTF-8 JSON manifest
 *   bytes N..end  payload body: zlib-compressed raw RGBA payloads, in manifest order
 *
 * The manifest lists deduplicated payloads with offset/length/decodedLength/digest and
 * per-cell layer→payload bindings; the reader verifies every field before exposing pixels.
 */
import { readFileSync, statSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, renameSync, realpathSync } from 'node:fs';
import { dirname, relative, isAbsolute, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import Ajv from 'ajv';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
/** @param {string} name @param {string} fallback */
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return resolve(value);
}

const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_DECODED_CELL_BYTES = 128 * 128 * 4;
const MAX_TOTAL_DECODED_BYTES = 8 * 1024 * 1024;
const MAX_PAYLOAD_BODY_BYTES = 8 * 1024 * 1024;

/** @param {string} file */
function readJSON(file) {
  if (statSync(file).size > MAX_SOURCE_BYTES) throw new Error(`${file}: source exceeds ${MAX_SOURCE_BYTES} bytes`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${file}: invalid JSON: ${detail}`);
  }
}

/** @param {unknown} value @returns {any} */
function validateSource(value) {
  const schema = JSON.parse(readFileSync(join(repo, 'schemas/character-pack-source.schema.json'), 'utf8'));
  const validate = new Ajv({ strict: true, allErrors: false }).compile(schema);
  if (!validate(value)) {
    const detail = (validate.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`).slice(0, 10).join('; ');
    throw new Error(`pack source failed schema validation: ${detail}`);
  }
  return value;
}

/**
 * Full cross-field validation of a schema-valid source. Every rejection here is a
 * validation error, not a runtime surprise (AGENTS discipline).
 * @param {any} source
 */
export function crossValidate(source) {
  if (new Set(source.layers.map((/** @type {any} */ l) => l.id)).size !== source.layers.length) throw new Error('duplicate layer ID');
  const animationKeys = new Set(source.animations.map((/** @type {any} */ a) => `${a.name}|${a.direction}`));
  if (animationKeys.size !== source.animations.length) throw new Error('duplicate animation name/direction');
  /** @type {Map<string, Map<string, Map<number, string>>>} animationKey → layer → frameIndex → pixels */
  const cells = new Map();
  for (const frame of source.frames) {
    const animationKey = `${frame.animation}|${frame.direction}`;
    const declared = source.animations.find((/** @type {any} */ a) => `${a.name}|${a.direction}` === animationKey);
    if (!declared) throw new Error(`frame ${animationKey}|${frame.frameIndex}: no matching animation entry`);
    if (frame.frameIndex >= declared.frameCount) throw new Error(`frame ${animationKey}|${frame.frameIndex}: frameIndex exceeds the declared frameCount ${declared.frameCount}`);
    if (!source.layers.some((/** @type {any} */ l) => l.id === frame.layer)) throw new Error(`frame ${animationKey}|${frame.frameIndex}: unknown layer ${frame.layer}`);
    const expected = source.cell.widthPx * source.cell.heightPx;
    if (frame.pixels.length !== expected) throw new Error(`frame ${animationKey}|${frame.frameIndex}/${frame.layer}: expected ${expected} symbols, got ${frame.pixels.length}`);
    let layers = cells.get(animationKey);
    if (!layers) { layers = new Map(); cells.set(animationKey, layers); }
    let layerPixels = layers.get(frame.layer);
    if (!layerPixels) { layerPixels = new Map(); layers.set(frame.layer, layerPixels); }
    if (layerPixels.has(frame.frameIndex)) throw new Error(`frame ${animationKey}|${frame.frameIndex}: duplicate layer ${frame.layer}`);
    layerPixels.set(frame.frameIndex, frame.pixels);
  }
  for (const animation of source.animations) {
    const layers = cells.get(`${animation.name}|${animation.direction}`);
    if (!layers) throw new Error(`animation ${animation.name}|${animation.direction}: no frames`);
    for (let index = 0; index < animation.frameCount; index += 1) {
      const present = [...layers.values()].filter((pixelsByIndex) => pixelsByIndex.has(index));
      if (present.length === 0) throw new Error(`animation ${animation.name}|${animation.direction}: frame ${index} has no layers`);
    }
  }  return cells;
}

/**
 * Deterministic RGBA conversion: palette symbol → exact RGBA hex from the source
 * palette (stable across runs and machines). Unknown symbols fail; '.' stays transparent.
 * @param {string} pixels @param {Record<string, string>} palette @param {number} cellBytes @param {string} label
 */
function decodePixels(pixels, palette, cellBytes, label) {
  const rgba = Buffer.alloc(cellBytes);
  for (let index = 0; index < pixels.length; index += 1) {
    const symbol = pixels.charAt(index);
    if (symbol === '.') continue;
    const hex = palette[symbol];
    if (hex === undefined) throw new Error(`${label}: unknown palette symbol ${JSON.stringify(symbol)}`);
    const value = Buffer.from(hex, 'hex');
    if (value.length !== 4) throw new Error(`${label}: palette entry ${JSON.stringify(symbol)} must be 8 hex digits`);
    value.copy(rgba, index * 4);
  }
  return rgba;
}

/** @param {number} value */
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32BE(value, 0); return b; }

/**
 * Encode one versioned pack from a validated source. Byte-identical for
 * byte-identical inputs (deflate level 9, canonical ordering, no timestamps).
 * @param {any} source
 */
export function encodePack(source) {
  const cellsByAnimation = crossValidate(source);
  const cellBytes = source.cell.widthPx * source.cell.heightPx * 4;
  const frames = [];
  for (const animation of source.animations) {
    const layers = cellsByAnimation.get(`${animation.name}|${animation.direction}`);
    if (!layers) throw new Error(`animation ${animation.name}|${animation.direction}: no frames`);
    for (let frameIndex = 0; frameIndex < animation.frameCount; frameIndex += 1) {
      for (const layer of source.layers) {
        const pixels = layers.get(layer.id)?.get(frameIndex);
        if (pixels === undefined) continue;
        frames.push({ animation: animation.name, direction: animation.direction, frameIndex, layer: layer.id,
          rgba: decodePixels(pixels, source.palette, cellBytes, `${animation.name}|${animation.direction}|${frameIndex}/${layer.id}`) });
      }
    }
  }
  return { ...encodeRgbaPack({ packId: source.packId, cell: source.cell, layers: source.layers, animations: source.animations, frames }),
    sourceHash: createHash('sha256').update(JSON.stringify(source)).digest('hex') };
}

/** Encode validated, raw RGBA cells using the same v1 wire format as synthetic sources.
 * @param {{packId:string,cell:{widthPx:number,heightPx:number},layers:{id:string,role:string}[],animations:{name:string,direction:string|null,frameCount:number,loop:boolean}[],frames:{animation:string,direction:string|null,frameIndex:number,layer:string,rgba:Uint8Array}[]}} source
 */
export function encodeRgbaPack(source) {
  const cellBytes = source.cell.widthPx * source.cell.heightPx * 4;
  if (!Number.isInteger(cellBytes) || cellBytes < 4 || cellBytes > MAX_DECODED_CELL_BYTES) throw new Error('RGBA cell size is invalid');
  const frameMap = new Map();
  for (const frame of source.frames) {
    const key = `${frame.animation}|${frame.direction}|${frame.frameIndex}|${frame.layer}`;
    if (frameMap.has(key)) throw new Error(`duplicate RGBA cell ${key}`);
    if (frame.rgba.length !== cellBytes) throw new Error(`RGBA cell ${key} has ${frame.rgba.length} bytes, expected ${cellBytes}`);
    frameMap.set(key, frame.rgba);
  }
  if (new Set(source.layers.map(layer => layer.id)).size !== source.layers.length) throw new Error('duplicate layer ID');
  if (new Set(source.animations.map(animation => `${animation.name}|${animation.direction}`)).size !== source.animations.length) throw new Error('duplicate animation name/direction');
  const used = new Set();
  // Deterministic payload deduplication by RGBA digest; identical layer pixels
  // across frames share one payload entry. Canonical walk order: source animation
  // order, ascending frame index, source layer order.
  /** @type {Map<string, {digest: string, decodedLength: number, compressed: Buffer}>} */
  const payloads = new Map();
  /** @type {Map<string, number>} digest → payload index, assigned in first-use order */
  const digestIndex = new Map();
  /** @type {{cell: {animation: string, direction: string|null, frameIndex: number}, layer: string, payload: number}[]} */
  const bindings = [];
  let totalDecoded = 0;
  for (const animation of source.animations) {
    for (let frameIndex = 0; frameIndex < animation.frameCount; frameIndex += 1) {
      let present = 0;
      for (const layerId of source.layers.map(layer => layer.id)) {
        const key = `${animation.name}|${animation.direction}|${frameIndex}|${layerId}`;
        const rgba = frameMap.get(key);
        if (rgba === undefined) continue;
        used.add(key); present += 1;
        if (rgba.length > MAX_DECODED_CELL_BYTES) throw new Error(`${animation.name}|${animation.direction}|${frameIndex}/${layerId}: decoded cell exceeds ${MAX_DECODED_CELL_BYTES} bytes`);
        totalDecoded += rgba.length;
        if (totalDecoded > MAX_TOTAL_DECODED_BYTES) throw new Error(`pack exceeds ${MAX_TOTAL_DECODED_BYTES} decoded bytes`);
        const digest = createHash('sha256').update(rgba).digest('hex');
        let payloadIndex = digestIndex.get(digest);
        if (payloadIndex === undefined) {
          payloadIndex = payloads.size;
          payloads.set(digest, { digest, decodedLength: rgba.length, compressed: deflateSync(rgba, { level: 9 }) });
          digestIndex.set(digest, payloadIndex);
        }
        bindings.push({
          cell: { animation: animation.name, direction: animation.direction, frameIndex },
          layer: layerId,
          payload: payloadIndex,
        });
      }
      if (present === 0) throw new Error(`animation ${animation.name}|${animation.direction}: frame ${frameIndex} has no layers`);
    }
  }
  if (used.size !== frameMap.size) throw new Error('RGBA source contains an undeclared animation, frame, or layer');
  if (payloads.size > 65535) throw new Error(`pack exceeds 65535 payloads (${payloads.size})`);
  const payloadList = [...payloads.values()];
  let offset = 0;
  const payloadEntries = payloadList.map((payload) => {
    const entry = {
      offset,
      length: payload.compressed.length,
      decodedLength: payload.decodedLength,
      digest: payload.digest,
    };
    offset += payload.compressed.length;
    return entry;
  });
  if (offset > MAX_PAYLOAD_BODY_BYTES) throw new Error(`payload body is ${offset} bytes, limit ${MAX_PAYLOAD_BODY_BYTES}`);
  const manifest = {
    packId: source.packId,
    formatVersion: 1,
    cell: { ...source.cell },
    layers: source.layers,
    animations: source.animations,
    payloads: payloadEntries,
    cells: bindings,
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error(`manifest is ${manifestBytes.length} bytes, limit ${MAX_MANIFEST_BYTES}`);
  const blob = Buffer.concat([
    Buffer.from('RPGP', 'ascii'),
    Buffer.from([1, 0]),
    u32(manifestBytes.length),
    manifestBytes,
    ...payloadList.map((payload) => payload.compressed),
  ]);
  return {
    blob,
    manifest,
    packHash: createHash('sha256').update(blob).digest('hex'),
    payloadBytes: offset,
    decodedBytes: totalDecoded,
    cellCount: bindings.length,
    deduplicatedPayloads: payloadList.length,
  };
}

/** Command entry: encode a source JSON into a pack blob plus a generation report. */
export function main() {
  const sourceFile = option('--source', join(repo, 'assets/source/character/pack-source.json'));
  const output = option('--output', join(repo, 'public/generated/character'));
  const source = validateSource(readJSON(sourceFile));
  const result = encodePack(source);
  // Reports are tracked; a machine-specific absolute path is not. Paths inside the
  // repository are recorded repo-relative with forward slashes, anything else verbatim.
  const rel = relative(repo, sourceFile);
  const sourceIdentifier = !rel.startsWith('..' + sep) && !isAbsolute(rel) ? rel.split(sep).join('/') : sourceFile;
  const report = {
    sourceFile: sourceIdentifier,
    regenerable: true,
    sourceHash: result.sourceHash,
    packId: result.manifest.packId,
    packHash: result.packHash,
    packBytes: result.blob.length,
    manifestBytes: Buffer.byteLength(JSON.stringify(result.manifest), 'utf8'),
    payloadBytes: result.payloadBytes,
    decodedBytes: result.decodedBytes,
    cellCount: result.cellCount,
    payloadCount: result.deduplicatedPayloads,
    layerCount: result.manifest.layers.length,
    animationCount: result.manifest.animations.length,
  };
  if (!args.includes('--check')) {
    publishPackPair(output, result.manifest.packId, result.blob, report);
    console.log(`Encoded ${result.cellCount} cells over ${result.deduplicatedPayloads} payloads (${result.blob.length} pack bytes) from ${report.sourceFile}.`);
  } else {
    console.log(`Validated ${result.cellCount} cells from ${report.sourceFile} (check mode; nothing written).`);
  }
  return report;
}

/** Stage both artifacts, then publish the regenerable report before the pack.
 * The rename seam lets the failure test reject the pack replacement without
 * removing or changing the existing pack first.
 * @param {string} output @param {string} packId @param {Buffer} blob
 * @param {Record<string, unknown>} report
 * @param {(from: string, to: string) => void} rename
 */
export function publishPackPair(output, packId, blob, report, rename = renameSync) {
  mkdirSync(output, { recursive: true });
  const packPath = join(output, `${packId}.rpgpack`);
  const reportPath = join(output, `${packId}.report.json`);
  const staging = mkdtempSync(join(dirname(output), '.pack-'));
  try {
    const stagedPack = join(staging, `${packId}.rpgpack`);
    const stagedReport = join(staging, `${packId}.report.json`);
    writeFileSync(stagedPack, blob);
    writeFileSync(stagedReport, `${JSON.stringify(report, null, 2)}\n`);
    replaceFile(stagedReport, reportPath, 'report', rename);
    replaceFile(stagedPack, packPath, 'pack', rename);
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

/**
 * One recoverable file replacement. Replacement order: the regenerable report
 * first, then the authoritative pack. If the pack replacement fails, the existing
 * pack stays untouched and authoritative while the fresh report may briefly be
 * stale; both are re-derived by rerunning this command, which is the recovery.
 * @param {string} stagedPath @param {string} targetPath @param {string} artifact
 * @param {(from: string, to: string) => void} rename
 */
function replaceFile(stagedPath, targetPath, artifact, rename) {
  try {
    rename(stagedPath, targetPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (artifact === 'pack') {
      throw new Error(`failed to replace the pack at ${targetPath} (${detail}); the existing pack remains authoritative and the freshly written report may be stale — rerun this command to restore the pair`);
    }
    throw new Error(`failed to replace the report at ${targetPath} (${detail}); the pack was not yet replaced, so the previous pair is intact — rerun this command`);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
