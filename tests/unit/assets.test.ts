import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const generate = (output: string): void => { execFileSync(process.execPath, ['tools/generate-assets.mjs', '--output', output]); };

describe('original atlas build', () => {
  it('generates a deterministic PNG and named in-bounds atlas frames', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-assets-'));
    try {
      generate(temporary);
      const first = readFileSync(join(temporary, 'foundation.png'));
      const json = readFileSync(join(temporary, 'foundation.json'), 'utf8');
      generate(temporary);
      expect(readFileSync(join(temporary, 'foundation.png'))).toEqual(first);
      expect(readFileSync(join(temporary, 'foundation.json'), 'utf8')).toEqual(json);
      expect(first.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const atlas = JSON.parse(json) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>; meta: { size: { w: number; h: number } } };
      expect(Object.keys(atlas.frames)).toHaveLength(20); // 17 original frames plus the lancer, archer and mage placeholders (decision 0014 M5.4b).
      expect(atlas.meta.size.h).toBe(32); // 32-pixel world tiles (decision 0008)
      expect(atlas.frames['door-locked']?.frame.w).toBe(32);
      expect(atlas.frames['plaque-read']?.frame.w).toBe(32);
      expect(atlas.frames['spark']?.frame.w).toBe(4);
      for (const { frame } of Object.values(atlas.frames)) {
        expect(frame.x + frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
        expect(frame.y + frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
      }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
  it('requires a supported cell size', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-cell-asset-'));
    try {
      for (const cellSize of [undefined, 24, 64]) {
        const source = join(temporary, 'cell.json');
        writeFileSync(source, JSON.stringify({ schemaVersion: 1, cellSize, palette: { '.': '00000000' }, frames: { blank: ['.'] } }));
        const result = spawnSync(process.execPath, ['tools/generate-assets.mjs', '--source', source, '--output', temporary], { encoding: 'utf8' });
        expect(result.status).toBe(1);
      }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
  it('rejects an unknown pixel symbol instead of silently corrupting the atlas', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'rpgameworks-bad-asset-'));
    try {
      const source = join(temporary, 'invalid.json');
      writeFileSync(source, JSON.stringify({ schemaVersion: 1, cellSize: 16, palette: { '.': '00000000' }, frames: { bad: ['?'] } }));
      const result = spawnSync(process.execPath, ['tools/generate-assets.mjs', '--source', source, '--output', temporary], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown color');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
});
