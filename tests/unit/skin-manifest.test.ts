import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTENT_MARGIN, REQUIRED_TILES, contentInsets, fromV1, frameReach, readSkinManifest, tileRects,
} from '../../src/presentation/skin/skin-manifest.mjs';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';

const canonical = JSON.parse(readFileSync('assets/source/ui/base/Window.manifest.json', 'utf8')) as unknown;

/** A small valid v2 skin: a thin 4-pixel band, every required tile packed left to right on one row. */
function thinSkin(): WindowSkinManifestV2 {
  const sizes: [string, number, number][] = [
    ['corner.tl', 4, 4], ['corner.tr', 4, 4], ['corner.bl', 4, 4], ['corner.br', 4, 4],
    ['edge.top.left', 8, 4], ['edge.bottom.left', 8, 4], ['edge.left.upper', 4, 8], ['edge.right.upper', 4, 8],
    ['edge.h.plain', 8, 4], ['edge.v.plain', 4, 8], ['fill.plain', 8, 8],
    ['title.open', 4, 4], ['title.fill', 4, 4], ['title.close', 4, 4],
    ['divider.cap.left', 4, 4], ['divider.cap.right', 4, 4], ['divider.h.repeat', 8, 4], ['divider.h.plain', 8, 4],
    ['divider.label.open', 4, 4], ['divider.label.close', 4, 4], ['mid.bottom', 6, 4],
  ];
  let x = 0;
  const tiles: WindowSkinManifestV2['tiles'] = sizes.map(([id, w, h]) => { const tile = { id, rect: { x, y: 0, w, h } }; x += w; return tile; });
  tiles.push({ id: 'edge.top.right', same: 'edge.top.left' }, { id: 'edge.bottom.right', same: 'edge.bottom.left' },
    { id: 'edge.left.lower', same: 'edge.left.upper' }, { id: 'edge.right.lower', same: 'edge.right.upper' });
  const rail = (tile: string) => ({ spacing: 'mirrored-end' as const, gapFill: { tile } });
  return {
    format: 'rpgameworks.windowskin', formatVersion: 2, theme: 'Thin test', image: 'thin.png', size: { width: x, height: 8 },
    geometry: {
      band: { top: 4, right: 4, bottom: 4, left: 4 },
      title: { textCenter: 2, textGap: 2 },
      rails: { top: rail('edge.h.plain'), bottom: rail('edge.h.plain'), left: { spacing: 'even', gapFill: { tile: 'edge.v.plain' } }, right: { spacing: 'even', gapFill: { railEdge: 'end' } } },
      midpoints: { bottom: { minEdge: 14 } },
    },
    tiles,
  };
}
const errorsOf = (skin: unknown) => { const result = readSkinManifest(skin); return result.ok ? [] : result.errors; };
const rect = (skin: WindowSkinManifestV2, id: string) => skin.tiles.find((t) => t.id === id)!.rect!;

