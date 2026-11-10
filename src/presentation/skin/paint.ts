import manifest from '../../../assets/source/ui/base/Window.manifest.json';
import { contentInsets, readSkinManifest } from './skin-manifest.mjs';
import { frameGeometry, skinGeometry, spanParts } from './layout';
import type { Rect, RailRule, Side, SkinGeometry, TitleBox } from './layout';

type Axis = 'h' | 'v';
/** What a composed window tells its element about fitting, in source-UI pixels (decision 0011 W3.3). */
export interface FrameFit { url: string; titleMode: 'gap' | 'header'; top: number; titleSlot: number }

/** A single bounded off-DOM bitmap; live text and controls are never rasterized. */
export class SkinPainter {
  readonly canvas = document.createElement('canvas');
  /** The skin's resolved geometry; the loader uses it for divider placement. */
  readonly geometry: SkinGeometry;
  /** Where content may start inside the frame on each side: the skin's override, or frame reach plus margin. */
  readonly insets: Record<Side, number>;
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly image: HTMLImageElement, source: unknown = manifest) {
    const read = readSkinManifest(source);
    if (!read.ok) throw new Error(`Invalid window skin manifest: ${read.errors[0]}`);
    if (image.naturalWidth !== read.skin.size.width || image.naturalHeight !== read.skin.size.height) {
      throw new Error(`Expected a ${read.skin.size.width} × ${read.skin.size.height} atlas`);
    }
    this.geometry = skinGeometry(read.skin);
    this.insets = contentInsets(read.skin);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable for window decoration');
    this.ctx = ctx;
  }
  private rect(id: string): Rect {
    const rect = this.geometry.rects.get(id);
    if (!rect) throw new Error(`Unknown windowskin tile: ${id}`);
    return rect;
  }
  private reset(width: number, height: number): void {
    this.canvas.width = width; this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }
  private stamp(id: string, x: number, y: number, mirror: Axis | null = null, width?: number, height?: number): void {
    const r = this.rect(id), ctx = this.ctx, w = width ?? r.w, h = height ?? r.h;
    ctx.save();
    ctx.translate(x + (mirror === 'h' ? w : 0), y + (mirror === 'v' ? h : 0));
    ctx.scale(mirror === 'h' ? -1 : 1, mirror === 'v' ? -1 : 1);
    ctx.drawImage(this.image, r.x, r.y, w, h, 0, 0, w, h);
    ctx.restore();
  }
  /** Tile a piece across an area: repeated, never stretched; the last row and column are cropped. */
  private fill(id: string, x: number, y: number, width: number, height: number): void {
    const r = this.rect(id);
    for (let dy = 0; dy < height; dy += r.h) {
      for (let dx = 0; dx < width; dx += r.w) this.stamp(id, x + dx, y + dy, null, Math.min(r.w, width - dx), Math.min(r.h, height - dy));
    }
  }
  /** One rail run: whole pattern tiles (never cut), with the skin's gap fill in the plain parts. */
  private rail(id: string, rule: RailRule, axis: Axis, x: number, y: number, length: number): void {
    const r = this.rect(id), period = axis === 'h' ? r.w : r.h;
    for (const part of spanParts(length, period, rule.spacing)) {
      const dx = x + (axis === 'h' ? part.offset : 0), dy = y + (axis === 'v' ? part.offset : 0);
      if (part.kind === 'repeat') { this.stamp(id, dx, dy, part.mirror ? axis : null); continue; }
      const fill = rule.gapFill;
      if (fill.railEdge !== undefined) {
        // Stretch the rail's own first or last pixel row (vertical rail) or column (horizontal rail) along the gap.
        // No source pixels are repainted or alpha-thresholded. See WINDOW-SKIN.md.
        const end = fill.railEdge === 'end';
        if (axis === 'v') this.ctx.drawImage(this.image, r.x, r.y + (end ? r.h - 1 : 0), r.w, 1, dx, dy, r.w, part.length);
        else this.ctx.drawImage(this.image, r.x + (end ? r.w - 1 : 0), r.y, 1, r.h, dx, dy, part.length, r.h);
      } else {
        const plain = this.rect(fill.tile);
        if (axis === 'h') this.fill(fill.tile, dx, dy, part.length, plain.h);
        else this.fill(fill.tile, dx, dy, plain.w, part.length);
      }
    }
  }
  /** The widest title that still fits between the corners and both title brackets, at this window width. */
  titleSlot(width: number): number {
    const { corner, title: t } = this.geometry;
    return Math.max(0, width - corner.tl.w - corner.tr.w - t.open.w - t.close.w - 2 * t.textGap);
  }
  /** The same for a divider: between its caps and label brackets. */
  dividerSlot(width: number): number {
    const d = this.geometry.divider;
    return Math.max(0, width - d.capLeft.w - d.capRight.w - d.open.w - d.close.w - 2 * this.geometry.title.textGap);
  }
  frame(width: number, height: number, title?: TitleBox): FrameFit {
    const geo = this.geometry, g = frameGeometry(geo, width, height, title), { band, corner, rails, mids } = geo;
    this.reset(width, height);
    // Fill from the middle of each band, so transparent outer corner pixels stay clear.
    const fx = Math.floor(band.left / 2), fy = g.top + Math.floor(band.top / 2);
    this.fill('fill.plain', fx, fy, width - fx - Math.floor(band.right / 2), height - fy - Math.floor(band.bottom / 2));
    const topEnd = width - corner.tr.w;
    if (g.title) {
      const { openX, closeX } = g.title, t = geo.title;
      this.rail('edge.top.left', rails.top, 'h', corner.tl.w, g.top, openX - corner.tl.w);
      this.fill('title.fill', openX + t.open.w, g.top, closeX - openX - t.open.w, t.band);
      this.stamp('title.open', openX, g.top); this.stamp('title.close', closeX, g.top);
      this.rail('edge.top.right', rails.top, 'h', closeX + t.close.w, g.top, topEnd - closeX - t.close.w);
    } else if (g.mid.top !== null && mids.top) {
      this.rail('edge.top.left', rails.top, 'h', corner.tl.w, g.top, g.mid.top - corner.tl.w);
      this.stamp('mid.top', g.mid.top, g.top);
      this.rail('edge.top.right', rails.top, 'h', g.mid.top + mids.top.rect.w, g.top, topEnd - g.mid.top - mids.top.rect.w);
    } else this.rail('edge.top.left', rails.top, 'h', corner.tl.w, g.top, topEnd - corner.tl.w);
    for (const side of ['left', 'right'] as const) {
      const x = side === 'left' ? 0 : width - band.right;
      const start = g.top + (side === 'left' ? corner.tl.h : corner.tr.h);
      const end = height - (side === 'left' ? corner.bl.h : corner.br.h);
      const mid = g.mid[side], medallion = mids[side];
      if (mid !== null && medallion) {
        this.rail(`edge.${side}.upper`, rails[side], 'v', x, start, mid - start);
        this.stamp(`mid.${side}`, side === 'left' ? 0 : width - medallion.rect.w, mid);
        this.rail(`edge.${side}.lower`, rails[side], 'v', x, mid + medallion.rect.h, end - mid - medallion.rect.h);
      } else this.rail(`edge.${side}.upper`, rails[side], 'v', x, start, end - start);
    }
    const bottom = height - band.bottom, bottomEnd = width - corner.br.w;
    if (g.mid.bottom !== null && mids.bottom) {
      this.rail('edge.bottom.left', rails.bottom, 'h', corner.bl.w, bottom, g.mid.bottom - corner.bl.w);
      this.stamp('mid.bottom', g.mid.bottom, height - mids.bottom.rect.h);
      this.rail('edge.bottom.right', rails.bottom, 'h', g.mid.bottom + mids.bottom.rect.w, bottom, bottomEnd - g.mid.bottom - mids.bottom.rect.w);
    } else this.rail('edge.bottom.left', rails.bottom, 'h', corner.bl.w, bottom, bottomEnd - corner.bl.w);
    // Corners last: they sit over everything at the window's own corners and may reach inward past the band.
    this.stamp('corner.tl', 0, g.top); this.stamp('corner.tr', width - corner.tr.w, g.top);
    this.stamp('corner.bl', 0, height - corner.bl.h); this.stamp('corner.br', width - corner.br.w, height - corner.br.h);
    return { url: this.canvas.toDataURL('image/png'), titleMode: g.title ? 'gap' : 'header', top: g.top, titleSlot: this.titleSlot(width) };
  }
  divider(width: number, title?: TitleBox): FrameFit {
    const geo = this.geometry, d = geo.divider;
    const g = frameGeometry(geo, width, geo.minHeight, undefined); // Bounds the width like a frame.
    this.reset(g.width, d.height);
    const gap = geo.title.textGap;
    const openX = title ? Math.floor(title.left) - gap - d.open.w : -1;
    const closeX = title ? Math.ceil(title.right) + gap : width;
    const fits = title && title.height <= title.lineHeight * 1.2 && openX >= d.capLeft.w && closeX + d.close.w <= width - d.capRight.w;
    const rule: RailRule = { spacing: 'mirrored-end', gapFill: { tile: 'divider.h.plain' } };
    this.stamp('divider.cap.left', 0, 0); this.stamp('divider.cap.right', width - d.capRight.w, 0);
    if (fits) {
      this.rail('divider.h.repeat', rule, 'h', d.capLeft.w, 0, openX - d.capLeft.w);
      this.stamp('divider.label.open', openX, 0); this.stamp('divider.label.close', closeX, 0);
      this.rail('divider.h.repeat', rule, 'h', closeX + d.close.w, 0, width - closeX - d.close.w - d.capRight.w);
    } else this.rail('divider.h.repeat', rule, 'h', d.capLeft.w, 0, width - d.capLeft.w - d.capRight.w);
    return { url: this.canvas.toDataURL('image/png'), titleMode: fits ? 'gap' : 'header', top: 0, titleSlot: this.dividerSlot(width) };
  }
  dispose(): void { this.canvas.width = 0; this.canvas.height = 0; }
}
