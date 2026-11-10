import { describe, expect, it } from 'vitest';
import { installFakeDocument } from './skin-harness';
import type { DrawCall, FakeCanvas, FakeImage } from './skin-harness';
import { readSkinManifest, tileRects } from '../../src/presentation/skin/skin-manifest.mjs';
import { frameGeometry, skinGeometry } from '../../src/presentation/skin/layout';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';

/**
 * Decision 0011 W3.2 acceptance: synthetic skins compose with no gaps, overlaps, cut patterns or stretched ornaments
 * at odd and even sizes. The checks read the compositor's recorded draw calls, so they hold for any artwork.
 */
interface Spec {
  name: string; band: number; corner: [number, number]; railPeriod: number; title: [number, number, number];
  mid?: [number, number]; spacing?: 'mirrored-end' | 'even'; gapFill?: 'tile' | 'railEdge';
}
const SPECS: Spec[] = [
  { name: 'thin 4-pixel band', band: 4, corner: [4, 4], railPeriod: 6, title: [4, 4, 4], mid: [6, 4] },
  { name: 'thick 24-pixel band', band: 24, corner: [24, 24], railPeriod: 20, title: [24, 24, 24], mid: [28, 24] },
  { name: '32-pixel chunky corners on an 8-pixel band', band: 8, corner: [32, 32], railPeriod: 10, title: [8, 8, 8], mid: [12, 10] },
  { name: 'wide title pieces', band: 12, corner: [12, 12], railPeriod: 16, title: [20, 6, 20], mid: [16, 12] },
  { name: 'even-spaced rails with an edge-stretch gap fill', band: 10, corner: [14, 14], railPeriod: 14, title: [10, 10, 10], spacing: 'even', gapFill: 'railEdge' },
];

function build(spec: Spec): { skin: WindowSkinManifestV2; image: FakeImage } {
  const b = spec.band, [cw, ch] = spec.corner, p = spec.railPeriod, [ow, fw, cl] = spec.title;
  const sizes: [string, number, number][] = [
    ['corner.tl', cw, ch], ['corner.tr', cw, ch], ['corner.bl', cw, ch], ['corner.br', cw, ch],
    ['edge.top.left', p, b], ['edge.bottom.left', p, b], ['edge.left.upper', b, p], ['edge.right.upper', b, p],
    ['edge.h.plain', p, b], ['edge.v.plain', b, p], ['fill.plain', 7, 5],
    ['title.open', ow, b], ['title.fill', fw, b], ['title.close', cl, b],
    ['divider.cap.left', b, b], ['divider.cap.right', b, b], ['divider.h.repeat', p, b], ['divider.h.plain', p, b],
    ['divider.label.open', ow, b], ['divider.label.close', cl, b],
  ];
  if (spec.mid) {
    const [along, thick] = spec.mid;
    sizes.push(['mid.top', along, thick], ['mid.bottom', along, thick], ['mid.left', thick, along], ['mid.right', thick, along]);
  }
  let x = 0;
  const tiles: WindowSkinManifestV2['tiles'] = sizes.map(([id, w, h]) => { const tile = { id, rect: { x, y: 0, w, h } }; x += w + 1; return tile; });
  tiles.push({ id: 'edge.top.right', same: 'edge.top.left' }, { id: 'edge.bottom.right', same: 'edge.bottom.left' },
    { id: 'edge.left.lower', same: 'edge.left.upper' }, { id: 'edge.right.lower', same: 'edge.right.upper' });
  const height = Math.max(...sizes.map(([, , h]) => h));
  const spacing = spec.spacing ?? 'mirrored-end';
  const rail = (tile: string) => ({ spacing, gapFill: spec.gapFill === 'railEdge' ? { railEdge: 'start' as const } : { tile } });
  const minEdge = spec.mid ? 2 * Math.max(cw, ch) + spec.mid[0] + 8 : 0;
  const skin: WindowSkinManifestV2 = {
    format: 'rpgameworks.windowskin', formatVersion: 2, theme: spec.name, image: 'fixture.png', size: { width: x, height },
    geometry: {
      band: { top: b, right: b, bottom: b, left: b }, title: { textCenter: Math.floor(b / 2), textGap: 3 },
      rails: { top: rail('edge.h.plain'), right: rail('edge.v.plain'), bottom: rail('edge.h.plain'), left: rail('edge.v.plain') },
      ...(spec.mid ? { midpoints: { top: { minEdge }, right: { minEdge }, bottom: { minEdge }, left: { minEdge } } } : {}),
    },
    tiles,
  };
  const pixels = Buffer.alloc(x * height * 4, 0xff); // Opaque white: the checks below read draw calls, not colours.
  return { skin, image: { naturalWidth: x, naturalHeight: height, pixels } };
}

