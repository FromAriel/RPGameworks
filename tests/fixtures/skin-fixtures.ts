/**
 * Synthetic window skins for decision 0011 (W3.2 unit checks, W3.3 browser fitting checks). Every required tile is
 * packed left to right on one row with a 1-pixel transparent gutter; each kind of piece gets its own colour so a
 * capture shows what is what. These are test fixtures, not art.
 */
import { PNG } from 'pngjs';
import type { WindowSkinManifestV2 } from '../../src/content/generated/windowskin';

export interface SkinSpec {
  name: string; band: number; corner: [number, number]; railPeriod: number; title: [number, number, number];
  mid?: [number, number]; spacing?: 'mirrored-end' | 'even'; gapFill?: 'tile' | 'railEdge';
}

export const SKIN_SPECS: SkinSpec[] = [
  { name: 'thin 4-pixel band', band: 4, corner: [4, 4], railPeriod: 6, title: [4, 4, 4], mid: [6, 4] },
  { name: 'thick 24-pixel band', band: 24, corner: [24, 24], railPeriod: 20, title: [24, 24, 24], mid: [28, 24] },
  { name: '32-pixel chunky corners on an 8-pixel band', band: 8, corner: [32, 32], railPeriod: 10, title: [8, 8, 8], mid: [12, 10] },
  { name: 'wide title pieces', band: 12, corner: [12, 12], railPeriod: 16, title: [20, 6, 20], mid: [16, 12] },
  { name: 'even-spaced rails with an edge-stretch gap fill', band: 10, corner: [14, 14], railPeriod: 14, title: [10, 10, 10], spacing: 'even', gapFill: 'railEdge' },
];

const COLOURS: [RegExp, number][] = [
  [/^corner\./, 0xdce8efff], [/^edge\./, 0x8da5bcff], [/^fill\./, 0x111a29ff], [/^title\./, 0x87cbe6ff],
  [/^mid\./, 0xf1c35aff], [/^divider\./, 0x425974ff],
];

export interface BuiltSkin { skin: WindowSkinManifestV2; width: number; height: number; pixels: Buffer }

export function buildSkin(spec: SkinSpec): BuiltSkin {
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
  const width = x, height = Math.max(...sizes.map(([, , h]) => h));
  const spacing = spec.spacing ?? 'mirrored-end';
  const rail = (tile: string) => ({ spacing, gapFill: spec.gapFill === 'railEdge' ? { railEdge: 'start' as const } : { tile } });
  const minEdge = spec.mid ? 2 * Math.max(cw, ch) + spec.mid[0] + 8 : 0;
  const skin: WindowSkinManifestV2 = {
    format: 'rpgameworks.windowskin', formatVersion: 2, theme: spec.name, image: 'fixture.png', size: { width, height },
    geometry: {
      band: { top: b, right: b, bottom: b, left: b }, title: { textCenter: Math.floor(b / 2), textGap: 3 },
      rails: { top: rail('edge.h.plain'), right: rail('edge.v.plain'), bottom: rail('edge.h.plain'), left: rail('edge.v.plain') },
      ...(spec.mid ? { midpoints: { top: { minEdge }, right: { minEdge }, bottom: { minEdge }, left: { minEdge } } } : {}),
    },
    tiles,
  };
  const pixels = Buffer.alloc(width * height * 4, 0);
  for (const tile of tiles) {
    if (!tile.rect) continue;
    const colour = COLOURS.find(([pattern]) => pattern.test(tile.id))?.[1] ?? 0xffffffff;
    for (let y = tile.rect.y; y < tile.rect.y + tile.rect.h; y++) {
      for (let px = tile.rect.x; px < tile.rect.x + tile.rect.w; px++) pixels.writeUInt32BE(colour, (y * width + px) * 4);
    }
  }
  return { skin, width, height, pixels };
}

/** The fixture's atlas as a PNG data URL, for loading it in a browser page. */
export function atlasDataUrl(built: BuiltSkin): string {
  const png = new PNG({ width: built.width, height: built.height });
  built.pixels.copy(png.data);
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}
