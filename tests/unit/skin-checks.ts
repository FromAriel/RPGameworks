import { expect } from 'vitest';
import { installFakeDocument } from './skin-harness';
import type { DrawCall, FakeCanvas, FakeImage } from './skin-harness';
import { tileRects } from '../../src/presentation/skin/skin-manifest.mjs';
import { frameGeometry, skinGeometry } from '../../src/presentation/skin/layout';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';

/**
 * Decision 0011 W3.2's composition checks, shared by the synthetic fixture skins and the baked skins (0013 B2).
 * The W1 compositor composes the skin at odd and even sizes, with and without a title, and the recorded draw calls must
 * show: every band pixel covered by exactly one frame piece (no gaps), no two frame pieces overlapping, corners,
 * medallions and title brackets drawn whole, pattern tiles never cut, and only one-row or one-column gap fills stretched.
 */
const overlaps = (a: DrawCall, b: DrawCall) => Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) && Math.max(a.y0, b.y0) < Math.min(a.y1, b.y1);
const key = (r: { x: number; y: number }) => `${r.x},${r.y}`;

export async function expectCleanComposition(skin: WindowSkinManifestV2, image: FakeImage): Promise<void> {
  const canvases = installFakeDocument();
  const { SkinPainter } = await import('../../src/presentation/skin/paint');
  const painter = new SkinPainter(image as unknown as HTMLImageElement, skin);
  const canvas = canvases.at(-1) as FakeCanvas;
  const geo = skinGeometry(skin), rects = tileRects(skin);
  const fill = rects.get('fill.plain')!;
  const keysOf = (ids: readonly string[]) => new Set(ids.flatMap((id) => (rects.has(id) ? [key(rects.get(id)!)] : [])));
  const ornaments = keysOf(['corner.tl', 'corner.tr', 'corner.bl', 'corner.br', 'title.open', 'title.close', 'mid.top', 'mid.right', 'mid.bottom', 'mid.left']);
  const gapFills = keysOf(Object.values(skin.geometry.rails).flatMap((rail) => (rail.gapFill.tile ? [rail.gapFill.tile] : [])));
  const repeats = [...keysOf(['edge.top.left', 'edge.top.right', 'edge.bottom.left', 'edge.bottom.right', 'edge.left.upper', 'edge.left.lower', 'edge.right.upper', 'edge.right.lower'])]
    .filter((k) => !gapFills.has(k)); // A rail that is also its own gap fill may be drawn cropped in the gap.
  const sizeAt = new Map([...rects.values()].map((r) => [key(r), [r.w, r.h]]));
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
      const pieces = canvas.context.calls.filter((c) => !(c.sx >= fill.x && c.sx < fill.x + fill.w && c.sy >= fill.y && c.sy < fill.y + fill.h && c.sw <= fill.w && c.sh <= fill.h));
      for (const c of pieces) {
        const k = key({ x: c.sx, y: c.sy });
        const stretched = c.x1 - c.x0 !== c.sw || c.y1 - c.y0 !== c.sh;
        if (stretched) expect(c.sw === 1 || c.sh === 1, `${where}: stretched piece at ${k}`).toBe(true);
        if (ornaments.has(k)) expect([c.sw, c.sh], `${where}: ornament at ${k} drawn whole`).toEqual(sizeAt.get(k));
        // An edge-stretch gap fill reads one row or column of the rail tile; it is not a cut pattern.
        if (repeats.includes(k) && !stretched && c.sw !== 1 && c.sh !== 1) expect([c.sw, c.sh], `${where}: pattern at ${k} cut`).toEqual(sizeAt.get(k));
        for (const d of pieces) if (d !== c) expect(overlaps(c, d), `${where}: frame pieces overlap at ${c.x0},${c.y0} and ${d.x0},${d.y0}`).toBe(false);
      }
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
}
