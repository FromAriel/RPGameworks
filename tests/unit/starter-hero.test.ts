import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pngjs from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildStarterHero } from '../../tools/build-starter-hero.mjs';
import { readCharacterPack, decodeAllPayloads } from '../../src/platform/character-pack';

const { PNG } = pngjs;
const recordedLayout = JSON.parse(readFileSync('docs/asset-analysis/cute-fantasy-player.layout.json', 'utf8')) as Record<string, any>;
const recordedSelection = JSON.parse(readFileSync('docs/asset-analysis/starter-appearance.json', 'utf8')) as Record<string, any>;
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const layout = structuredClone(recordedLayout);
  const selection = structuredClone(recordedSelection);
  layout.source.master = 'master.aseprite';
  layout.source.sha256 = sha(Buffer.from('synthetic master'));
  selection.source.masterSha256 = layout.source.sha256;
  for (const family of layout.assetFamilies) { family.widthPx = 384; family.heightPx = 384; }
  const files = new Map<string, Uint8Array>([['master.aseprite', Buffer.from('synthetic master')]]);
  const reads: string[] = [];
  const pins: Record<string, any> = { formatVersion: 1, packId: 'starter-hero', masterSha256: layout.source.sha256, files: {} };
  let color = 1;
  for (const [slot, relativePath] of Object.entries(selection.variants as Record<string, string | null>)) {
    if (!relativePath) continue;
    const png = new PNG({ width: 384, height: 384 });
    for (let row = 0; row < 6; row += 1) for (let frame = 0; frame < 6; frame += 1) {
      const offset = ((row * 64) * 384 + frame * 64) * 4;
      png.data[offset] = color;
      png.data[offset + 1] = row;
      png.data[offset + 2] = frame;
      png.data[offset + 3] = 255;
    }
    const bytes = PNG.sync.write(png);
    files.set(`${selection.source.exportRoot}/${relativePath}`, bytes);
    pins.files[slot] = sha(bytes);
    color += 1;
  }
  const read = (path: string): Uint8Array => {
    reads.push(path);
    const bytes = files.get(path);
    if (!bytes) throw new Error(`missing fixture ${path}`);
    return bytes;
  };
  return { layout, selection, pins, files, reads, read };
}

describe('real-pixel starter hero input', () => {
  it('encodes only selected idle and walk cells in deterministic v1 bytes', async () => {
    const input = fixture();
    const first = buildStarterHero(input.layout, input.selection, input.pins, input.read);
    expect(input.reads).toEqual(['master.aseprite', ...['base', 'feet', 'legs', 'chest', 'hair', 'hands', 'mount'].map(
      slot => `${input.selection.source.exportRoot}/${input.selection.variants[slot]}`,
    )]);
    const second = buildStarterHero(input.layout, input.selection, input.pins, input.read);
    expect(second.blob).toEqual(first.blob);
    expect(first.cellCount).toBe(216);
    const pack = readCharacterPack(new Uint8Array(first.blob));
    expect(pack.manifest.animations.map(animation => `${animation.name}|${animation.direction}`)).toEqual([
      'idle|down', 'idle|side', 'idle|up', 'walk|down', 'walk|side', 'walk|up',
    ]);
    expect(pack.manifest.layers.map(layer => layer.id)).toEqual(['base', 'feet', 'legs', 'chest', 'hair', 'hands']);
    const decoded = await decodeAllPayloads(pack);
    const payload = pack.cells.get('walk|up|5')?.get('base');
    expect(payload).toBeDefined();
    expect([...decoded[payload!]!.subarray(0, 4)]).toEqual([1, 5, 5, 255]);
    expect(first.report.files.mount).toBeDefined();
  });

  it('rejects changed bytes, wrong dimensions, corrupt PNGs, and allowlist drift', () => {
    const input = fixture();
    const basePath = `${input.selection.source.exportRoot}/${input.selection.variants.base}`;
    const original = input.files.get(basePath)!;
    input.files.set(basePath, Buffer.from(original.subarray(0, original.length - 1)));
    expect(() => buildStarterHero(input.layout, input.selection, input.pins, input.read)).toThrow(/base: selected PNG hash changed/);
    const small = PNG.sync.write(new PNG({ width: 64, height: 64 }));
    input.files.set(basePath, small); input.pins.files.base = sha(small);
    expect(() => buildStarterHero(input.layout, input.selection, input.pins, input.read)).toThrow(/base: selected PNG dimensions/);
    const invalid = Buffer.from('not a png');
    input.files.set(basePath, invalid); input.pins.files.base = sha(invalid);
    expect(() => buildStarterHero(input.layout, input.selection, input.pins, input.read)).toThrow(/base: not a PNG/);
    input.files.set(basePath, original); input.pins.files.base = sha(original);
    input.selection.variants.base = 'Player_Base/Other.png';
    expect(() => buildStarterHero(input.layout, input.selection, input.pins, input.read)).toThrow(/matches no recorded asset family/);
    input.selection.variants.base = 'Player_Base/Player_Base_animations.png';
    input.layout.animations.find((animation: { name: string; direction: string }) => animation.name === 'walk' && animation.direction === 'up').row = 7;
    expect(() => buildStarterHero(input.layout, input.selection, input.pins, input.read)).toThrow(/authored row or frame count changed/);
  });
});
