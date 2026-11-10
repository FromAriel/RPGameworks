import { describe, expect, it } from 'vitest';
import { installFakeDocument } from './skin-harness';
import type { DrawCall, FakeCanvas } from './skin-harness';
import { SKIN_SPECS, buildSkin } from '../fixtures/skin-fixtures';
import { readSkinManifest, tileRects } from '../../src/presentation/skin/skin-manifest.mjs';
import { frameGeometry, skinGeometry } from '../../src/presentation/skin/layout';

/**
 * Decision 0011 W3.2 acceptance: synthetic skins compose with no gaps, overlaps, cut patterns or stretched ornaments
 * at odd and even sizes. The checks read the compositor's recorded draw calls, so they hold for any artwork.
 */
const overlaps = (a: DrawCall, b: DrawCall) => Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) && Math.max(a.y0, b.y0) < Math.min(a.y1, b.y1);

describe('fixture skins compose cleanly at odd and even sizes (decision 0011 W3.2)', () => {
  for (const spec of SKIN_SPECS) {
    it(spec.name, async () => {
      const { skin, width: aw, height: ah, pixels } = buildSkin(spec);
      const image = { naturalWidth: aw, naturalHeight: ah, pixels };
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
