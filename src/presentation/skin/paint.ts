import manifest from '../../../assets/source/ui/base/Window.manifest.json';
import { frameGeometry, spanParts, TILE } from './layout';
import type { TitleBox } from './layout';

const tiles = new Map(manifest.tiles.map(tile => [tile.id, tile]));
const rect = (id: string) => {
  const tile = tiles.get(id);
  if (!tile) throw new Error(`Unknown windowskin tile: ${id}`);
  return tile.rect;
};

/** A single bounded off-DOM bitmap; live text and controls are never rasterized. */
export class SkinPainter {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly image: HTMLImageElement) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable for window decoration');
    this.ctx = ctx;
  }
  private reset(width: number, height: number): void {
    this.canvas.width = width; this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }
  private stamp(id: string, x: number, y: number, mirror: 'h' | 'v' | null = null, w = TILE, h = TILE): void {
    const r = rect(id), ctx = this.ctx;
    ctx.save();
    ctx.translate(x + (mirror === 'h' ? w : 0), y + (mirror === 'v' ? h : 0));
    ctx.scale(mirror === 'h' ? -1 : 1, mirror === 'v' ? -1 : 1);
    ctx.drawImage(this.image, r.x, r.y, w, h, 0, 0, w, h);
    ctx.restore();
  }
  private fill(id: string, x: number, y: number, width: number, height: number): void {
    for (let dy = 0; dy < height; dy += TILE) {
      for (let dx = 0; dx < width; dx += TILE) this.stamp(id, x + dx, y + dy, null, Math.min(TILE, width-dx), Math.min(TILE, height-dy));
    }
  }
  private rail(id: string, fallback: string, axis: 'h' | 'v', x: number, y: number, length: number): void {
    for (const part of spanParts(length)) {
      const dx = x + (axis === 'h' ? part.offset : 0), dy = y + (axis === 'v' ? part.offset : 0);
      if (part.kind === 'repeat') this.stamp(id, dx, dy, part.mirror ? axis : null);
      else if (id.startsWith('edge.right.')) {
        // Explicit derived connector: repeat the edited right rail's own N port.
        // No source pixels are repainted or alpha-thresholded. See WINDOW-SKIN.md.
        const r = rect(id);
        this.ctx.drawImage(this.image, r.x, r.y, TILE, 1, dx, dy, TILE, part.length);
      } else this.stamp(fallback, dx, dy, null, axis === 'h' ? part.length : TILE, axis === 'v' ? part.length : TILE);
    }
  }
  frame(width: number, height: number, title?: TitleBox): { url: string; titleMode: 'gap' | 'header' } {
    const g = frameGeometry(width, height, title);
    this.reset(width, height);
    const bottom = height - TILE;
    // Fill only the inner rectangle. Transparent external corner pixels stay clear.
    this.fill('fill.plain', 8, g.top + 8, width - 16, height - g.top - 16);
    const topRail = (x: number, length: number, side = 'left') => this.rail(`edge.top.${side}`, 'edge.h.plain', 'h', x, g.top, length);
    if (g.title) {
      const { openX, closeX } = g.title;
      topRail(TILE, openX - TILE);
      this.fill('title.fill', openX + TILE, g.top, closeX - openX - TILE, TILE);
      this.stamp('title.open', openX, g.top); this.stamp('title.close', closeX, g.top);
      topRail(closeX + TILE, width - 2*TILE - closeX, 'right');
    } else topRail(TILE, width - 2*TILE);
    for (const side of ['left', 'right'] as const) {
      const x = side === 'left' ? 0 : width - TILE;
      if (g.sideMid !== null) {
        this.rail(`edge.${side}.upper`, 'edge.v.plain', 'v', x, g.top + TILE, g.sideMid - g.top - TILE);
        this.stamp(`mid.${side}`, x, g.sideMid);
        this.rail(`edge.${side}.lower`, 'edge.v.plain', 'v', x, g.sideMid + TILE, bottom - g.sideMid - TILE);
      } else this.rail(`edge.${side}.upper`, 'edge.v.plain', 'v', x, g.top + TILE, bottom - g.top - TILE);
    }
    if (g.bottomMid !== null) {
      this.rail('edge.bottom.left','edge.h.plain','h',TILE,bottom,g.bottomMid-TILE);
      this.stamp('mid.bottom',g.bottomMid,bottom);
      this.rail('edge.bottom.right','edge.h.plain','h',g.bottomMid+TILE,bottom,width-2*TILE-g.bottomMid);
    } else this.rail('edge.bottom.left','edge.h.plain','h',TILE,bottom,width-2*TILE);
    this.stamp('corner.tl',0,g.top); this.stamp('corner.tr',width-TILE,g.top);
    this.stamp('corner.bl',0,bottom); this.stamp('corner.br',width-TILE,bottom);
    return {url:this.canvas.toDataURL('image/png'),titleMode:g.title?'gap':'header'};
  }
  divider(width: number, title?: TitleBox): { url: string; titleMode: 'gap' | 'header' } {
    const g = frameGeometry(width, 32, undefined);
    this.reset(g.width, TILE);
    const openX = title ? Math.floor(title.left)-4-TILE : -1;
    const closeX = title ? Math.ceil(title.right)+4 : width;
    const fits = title && title.height <= title.lineHeight * 1.2 && openX >= TILE && closeX+TILE <= width-TILE;
    this.stamp('divider.cap.left',0,0); this.stamp('divider.cap.right',width-TILE,0);
    if (fits) {
      this.rail('divider.h.repeat','divider.h.plain','h',TILE,0,openX-TILE);
      this.stamp('divider.label.open',openX,0); this.stamp('divider.label.close',closeX,0);
      this.rail('divider.h.repeat','divider.h.plain','h',closeX+TILE,0,width-closeX-2*TILE);
    } else this.rail('divider.h.repeat','divider.h.plain','h',TILE,0,width-2*TILE);
    return {url:this.canvas.toDataURL('image/png'),titleMode:fits?'gap':'header'};
  }
  dispose(): void { this.canvas.width = 0; this.canvas.height = 0; }
}