describe('window skin manifest v2 (decision 0011 W3.1)', () => {
  it('reads Ariel’s v1 manifest as v2 with exactly W1’s geometry', () => {
    const result = readSkinManifest(canonical);
    expect(result.ok && result.sourceVersion).toBe(1);
    if (!result.ok) return;
    const g = result.skin.geometry;
    expect(g.band).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(g.title).toEqual({ textCenter: 8, textGap: 4 });
    expect(g.rails.right.gapFill).toEqual({ railEdge: 'start' }); // paint.ts's derived right-edge connector, now data.
    expect([g.rails.top, g.rails.left, g.rails.bottom].map((r) => r.gapFill.tile)).toEqual(['edge.h.plain', 'edge.v.plain', 'edge.h.plain']);
    expect(Object.values(g.rails).every((r) => r.spacing === 'mirrored-end')).toBe(true);
    expect(g.midpoints).toEqual({ right: { minEdge: 96 }, bottom: { minEdge: 96 }, left: { minEdge: 96 } }); // No top medallion in W1.
    expect(contentInsets(result.skin)).toEqual({ top: 20, right: 16, bottom: 16, left: 16 }); // The declared insets win.
    expect(frameReach(result.skin)).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
    expect(tileRects(result.skin).size).toBe(64);
  });

  it('accepts the same skin written out as a v2 manifest', () => {
    const v2 = JSON.parse(JSON.stringify(fromV1(canonical)));
    const result = readSkinManifest(v2);
    expect(result.ok && result.sourceVersion).toBe(2);
    if (result.ok) expect(result.skin).toEqual(v2);
  });

  it('derives insets from the deepest frame piece plus the default 4-pixel margin', () => {
    const skin = thinSkin();
    expect(errorsOf(skin)).toEqual([]);
    expect(DEFAULT_CONTENT_MARGIN).toBe(4);
    expect(contentInsets(skin)).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
    // A chunky corner reaching 12 pixels in pushes that side's content inward; an explicit margin replaces 4.
    rect(skin, 'corner.tl').w = 12; rect(skin, 'corner.tl').h = 12; skin.size.height = 12;
    skin.tiles.forEach((t) => { if (t.rect && t.id !== 'corner.tl' && t.rect.x >= 4) t.rect.x += 8; });
    skin.size.width += 8; skin.geometry.contentMargin = 1;
    expect(errorsOf(skin)).toEqual([]);
    expect(contentInsets(skin)).toEqual({ top: 13, right: 5, bottom: 5, left: 13 });
    // Every role the W1 compositor draws is required; everything else in an atlas is optional.
    expect(REQUIRED_TILES).toHaveLength(22);
  });

  it('reports each invalid skin with a precise message', () => {
    const cases: [string, (s: WindowSkinManifestV2) => void, string][] = [
      ['overlap', (s) => { rect(s, 'corner.tr').x = 2; }, 'Tiles corner.tl and corner.tr overlap at x 2, y 0 (2 × 4); use "same" to reuse art'],
      ['outside', (s) => { rect(s, 'fill.plain').y = 4; }, `Tile fill.plain (x ${rect(thinSkin(), 'fill.plain').x}, y 4, 8 × 8) lies outside the`],
      ['missing role', (s) => { s.tiles = s.tiles.filter((t) => t.id !== 'title.fill'); }, 'Missing required tile: title.fill'],
      ['alias to nothing', (s) => { s.tiles.find((t) => t.id === 'edge.top.right')!.same = 'edge.top.middle'; }, 'Tile edge.top.right reuses edge.top.middle, which does not exist'],
      ['alias chain', (s) => { s.tiles.find((t) => t.id === 'edge.top.right')!.same = 'edge.bottom.right'; }, 'Tile edge.top.right reuses edge.bottom.right, which is itself an alias'],
      ['corner thinner than band', (s) => { rect(s, 'corner.tl').w = 3; }, 'corner.tl is 3 pixels deep on the left side, thinner than the left band (4)'],
      ['rail thickness', (s) => { s.geometry.band.top = 3; }, 'edge.top.left is 4 pixels thick, but the top band is 3'],
      ['outward overhang', (s) => { s.tiles.find((t) => t.id === 'corner.br')!.outset = { x: 2, y: 0 }; }, 'Tile corner.br reaches outside the window box (outset 2, 0); outward overhang is not supported yet (decision 0011 D10)'],
      ['medallion over corners', (s) => { s.geometry.midpoints = { bottom: { minEdge: 10 } }; }, 'midpoints.bottom.minEdge (10) is shorter than corner.bl, mid.bottom and corner.br together (14)'],
      ['missing medallion', (s) => { s.geometry.midpoints = { left: { minEdge: 40 } }; }, 'midpoints.left is enabled but tile mid.left does not exist'],
      ['content on frame', (s) => { s.geometry.contentInsets = { top: 8, right: 8, bottom: 8, left: 3 }; }, 'contentInsets.left (3) would put content on the frame, which reaches 4 pixels in on that side'],
      ['gap fill thickness', (s) => { s.geometry.rails.top.gapFill = { tile: 'edge.v.plain' }; }, 'rails.top.gapFill tile edge.v.plain is 8 pixels thick, but the top band is 4'],
      ['gap fill both', (s) => { s.geometry.rails.top.gapFill = { tile: 'edge.h.plain', railEdge: 'start' }; }, 'rails.top.gapFill needs exactly one of "tile" or "railEdge"'],
      ['title heights', (s) => { rect(s, 'title.fill').h = 3; }, 'title.open, title.fill and title.close must share one height (4, 3, 4)'],
      ['title text centre', (s) => { s.geometry.title.textCenter = 4; }, 'title.textCenter (4) must lie inside the title band (0–3)'],
      ['divider heights', (s) => { rect(s, 'divider.h.plain').h = 3; }, 'Divider tiles must share one height'],
      ['duplicate id', (s) => { s.tiles.push({ id: 'fill.plain', same: 'corner.tl' }); }, 'Duplicate tile id: fill.plain'],
    ];
    for (const [name, mutate, message] of cases) {
      const skin = thinSkin();
      mutate(skin);
      const errors = errorsOf(skin);
      expect(errors.some((e) => e.startsWith(message)), `${name}: ${JSON.stringify(errors)}`).toBe(true);
    }
  });

  it('rejects structural mistakes and unknown versions before any geometry check', () => {
    expect(errorsOf({ ...thinSkin(), extra: true })[0]).toMatch(/^Manifest structure: \/ must NOT have additional properties/);
    expect(errorsOf({ ...thinSkin(), formatVersion: 3 })).toEqual(['Unsupported window skin formatVersion: 3 (expected 1 or 2)']);
    const broken = JSON.parse(JSON.stringify(canonical)) as { frame: { band?: number } };
    delete broken.frame.band;
    expect(errorsOf(broken)).toEqual(['v1: frame needs integer band, railCenter and contentInsets.top/right/bottom/left']);
  });
});

