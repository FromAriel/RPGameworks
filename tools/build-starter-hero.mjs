/** Explicit real-pixel regeneration; never invoked by the routine game build. */
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { validateAppearanceSelection } from '../src/platform/character-selection.mjs';
import { encodeRgbaPack } from './build-character-pack.mjs';

const { PNG } = pngjs;
const repo = fileURLToPath(new URL('../', import.meta.url));
const LAYERS = ['base', 'feet', 'legs', 'chest', 'hair', 'hands'];
const DIRECTIONS = ['down', 'side', 'up'];
const ACTIONS = ['idle', 'walk'];
const CELL = 64;

/** @param {Uint8Array} bytes */
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/** @param {Uint8Array} bytes @param {string} label */
function decodePng(bytes, label) {
  if (bytes.length < 29 || !Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`${label}: not a PNG`);
  if (bytes[24] !== 8 || bytes[25] !== 6 || bytes[28] !== 0) throw new Error(`${label}: expected 8-bit, non-interlaced RGBA PNG`);
  return PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
}

/** @param {Uint8Array} pixels @param {number} width @param {number} row @param {number} column */
function extractCell(pixels, width, row, column) {
  const cell = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y += 1) {
    const start = ((row * CELL + y) * width + column * CELL) * 4;
    cell.set(pixels.subarray(start, start + CELL * 4), y * CELL * 4);
  }
  return cell;
}

/** Validate pinned files before decoding or emitting any output.
 * @param {any} layout @param {any} selection @param {any} pins
 * @param {(path: string) => Uint8Array} readBytes
 */
export function buildStarterHero(layout, selection, pins, readBytes) {
  const selected = validateAppearanceSelection(layout, selection);
  if (pins.formatVersion !== 1 || pins.packId !== selected.packId || pins.masterSha256 !== selection.source.masterSha256) throw new Error('starter input pin identity does not match the selection');
  const expectedSlots = [...LAYERS, 'mount'];
  if (Object.keys(pins.files).sort().join('|') !== [...expectedSlots].sort().join('|')) throw new Error('starter input pin slots do not match the selected files');
  const masterBytes = readBytes(layout.source.master);
  if (sha256(masterBytes) !== pins.masterSha256) throw new Error('starter master Aseprite hash changed');
  /** @type {Map<string, {width:number,height:number,data:Uint8Array}>} */
  const decoded = new Map();
  for (const slot of expectedSlots) {
    const item = selected.resolutions[slot];
    if (!item) throw new Error(`${slot}: missing selected source`);
    const path = `${selection.source.exportRoot}/${item.path}`;
    const bytes = readBytes(path);
    if (sha256(bytes) !== pins.files[slot]) throw new Error(`${slot}: selected PNG hash changed (${item.path})`);
    const png = decodePng(bytes, slot);
    if (png.width !== item.sheetWidthPx || png.height !== item.sheetHeightPx || png.width % CELL !== 0 || png.height % CELL !== 0) throw new Error(`${slot}: selected PNG dimensions or 64px alignment changed`);
    decoded.set(slot, png);
  }
  const animations = [];
  const frames = [];
  for (const action of ACTIONS) for (const direction of DIRECTIONS) {
    const matches = layout.animations.filter((/** @type {any} */ a) => a.name === action && a.direction === direction);
    if (matches.length !== 1) throw new Error(`${action}/${direction}: expected one authored animation row`);
    const animation = matches[0];
    const expectedRow = (action === 'idle' ? 0 : 3) + DIRECTIONS.indexOf(direction);
    if (animation.row !== expectedRow || animation.frameCount !== 6) throw new Error(`${action}/${direction}: authored row or frame count changed`);
    animations.push({ name: action, direction, frameCount: 6, loop: true });
    for (let frameIndex = 0; frameIndex < 6; frameIndex += 1) for (const layer of LAYERS) {
      const png = decoded.get(layer);
      if (!png) throw new Error(`${layer}: decoded source missing`);
      frames.push({ animation: action, direction, frameIndex, layer, rgba: extractCell(png.data, png.width, animation.row, frameIndex) });
    }
  }
  const result = encodeRgbaPack({ packId: selected.packId, cell: { widthPx: CELL, heightPx: CELL },
    layers: LAYERS.map(id => ({ id, role: id })), animations, frames });
  const report = { packId: selected.packId, packHash: result.packHash, packBytes: result.blob.length,
    cellCount: result.cellCount, payloadCount: result.deduplicatedPayloads, decodedBytes: result.decodedBytes,
    masterSha256: pins.masterSha256, files: Object.fromEntries(expectedSlots.map(slot => {
      const item = selected.resolutions[slot];
      if (!item) throw new Error(`${slot}: missing selected source`);
      return [slot, { path: item.path, sha256: pins.files[slot] }];
    })),
    includedActions: ACTIONS, includedLayers: LAYERS };
  return { ...result, report };
}

/** @param {string} path */
function readWithinRepo(path) {
  const absolute = realpathSync(resolve(repo, path));
  if (!absolute.toLowerCase().startsWith(repo.toLowerCase().replace(/[\\/]$/, '') + sep)) throw new Error(`source escapes repository: ${path}`);
  return readFileSync(absolute);
}

/** @param {string[]} args */
export function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--check')) throw new Error('only --check is supported; output paths are fixed');
  const layout = JSON.parse(readFileSync(join(repo, 'docs/asset-analysis/cute-fantasy-player.layout.json'), 'utf8'));
  const selection = JSON.parse(readFileSync(join(repo, 'docs/asset-analysis/starter-appearance.json'), 'utf8'));
  const pins = JSON.parse(readFileSync(join(repo, 'docs/asset-analysis/starter-hero-inputs.json'), 'utf8'));
  const result = buildStarterHero(layout, selection, pins, readWithinRepo);
  if (args.includes('--check')) return result.report;
  const output = join(repo, 'public/character');
  const target = join(output, `${result.report.packId}.rpgpack`);
  mkdirSync(output, { recursive: true });
  const staging = mkdtempSync(join(dirname(target), '.starter-hero-'));
  try {
    const candidate = join(staging, 'candidate.rpgpack');
    writeFileSync(candidate, result.blob);
    renameSync(candidate, target);
  } finally { rmSync(staging, { recursive: true, force: true }); }
  const reportDir = join(repo, 'docs/asset-analysis');
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, 'starter-hero.report.json'), `${JSON.stringify(result.report, null, 2)}\n`);
  console.log(`Prepared local ${result.report.packId} pack: ${result.report.packBytes} bytes, SHA-256 ${result.report.packHash}`);
  return result.report;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