const overlaps = (a: DrawCall, b: DrawCall) => Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) && Math.max(a.y0, b.y0) < Math.min(a.y1, b.y1);

describe('fixture skins compose cleanly at odd and even sizes (decision 0011 W3.2)', () => {
  for (const spec of SPECS) {
    it(spec.name, async () => {
      const { skin, image } = build(spec);
      const read = readSkinManifest(skin);
      expect(read.ok ? [] : read.errors).toEqual([]);
      const canvases = installFakeDocument();
      const { SkinPainter } = await import('../../src/presentation/skin/paint');
      const painter = new SkinPainter(image as unknown as HTMLImageElement, skin);
      const canvas = canvases.at(-1) as FakeCanvas;
      const geo = skinGeometry(skin), rects = tileRects(skin);
      const idAt = new Map([...rects].map(([id, r]) => [`${r.x},${r.y}`, id]));
      const fill = rects.get('fill.plain')!;
      const ornaments = ['corner.tl', 'corner.tr', 'corner.bl', 'corner.br', 'title.open', 'title.close', 'mid.top', 'mid.right', 'mid.bottom', 'mid.left'];
      const repeats = ['edge.top.left', 'edge.bottom.left', 'edge.left.upper', 'edge.right.upper'];
      const sizes: [number, number][] = [[geo.minWidth, geo.minHeight], [geo.minWidth + 1, geo.minHeight + 1], [97, 61], [128, 96], [255, 143], [300, 200], [401, 257]];
      let gaps = 0;
      for (const [w, h] of sizes) {
        for (const title of [undefined, { left: Math.floor(w / 2) - 20, right: Math.floor(w / 2) + 20, centerY: geo.title.textCenter + 3, height: 16, lineHeight: 16 }]) {
          if (w < geo.minWidth || h < geo.minHeight) continue;
          canvas.context.calls.length = 0;
          const result = painter.frame(w, h, title);
          if (result.titleMode === 'gap') gaps += 1;
          const top = frameGeometry(geo, w, h, title).top;
          const where = `${w}×${h}${title ? ' titled' : ''}`;
          const calls = canvas.context.calls;
          const pieces = calls.filter((c) => !(c.sx >= fill.x && c.sx < fill.x + fill.w && c.sy === fill.y && c.sw <= fill.w && c.sh <= fill.h));
          for (const c of pieces) {
            const id = idAt.get(`${c.sx},${c.sy}`);
            const stretched = c.x1 - c.x0 !== c.sw || c.y1 - c.y0 !== c.sh;
            // Only an edge-stretch gap fill (one source row or column) may stretch.
            if (stretched) expect(c.sw === 1 || c.sh === 1, `${where}: stretched ${id ?? `${c.sx},${c.sy}`}`).toBe(true);
            if (id && ornaments.includes(id)) expect([c.sw, c.sh], `${where}: ${id} drawn whole`).toEqual([rects.get(id)!.w, rects.get(id)!.h]);
            if (id && repeats.includes(id) && !stretched && c.sw !== 1 && c.sh !== 1) expect([c.sw, c.sh], `${where}: ${id} pattern cut`).toEqual([rects.get(id)!.w, rects.get(id)!.h]);
            for (const d of pieces) if (d !== c) expect(overlaps(c, d), `${where}: frame pieces overlap at ${c.x0},${c.y0} and ${d.x0},${d.y0}`).toBe(false);
          }
          // Every pixel of the band ring (from the lowered top) is covered by exactly one frame piece: no gaps.
          const covered = new Uint8Array(w * h);
          for (const c of pieces) for (let y = c.y0; y < c.y1; y++) for (let x = c.x0; x < c.x1; x++) covered[y * w + x]! += 1;
          const b = geo.band;
          for (let y = top; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const inRing = x < b.left || x >= w - b.right || y < top + b.top || y >= h - b.bottom;
              if (inRing) expect(covered[y * w + x], `${where}: band pixel ${x},${y}`).toBe(1);
            }
          }
        }
      }
      expect(gaps, 'at least one size used the title gap').toBeGreaterThan(0);
    });
  }
});
