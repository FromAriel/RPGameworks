import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { encodePack, crossValidate, publishPackPair } from '../../tools/build-character-pack.mjs';
import { PACK_VERSION } from '../../src/platform/character-pack-format.mjs';
import { readCharacterPack, decodeAllPayloads } from '../../src/platform/character-pack';

const PACK_HEADER_BYTES = 10;
const FIXTURE_ROOT = 'tests/fixtures/character-pack';

/** The committed golden fixture is the single synthetic authority for these tests. */
const goldenSource = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'golden-source.json'), 'utf8')) as {
  schemaVersion: 1;
  packId: string;
  palette: Record<string, string>;
  layers: { id: string; role: string }[];
  animations: { name: string; direction: string | null; frameCount: number; loop: boolean }[];
  frames: { animation: string; direction: string | null; frameIndex: number; layer: string; pixels: string }[];
};
const goldenPin = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'golden-synthetic.pin.json'), 'utf8')) as {
  packId: string; packSha256: string; packBytes: number; cellCount: number; payloadCount: number; decodedBytes: number;
};

function rgbaFrom(pixels: string, palette: Record<string, string>): Uint8Array {
  const out = new Uint8Array(pixels.length * 4);
  for (let index = 0; index < pixels.length; index += 1) {
    const symbol = pixels.charAt(index);
    if (symbol === '.') continue;
    out.set(new Uint8Array(Buffer.from(palette[symbol] ?? '00000000', 'hex')), index * 4);
  }
  return out;
}

