/**
 * Bake window frames from the Pixel Frame core (decision 0010, W2.1).
 *
 * Reads the game's UI theme file (`content/games/demo/ui-theme.json`, schema `schemas/ui-theme.schema.json`),
 * renders each window surface once per state into small 9-slice PNGs and writes a manifest beside them. Output is deterministic (no dates, stable order)
 * and content-hashed, under the ignored `public/generated/frames/` folder, which is rebuilt each run.
 *
 *   node --experimental-strip-types tools/bake-frames.ts [--theme <file>] [--output public/generated] [--check]
 *
 * `--check` bakes twice in memory and fails if the two results differ, without writing files.
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { STATES, presetsFromTheme, renderBaked } from '../src/presentation/pixel-frame/index.ts';
import type { FrameManifest, ManifestFrame, RgbaImage, UiTheme } from '../src/presentation/pixel-frame/index.ts';
import validateTheme from '../src/content/generated/ui-theme-validator.mjs';

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return out;
}

/** Minimal RGBA PNG encoder (8-bit, no interlace, filter 0), same approach as generate-assets.mjs. */
export function encodePng(img: RgbaImage): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header[8] = 8; header[9] = 6; header[10] = 0; header[11] = 0; header[12] = 0;
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const DEFAULT_THEME = 'content/games/demo/ui-theme.json';

/** Read and validate a UI theme file. */
export function readTheme(file: string): UiTheme {
  if (statSync(file).size > 65536) throw new Error(`${file}: exceeds the 64 KiB theme limit`);
  let data: unknown;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${file}: invalid JSON: ${(error as Error).message}`); }
  if (!validateTheme(data)) {
    const first = validateTheme.errors?.[0];
    throw new Error(`${file} ${first?.instancePath || '/'}: ${first?.message ?? 'invalid UI theme'}`);
  }
  return data;
}

/** Bake every window surface of a theme. Returns the manifest and the files to write, keyed by path relative to the output folder. */
export function bakeAll(theme: UiTheme): { manifest: FrameManifest; files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  const frames: Record<string, ManifestFrame> = {};
  const add = (name: string, img: RgbaImage): string => {
    const png = encodePng(img);
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 12);
    const path = `frames/${name}.${hash}.png`;
    files.set(path, png);
    return path;
  };
  for (const preset of presetsFromTheme(theme)) {
    if (!/^[a-z][a-z0-9-]*$/.test(preset.id)) throw new Error(`Invalid window surface: ${preset.id}`);
    const baked = renderBaked(preset.style, { ...preset.settings, theme: preset.theme });
    const images = Object.fromEntries(STATES.map(([state]) => [state, add(`${preset.id}-${state}`, baked.images[state])])) as ManifestFrame['images'];
    frames[preset.id] = {
      description: preset.description,
      border: baked.P,
      outset: baked.M,
      slice: baked.S,
      tile: baked.tile,
      repeat: baked.repeat,
      size: baked.size,
      inset: baked.inset,
      images,
      pulse: baked.pulse ? baked.pulse.map((img, k) => add(`${preset.id}-pulse${k}`, img)) : null,
      fill: preset.fill,
    };
  }
  return { manifest: { schemaVersion: 1, generator: 'Pixel Frame core (decision 0010)', theme: theme.id, frames, battleText: theme.battleText }, files };
}

async function main(): Promise<void> {
  const theme = readTheme(resolve(option('--theme', DEFAULT_THEME)));
  if (args.includes('--check')) {
    const a = bakeAll(theme);
    const b = bakeAll(theme);
    const same = JSON.stringify(a.manifest) === JSON.stringify(b.manifest)
      && a.files.size === b.files.size && [...a.files].every(([path, bytes]) => b.files.get(path)?.equals(bytes));
    if (!same) throw new Error('Frame bake is not deterministic');
    console.log(`Frame bake check passed: ${theme.id}, ${Object.keys(a.manifest.frames).length} window surface(s), ${a.files.size} image(s).`);
    return;
  }
  const root = resolve(option('--output', 'public/generated'));
  const dir = join(root, 'frames');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const { manifest, files } = bakeAll(theme);
  for (const [path, bytes] of files) await writeFile(join(root, path), bytes);
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Baked ${files.size} frame image(s) for ${Object.keys(manifest.frames).length} window surface(s) of ${theme.id} into ${dir}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
