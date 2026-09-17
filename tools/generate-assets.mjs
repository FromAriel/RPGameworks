import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

async function main() {
  const source = resolve(option('--source', 'assets/source/foundation.json'));
  const destination = resolve(option('--output', 'public/generated'));
  const data = JSON.parse(await readFile(source, 'utf8'));
  if (data.schemaVersion !== 1 || !data.palette || !data.frames) throw new Error(`${source}: invalid foundation asset format`);
  const entries = Object.entries(data.frames);
  if (entries.length < 1 || entries.length > 32) throw new Error('Expected 1–32 bounded atlas frames.');
  const palette = new Map();
  for (const [symbol, hex] of Object.entries(data.palette)) {
    if (symbol.length !== 1 || typeof hex !== 'string' || !/^[a-f0-9]{8}$/i.test(hex)) throw new Error(`Invalid palette entry: ${symbol}`);
    palette.set(symbol, Buffer.from(hex, 'hex'));
  }
  const cell = 16;
  const width = cell * entries.length;
  const height = cell;
  const pixels = Buffer.alloc(width * height * 4);
  const frames = {};
  entries.forEach(([name, rows], index) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || !Array.isArray(rows) || rows.length < 1 || rows.length > cell) throw new Error(`Invalid frame: ${name}`);
    const frameWidth = typeof rows[0] === 'string' ? rows[0].length : 0;
    if (frameWidth < 1 || frameWidth > cell) throw new Error(`Invalid frame width: ${name}`);
    rows.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== frameWidth) throw new Error(`Uneven rows in ${name}:${y}`);
      [...row].forEach((symbol, x) => {
        const rgba = palette.get(symbol);
        if (!rgba) throw new Error(`Unknown color ${JSON.stringify(symbol)} in ${name}:${x},${y}`);
        rgba.copy(pixels, (y * width + index * cell + x) * 4);
      });
    });
    frames[name] = {
      frame: { x: index * cell, y: 0, w: frameWidth, h: rows.length },
      rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameWidth, h: rows.length },
      sourceSize: { w: frameWidth, h: rows.length },
    };
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA, no interlace.
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0)),
  ]);
  const atlas = { frames, meta: { app: 'RPGameworks', image: 'foundation.png', format: 'RGBA8888', size: { w: width, h: height }, scale: '1' } };
  await mkdir(destination, { recursive: true });
  await writeFile(resolve(destination, 'foundation.png'), png);
  await writeFile(resolve(destination, 'foundation.json'), `${JSON.stringify(atlas, null, 2)}\n`);
  console.log(`Generated ${entries.length} original frames: ${width}x${height}, ${png.length} PNG bytes.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