describe('character pack v1 golden fixture', () => {
  it('matches its committed pin and regenerates byte-identically from the committed source', () => {
    const committed = readFileSync(join(FIXTURE_ROOT, 'golden-synthetic.rpgpack'));
    expect(committed.length).toBe(goldenPin.packBytes);
    expect(createHash('sha256').update(committed).digest('hex')).toBe(goldenPin.packSha256);
    const regenerated = encodePack(goldenSource);
    expect(Buffer.from(regenerated.blob).equals(committed)).toBe(true);
  });

  it('round-trips the committed fixture bytes through the strict reader', async () => {
    const committed = readFileSync(join(FIXTURE_ROOT, 'golden-synthetic.rpgpack'));
    const pack = readCharacterPack(new Uint8Array(committed));
    expect(pack.manifest.packId).toBe(goldenPin.packId);
    expect(pack.payloads.length).toBe(goldenPin.payloadCount);
    expect(pack.cells.size).toBe(6);
    const decoded = await decodeAllPayloads(pack);
    let checked = 0;
    for (const [key, layers] of pack.cells) {
      const [animation, direction, frameIndex] = key.split('|');
      for (const [layer, payloadIndex] of layers) {
        const frame = goldenSource.frames.find((candidate) =>
          candidate.animation === animation && String(candidate.direction) === direction && candidate.frameIndex === Number(frameIndex) && candidate.layer === layer);
        expect(frame, `${key}/${layer}`).toBeDefined();
        const expected = rgbaFrom(frame!.pixels, goldenSource.palette);
        const actual = decoded[payloadIndex] ?? new Uint8Array(0);
        expect(Buffer.from(actual).equals(Buffer.from(expected)), `${key}/${layer}`).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBe(goldenPin.cellCount);
  });
});

describe('character pack v1 encoder', () => {
  it('encodes deterministically and is invariant to source frame order', () => {
    const first = encodePack(goldenSource);
    expect(first.blob.subarray(0, 4).toString('ascii')).toBe('RPGP');
    expect(first.blob[4]).toBe(PACK_VERSION);
    expect(first.blob[5]).toBe(0);
    expect(Buffer.from(encodePack(goldenSource).blob).equals(Buffer.from(first.blob))).toBe(true);
    const reversed = { ...goldenSource, frames: [...goldenSource.frames].reverse() };
    expect(Buffer.from(encodePack(reversed).blob).equals(Buffer.from(first.blob))).toBe(true);
  });

  it('deduplicates identical layer pixels into shared payloads', () => {
    const { manifest } = encodePack(goldenSource);
    expect(manifest.cells.length).toBe(goldenPin.cellCount);
    expect(manifest.payloads.length).toBeLessThan(manifest.cells.length);
    const idleDownBase = manifest.cells
      .filter((binding) => binding.cell.animation === 'idle' && binding.cell.direction === 'down' && binding.layer === 'base')
      .map((binding) => binding.payload);
    expect(new Set(idleDownBase).size).toBe(1);
    const shirtPayloads = manifest.cells.filter((binding) => binding.layer === 'shirt').map((binding) => binding.payload);
    expect(new Set(shirtPayloads).size).toBe(2);
  });

  it('rejects cross-field-invalid sources before encoding', () => {
    expect(() => crossValidate({
      ...goldenSource,
      animations: [...goldenSource.animations, { ...(goldenSource.animations[0] as { name: string; direction: string; frameCount: number; loop: boolean }) }],
    })).toThrow(/duplicate animation/);
    expect(() => crossValidate({
      ...goldenSource,
      layers: [...goldenSource.layers, { id: 'base', role: 'again' }],
    })).toThrow(/duplicate layer ID/);
    const missing = structuredClone(goldenSource);
    missing.frames = missing.frames.filter((frame) => !(frame.animation === 'walk' && frame.frameIndex === 1));
    expect(() => crossValidate(missing)).toThrow(/frame 1 has no layers/);
    expect(() => crossValidate({
      ...goldenSource,
      frames: [...goldenSource.frames, { animation: 'idle', direction: 'down', frameIndex: 0, layer: 'ghost', pixels: '................' }],
    })).toThrow(/unknown layer ghost/);
    expect(() => crossValidate({
      ...goldenSource,
      frames: [...goldenSource.frames, { animation: 'idle', direction: 'down', frameIndex: 5, layer: 'base', pixels: '................' }],
    })).toThrow(/frameIndex exceeds the declared frameCount 2/);
  });

  it('rejects an unknown palette symbol at encode time', () => {
    expect(() => encodePack({
      ...goldenSource,
      palette: {},
      animations: [{ name: 'idle', direction: 'down', frameCount: 1, loop: true }],
      layers: goldenSource.layers.slice(0, 1),
      frames: [{ animation: 'idle', direction: 'down', frameIndex: 0, layer: 'base', pixels: goldenSource.frames[0]!.pixels }],
    })).toThrow(/unknown palette symbol/);
  });

  it('rejects a wrong-length pixel string', () => {
    expect(() => crossValidate({
      ...goldenSource,
      frames: [{ animation: 'idle', direction: 'down', frameIndex: 0, layer: 'base', pixels: 'rrr' }],
    })).toThrow(/expected 16 symbols/);
  });
});

describe('character pack v1 reader', () => {
  it('rejects framing corruption', () => {
    const { blob } = encodePack(goldenSource);
    const corrupt = (mutate: (bytes: Buffer) => Buffer, message: RegExp): void => {
      expect(() => readCharacterPack(new Uint8Array(mutate(Buffer.from(blob))))).toThrow(message);
    };
    corrupt((bytes) => { bytes[0] = 0x58; return bytes; }, /pack magic/);
    corrupt((bytes) => { bytes[4] = 2; return bytes; }, /unsupported pack format version/);
    corrupt((bytes) => { bytes[5] = 1; return bytes; }, /reserved header byte/);
    corrupt((bytes) => { bytes.writeUInt32BE(0xffffff, 6); return bytes; }, /manifest length .* outside/);
    corrupt((bytes) => { bytes.writeUInt32BE(4, 6); return bytes; }, /not valid UTF-8 JSON|failed schema validation/);
    corrupt((bytes) => bytes.subarray(0, bytes.length - 1), /payload body is/);
    corrupt((bytes) => Buffer.concat([bytes, Buffer.from([0])]), /payload body is/);
    expect(() => readCharacterPack(new Uint8Array(Buffer.from('RPGP')))).toThrow(/too small/);
  });

  it('rejects invalid UTF-8 and invalid JSON manifests', () => {
    const { blob } = encodePack(goldenSource);
    const withGarbage = Buffer.from(blob);
    withGarbage[PACK_HEADER_BYTES + 5] = 0xff;
    expect(() => readCharacterPack(new Uint8Array(withGarbage))).toThrow(/not valid UTF-8 JSON/);
    const broken = Buffer.from(blob);
    broken.write('{invalid json', PACK_HEADER_BYTES, 'ascii');
    expect(() => readCharacterPack(new Uint8Array(broken))).toThrow(/not valid UTF-8 JSON/);
  });

  it('rejects cross-field manifest defects from a hand-built hostile pack', () => {
    const { blob, manifest } = encodePack(goldenSource);
    const body = Buffer.from(blob.subarray(PACK_HEADER_BYTES + Buffer.byteLength(JSON.stringify(manifest), 'utf8')));
    const rebuild = (patchedManifest: unknown): Buffer => {
      const bytes = Buffer.from(JSON.stringify(patchedManifest), 'utf8');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length, 0);
      return Buffer.concat([Buffer.from('RPGP', 'ascii'), Buffer.from([1, 0]), length, bytes, body]);
    };
    const nonSequential = structuredClone(manifest);
    nonSequential.payloads[1]!.offset += 1;
    expect(() => readCharacterPack(new Uint8Array(rebuild(nonSequential)))).toThrow(/offset .* breaks sequential layout/);
    const duplicateCell = structuredClone(manifest);
    duplicateCell.cells.push(structuredClone(duplicateCell.cells[0]!));
    expect(() => readCharacterPack(new Uint8Array(rebuild(duplicateCell)))).toThrow(/duplicate: idle\|down\|0\|base/);
    const unknownLayer = structuredClone(manifest);
    unknownLayer.cells[0]!.layer = 'ghost';
    expect(() => readCharacterPack(new Uint8Array(rebuild(unknownLayer)))).toThrow(/unknown layer ghost/);
    const outOfRangePayload = structuredClone(manifest);
    outOfRangePayload.cells[0]!.payload = 999;
    expect(() => readCharacterPack(new Uint8Array(rebuild(outOfRangePayload)))).toThrow(/payload index 999 out of range/);
    const missingFrame = structuredClone(manifest);
    missingFrame.cells = missingFrame.cells.filter((binding: { cell: { animation: string; direction: string | null; frameIndex: number } }) => !(binding.cell.animation === 'use' && binding.cell.frameIndex === 0));
    expect(() => readCharacterPack(new Uint8Array(rebuild(missingFrame)))).toThrow(/missing frame 0/);
    const badVersion = structuredClone(manifest);
    badVersion.formatVersion = 2;
    expect(() => readCharacterPack(new Uint8Array(rebuild(badVersion)))).toThrow(/formatVersion/);
  });

  it('verifies payload digests and rejects corrupted bodies', async () => {
    const { blob, manifest } = encodePack(goldenSource);
    const lying = structuredClone(manifest);
    lying.payloads[0] = { offset: lying.payloads[0]!.offset, length: lying.payloads[0]!.length, decodedLength: lying.payloads[0]!.decodedLength, digest: 'f'.repeat(64) };
    const manifestBytes = Buffer.from(JSON.stringify(lying), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(manifestBytes.length, 0);
    const rebuilt = Buffer.concat([Buffer.from('RPGP', 'ascii'), Buffer.from([1, 0]), length, manifestBytes, Buffer.from(blob.subarray(PACK_HEADER_BYTES + Buffer.byteLength(JSON.stringify(manifest), 'utf8')))]);
    const lyingPack = readCharacterPack(new Uint8Array(rebuilt));
    await expect(lyingPack.decodePayload(0)).rejects.toThrow(/digest mismatch/);
    const flipped = Buffer.from(blob);
    flipped[flipped.length - 1]! ^= 0xff;
    const pack = readCharacterPack(new Uint8Array(flipped));
    await expect(decodeAllPayloads(pack)).rejects.toThrow(/failed to inflate|digest mismatch/);
  });

  it('stops decompression bombs at the declared decoded length', async () => {
    const bomb = deflateSync(Buffer.alloc(1024 * 1024));
    const manifest = {
      packId: 'bomb',
      formatVersion: 1 as const,
      cell: { widthPx: 4, heightPx: 4 },
      layers: [{ id: 'base', role: 'body' }],
      animations: [{ name: 'idle', direction: 'down' as const, frameCount: 1, loop: true }],
      payloads: [{ offset: 0, length: bomb.length, decodedLength: 64, digest: '0'.repeat(64) }],
      cells: [{ cell: { animation: 'idle', direction: 'down' as const, frameIndex: 0 }, layer: 'base', payload: 0 }],
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(manifestBytes.length, 0);
    const blob = Buffer.concat([Buffer.from('RPGP', 'ascii'), Buffer.from([1, 0]), length, manifestBytes, bomb]);
    const pack = readCharacterPack(new Uint8Array(blob));
    await expect(pack.decodePayload(0)).rejects.toThrow(/inflates past its declared 64 bytes|inflates to \d+ bytes, declared 64/);
  });

  it('interrupts an in-flight decode when the signal aborts', async () => {
    const committed = new Uint8Array(readFileSync(join(FIXTURE_ROOT, 'golden-synthetic.rpgpack')));
    const pack = readCharacterPack(committed);
    const controller = new AbortController();
    const reason = new Error('decode abandoned');
    const pending = pack.decodePayload(0, controller.signal);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    // An already-aborted signal refuses to start any work.
    const stopped = new AbortController();
    stopped.abort(reason);
    await expect(pack.decodePayload(0, stopped.signal)).rejects.toBe(reason);
    // A completed decode is unaffected by aborting after the fact.
    const controller2 = new AbortController();
    const payload = await pack.decodePayload(0, controller2.signal);
    controller2.abort(reason);
    expect(payload.length).toBe(64);
  });

  it('does not return pixels when aborted during digest verification', async () => {
    const pack = readCharacterPack(new Uint8Array(readFileSync(join(FIXTURE_ROOT, 'golden-synthetic.rpgpack'))));
    const controller = new AbortController();
    const reason = new Error('digest abandoned');
    let digestStarted!: () => void;
    let releaseDigest!: () => void;
    const started = new Promise<void>((resolve) => { digestStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseDigest = resolve; });
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
      digestStarted();
      await gate;
      return originalDigest(algorithm, data);
    });
    try {
      const pending = pack.decodePayload(0, controller.signal);
      await started;
      controller.abort(reason);
      releaseDigest();
      await expect(pending).rejects.toBe(reason);
    } finally {
      releaseDigest();
      spy.mockRestore();
    }
  });
});

describe('character pack v1 command', () => {
  it('writes byte-identical packs and reports on repeated runs', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-pack-'));
    try {
      const source = join(temporary, 'source.json');
      writeFileSync(source, JSON.stringify(goldenSource));
      const output = join(temporary, 'out');
      runTool('--source', source, '--output', output);
      const first = readFileSync(join(output, 'synthetic-hero.rpgpack'));
      const firstReport = JSON.parse(readFileSync(join(output, 'synthetic-hero.report.json'), 'utf8')) as Record<string, unknown>;
      runTool('--source', source, '--output', output);
      expect(readFileSync(join(output, 'synthetic-hero.rpgpack'))).toEqual(first);
      const secondReport = JSON.parse(readFileSync(join(output, 'synthetic-hero.report.json'), 'utf8')) as Record<string, unknown>;
      expect(firstReport).toEqual(secondReport);
      expect(firstReport.packHash).toMatch(/^[0-9a-f]{64}$/);
      // The report is a tracked, regenerable artifact: it names a repo-relative
      // source and declares itself non-authoritative.
      expect(firstReport.regenerable).toBe(true);
      const pack = readCharacterPack(new Uint8Array(first));
      expect(pack.manifest.packId).toBe('synthetic-hero');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it('records a repo-relative source identifier for in-repo inputs', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-pack-'));
    try {
      const output = join(temporary, 'out');
      runTool('--source', join(FIXTURE_ROOT, 'golden-source.json'), '--output', output);
      const report = JSON.parse(readFileSync(join(output, `${goldenSource.packId}.report.json`), 'utf8')) as { sourceFile: string; packHash: string };
      expect(report.sourceFile).toBe('tests/fixtures/character-pack/golden-source.json');
      expect(report.packHash).toBe(goldenPin.packSha256);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it('treats the pack as authoritative when the pack replacement fails, and heals on rerun', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-pack-'));
    try {
      const source = join(temporary, 'source.json');
      writeFileSync(source, JSON.stringify(goldenSource));
      const output = join(temporary, 'out');
      // First run: a consistent, good pair whose pack bytes are the reference.
      runTool('--source', source, '--output', output);
      const goodPack = readFileSync(join(output, 'synthetic-hero.rpgpack'));
      // A directory occupying the pack's target path makes the second rename (the
      // pack) fail after the report has already been replaced.
      rmSync(join(output, 'synthetic-hero.rpgpack'));
      mkdirSync(join(output, 'synthetic-hero.rpgpack'), { recursive: true });
      const failing = spawnWithFailure('--source', source, '--output', output);
      expect(failing.stderr).toContain('failed to replace the pack');
      // The pack target still holds the blocker (no pack bytes appeared), while the
      // already-replaced report parses as the declared regenerable artifact.
      const staleReport = JSON.parse(readFileSync(join(output, 'synthetic-hero.report.json'), 'utf8')) as Record<string, unknown>;
      expect(staleReport.regenerable).toBe(true);
      // Rerunning after clearing the failure restores a consistent pair.
      rmSync(join(output, 'synthetic-hero.rpgpack'), { recursive: true, force: true });
      runTool('--source', source, '--output', output);
      expect(readFileSync(join(output, 'synthetic-hero.rpgpack'))).toEqual(goodPack);
      const healedReport = JSON.parse(readFileSync(join(output, 'synthetic-hero.report.json'), 'utf8')) as Record<string, unknown>;
      expect(healedReport.packHash).toBe(goldenPin.packSha256);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it('preserves an existing pack when its replacement fails after the report is written', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-pack-'));
    try {
      const output = join(temporary, 'out');
      const old = encodePack(goldenSource);
      publishPackPair(output, goldenSource.packId, old.blob, { packHash: old.packHash, regenerable: true });
      const packPath = join(output, `${goldenSource.packId}.rpgpack`);
      const oldBytes = readFileSync(packPath);
      const changed = encodePack({ ...goldenSource, palette: { ...goldenSource.palette, r: 'ff00ffff' } });
      expect(changed.packHash).not.toBe(old.packHash);
      const newReport = { packHash: changed.packHash, regenerable: true };
      expect(() => publishPackPair(output, goldenSource.packId, changed.blob, newReport, (from, to) => {
        if (to === packPath) throw new Error('injected pack rename failure');
        renameSync(from, to);
      })).toThrow(/failed to replace the pack.*existing pack remains authoritative/);
      expect(readFileSync(packPath)).toEqual(oldBytes);
      expect(JSON.parse(readFileSync(join(output, `${goldenSource.packId}.report.json`), 'utf8'))).toEqual(newReport);
      publishPackPair(output, goldenSource.packId, changed.blob, newReport);
      expect(readFileSync(packPath)).toEqual(changed.blob);
      expect(JSON.parse(readFileSync(join(output, `${goldenSource.packId}.report.json`), 'utf8'))).toEqual(newReport);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
});

function runTool(...args: string[]): void {
  execFileSync(process.execPath, ['tools/build-character-pack.mjs', ...args]);
}

function spawnWithFailure(...args: string[]): { stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, ['tools/build-character-pack.mjs', ...args], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  return result;
}