describe('audit tool on a v2 skin', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rpg-skin-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (skin: WindowSkinManifestV2, fillGutter = false) => {
    const png = new PNG({ width: skin.size.width, height: skin.size.height });
    png.data.fill(0);
    for (const tile of skin.tiles) {
      if (!tile.rect) continue;
      for (let y = tile.rect.y; y < tile.rect.y + tile.rect.h; y++) for (let x = tile.rect.x; x < tile.rect.x + tile.rect.w; x++) png.data.writeUInt32BE(0x8da5bcff, (y * png.width + x) * 4);
    }
    if (fillGutter) png.data.writeUInt32BE(0xffffffff, png.data.length - 4); // Bottom-right pixel, outside every tile.
    writeFileSync(path.join(dir, skin.image), PNG.sync.write(png));
    const file = path.join(dir, 'thin.manifest.json');
    writeFileSync(file, JSON.stringify(skin));
    return file;
  };
  const audit = (file: string) => execFileSync(process.execPath, ['tools/audit-windowskin.mjs', '--manifest', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  it('measures a valid v2 skin and reports its reach and insets', () => {
    const report = JSON.parse(audit(write(thinSkin()))) as Record<string, unknown>;
    expect(report).toMatchObject({ version: 2, width: thinSkin().size.width, height: 8, tiles: 25, resolvedTiles: 25, gutterNontransparent: 0,
      frameReach: { top: 4, right: 4, bottom: 4, left: 4 }, contentInsets: { top: 8, right: 8, bottom: 8, left: 8 } });
  });

  it('fails on art outside every tile and on a PNG that does not match the manifest', () => {
    expect(() => audit(write(thinSkin(), true))).toThrow(/Nontransparent packing gutter/);
    const skin = thinSkin();
    const file = write(skin);
    writeFileSync(file, JSON.stringify({ ...skin, size: { width: skin.size.width, height: 12 } }));
    expect(() => audit(file)).toThrow(/manifest declares/);
  });
});
