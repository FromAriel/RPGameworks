/**
 * Pixel Frame core: per-pixel frame buffers and ornament "art" stamps.
 *
 * Ported to strict TypeScript from Ariel's Pixel Frame demonstrator (pixelstudio,
 * `js/core/bitmap.js`) for decision 0010. Same licence as RPGameworks. DOM-free.
 */

export const MAT = { NONE: 0, METAL: 1, ACCENT: 2, GEM: 3, DARK: 4, NEUTRAL: 5 } as const;
export type Material = (typeof MAT)[keyof typeof MAT];
export const MAT_CHARS: Readonly<Record<string, Material>> = { m: MAT.METAL, a: MAT.ACCENT, g: MAT.GEM, d: MAT.DARK, n: MAT.NEUTRAL };
/** Where a frame pixel came from. */
export const SRC = { NONE: 0, EDGE: 1, MOTIF: 2, MEDALLION: 3, CORNER: 4, CENTER: 5 } as const;
export const COVERED = 1;
/** Art pixel that erases whatever is underneath. */
export const CLEAR = 2;

/** A composed frame in logical pixels. Everything the shading pass needs lives here. */
export class Frame {
  readonly w: number;
  readonly h: number;
  readonly cov: Uint8Array;
  readonly hgt: Float32Array;
  readonly mat: Uint8Array;
  readonly src: Uint8Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly ridge: Uint8Array;
  /** Tangent: the direction the surface runs (brushed metal). */
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  /** Contact shadow / occlusion 0..1. */
  readonly ao: Float32Array;
  /** Convexity 0..1 (crests, outer corners), used by edge wear. */
  readonly cvx: Float32Array;
  /** Distance to the nearest gem pixel (255 = far) and the offset to it. */
  readonly gemD: Uint8Array;
  readonly gemDx: Int8Array;
  readonly gemDy: Int8Array;
  /** L, R, T, B distance to open space (distance normal mode only). */
  readonly dist: Uint8Array;
  maxH = 0;
  hasGem = false;
  gemR = 4;
  inset = false;
  press = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.cov = new Uint8Array(n);
    this.hgt = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.src = new Uint8Array(n);
    this.nx = new Float32Array(n);
    this.ny = new Float32Array(n);
    this.nz = new Float32Array(n);
    this.ridge = new Uint8Array(n);
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.ao = new Float32Array(n);
    this.cvx = new Float32Array(n);
    this.gemD = new Uint8Array(n).fill(255);
    this.gemDx = new Int8Array(n);
    this.gemDy = new Int8Array(n);
    this.dist = new Uint8Array(n * 4);
  }

  index(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? y * this.w + x : -1;
  }

  covered(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.cov[i] === COVERED;
  }

  heightAt(x: number, y: number): number {
    const i = this.index(x, y);
    return i >= 0 && this.cov[i] === COVERED ? this.hgt[i]! : 0;
  }
}

/** Ornament stamp. `ox`/`oy` = the art column/row that lands on the box corner pixel (its overhang). */
export class Art {
  readonly w: number;
  readonly h: number;
  ox = 0;
  oy = 0;
  name = '';
  readonly cov: Uint8Array;
  readonly hgt: Float32Array;
  readonly mat: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cov = new Uint8Array(w * h);
    this.hgt = new Float32Array(w * h);
    this.mat = new Uint8Array(w * h);
  }
}

/** Text form of an art piece: '.' empty, 'x' clear, '0'-'9' height, '#' covered with auto height. */
export interface ArtDef {
  readonly name?: string;
  readonly ox?: number;
  readonly oy?: number;
  readonly height: readonly string[];
  /** Material rows: m metal, a accent, g gem, d dark, n neutral. */
  readonly mat?: readonly string[];
  readonly defaultMat?: string;
  readonly autoCap?: number;
  readonly autoBase?: number;
}

/** City-block distance from every covered pixel to the nearest uncovered one (outside counts as uncovered). */
export function edgeDistance(cov: Uint8Array, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const open = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || cov[y * w + x] !== COVERED;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cov[i] !== COVERED) continue;
      if (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1)) {
        d[i] = 1;
        queue[tail++] = i;
      } else {
        d[i] = 1 << 30;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w;
    const y = (i / w) | 0;
    const next = d[i]! + 1;
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
      const j = ny * w + nx;
      if (cov[j] === COVERED && d[j]! > next) {
        d[j] = next;
        queue[tail++] = j;
      }
    };
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  return d;
}

export function parseArt(def: ArtDef): Art {
  const rows = def.height;
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const art = new Art(w, h);
  art.ox = def.ox ?? 0;
  art.oy = def.oy ?? 0;
  art.name = def.name ?? '';
  const defaultMat = MAT_CHARS[def.defaultMat ?? 'a'] ?? MAT.ACCENT;
  let auto = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ch = rows[y]![x] ?? '.';
      if (ch === 'x') {
        art.cov[i] = CLEAR;
      } else if (ch === '#') {
        art.cov[i] = COVERED;
        art.hgt[i] = -1;
        auto = true;
      } else if (ch >= '0' && ch <= '9') {
        art.cov[i] = COVERED;
        art.hgt[i] = ch.charCodeAt(0) - 48;
      }
      if (art.cov[i] === COVERED) {
        const mc = def.mat?.[y]?.[x];
        art.mat[i] = (mc !== undefined ? MAT_CHARS[mc] : undefined) ?? defaultMat;
      }
    }
  }
  if (auto) {
    const cap = def.autoCap ?? 3;
    const base = def.autoBase ?? 1;
    const d = edgeDistance(art.cov, w, h);
    for (let i = 0; i < w * h; i++) {
      if (art.cov[i] === COVERED && art.hgt[i]! < 0) art.hgt[i] = base + Math.min(d[i]! - 1, cap - 1);
    }
  }
  return art;
}

export function flipArt(art: Art, fx: boolean, fy: boolean): Art {
  const out = new Art(art.w, art.h);
  out.ox = art.ox;
  out.oy = art.oy;
  out.name = art.name;
  for (let y = 0; y < art.h; y++) {
    for (let x = 0; x < art.w; x++) {
      const s = y * art.w + x;
      const t = (fy ? art.h - 1 - y : y) * art.w + (fx ? art.w - 1 - x : x);
      out.cov[t] = art.cov[s]!;
      out.hgt[t] = art.hgt[s]!;
      out.mat[t] = art.mat[s]!;
    }
  }
  return out;
}

export function artToStrings(art: Art): { ox: number; oy: number; height: string[]; mat: string[] } {
  const height: string[] = [];
  const mat: string[] = [];
  const matChar = ['.', 'm', 'a', 'g', 'd', 'n'];
  for (let y = 0; y < art.h; y++) {
    let hr = '';
    let mr = '';
    for (let x = 0; x < art.w; x++) {
      const i = y * art.w + x;
      if (art.cov[i] === CLEAR) { hr += 'x'; mr += '.'; }
      else if (art.cov[i] === COVERED) { hr += String(Math.max(0, Math.min(9, Math.round(art.hgt[i]!)))); mr += matChar[art.mat[i]!]; }
      else { hr += '.'; mr += '.'; }
    }
    height.push(hr);
    mat.push(mr);
  }
  return { ox: art.ox, oy: art.oy, height, mat };
}
