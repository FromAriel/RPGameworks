/**
 * Normal derivation, ported from Pixel Frame `normals.js`. Convention: x right, y DOWN, z toward
 * the viewer. nx < 0 = left-facing, ny < 0 = top-facing.
 */
import { COVERED, MAT, SRC } from './bitmap.ts';
import type { Frame } from './bitmap.ts';

export type NormalMode = 'profile' | 'sobel' | 'distance' | 'blend';

/** L, R, T, B, TL, BR, TR, BL */
const DIRS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]];
/** Half weight, projected onto each axis (0.5 * cos 45deg). */
const DIAG = 0.3536;

function setFromSlope(frame: Frame, i: number, gx: number, gy: number, k: number): void {
  const x = -gx * k;
  const y = -gy * k;
  const len = Math.hypot(x, y, 1);
  frame.nx[i] = x / len;
  frame.ny[i] = y / len;
  frame.nz[i] = 1 / len;
}

function setFromXY(frame: Frame, i: number, nx0: number, ny0: number): void {
  let nx = nx0;
  let ny = ny0;
  let len2 = nx * nx + ny * ny;
  if (len2 > 0.96) {
    const s = Math.sqrt(0.96 / len2);
    nx *= s; ny *= s; len2 = 0.96;
  }
  frame.nx[i] = nx;
  frame.ny[i] = ny;
  frame.nz[i] = Math.sqrt(1 - len2);
}

/** Exact for swept profiles: an edge's height only changes along depth. */
function profileMode(frame: Frame, k: number): void {
  const { w, h } = frame;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (frame.cov[i] !== COVERED) continue;
      const gx = (frame.heightAt(x + 1, y) - frame.heightAt(x - 1, y)) / 2;
      const gy = (frame.heightAt(x, y + 1) - frame.heightAt(x, y - 1)) / 2;
      setFromSlope(frame, i, gx, gy, k);
    }
  }
}

function sobelMode(frame: Frame, k: number): void {
  const { w, h } = frame;
  const H = (x: number, y: number) => frame.heightAt(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (frame.cov[i] !== COVERED) continue;
      const gx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) / 8;
      const gy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) / 8;
      setFromSlope(frame, i, gx, gy, k);
    }
  }
}

/** A pixel faces whichever direction has the nearest open space; rays stop at the first open pixel. */
function distanceMode(frame: Frame, radius: number, k: number): void {
  const { w, h } = frame;
  const rays = new Uint8Array(8);
  const f = (a: number, b: number) => (a - b) / (a + b);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (frame.cov[i] !== COVERED) continue;
      for (let r = 0; r < 8; r++) {
        const [dx, dy] = DIRS[r]!;
        let s = 1;
        while (s <= radius && frame.covered(x + dx * s, y + dy * s)) s++;
        rays[r] = s;
      }
      frame.dist.set(rays.subarray(0, 4), i * 4);
      const g1 = f(rays[4]!, rays[5]!);
      const g2 = f(rays[6]!, rays[7]!);
      const nx = (f(rays[0]!, rays[1]!) + DIAG * g1 - DIAG * g2) / (1 + 2 * DIAG);
      const ny = (f(rays[2]!, rays[3]!) + DIAG * g1 + DIAG * g2) / (1 + 2 * DIAG);
      const gain = k / 0.8;
      setFromXY(frame, i, nx * gain, ny * gain);
      frame.hgt[i] = Math.min(rays[0]!, rays[1]!, rays[2]!, rays[3]!, radius);
    }
  }
}

/** 50/50 mix of Sobel and the distance rule, keeping the authored heights. */
function blendMode(frame: Frame, radius: number, k: number): void {
  sobelMode(frame, k);
  const sx = frame.nx.slice();
  const sy = frame.ny.slice();
  const authored = frame.hgt.slice();
  distanceMode(frame, radius, k);
  frame.hgt.set(authored);
  for (let i = 0; i < frame.cov.length; i++) {
    if (frame.cov[i] !== COVERED) continue;
    setFromXY(frame, i, (sx[i]! + frame.nx[i]!) / 2, (sy[i]! + frame.ny[i]!) / 2);
  }
}

/** Ridge = a raised high point: no 4-neighbour higher, and the height drops on both sides within 2 px. */
function markRidges(frame: Frame): void {
  const { w, h } = frame;
  const H = (x: number, y: number) => frame.heightAt(x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      frame.ridge[i] = 0;
      if (frame.cov[i] !== COVERED) continue;
      const v = H(x, y);
      if (v <= 0) continue;
      if (H(x - 1, y) > v || H(x + 1, y) > v || H(x, y - 1) > v || H(x, y + 1) > v) continue;
      const lowerL = H(x - 1, y) < v || (H(x - 1, y) === v && H(x - 2, y) < v);
      const lowerR = H(x + 1, y) < v || (H(x + 1, y) === v && H(x + 2, y) < v);
      const lowerT = H(x, y - 1) < v || (H(x, y - 1) === v && H(x, y - 2) < v);
      const lowerB = H(x, y + 1) < v || (H(x, y + 1) === v && H(x, y + 2) < v);
      if ((lowerL && lowerR) || (lowerT && lowerB)) frame.ridge[i] = 1;
    }
  }
}

/** Distance and direction from every pixel to the nearest gem pixel, within `radius`. */
function markGemField(frame: Frame, radius: number): void {
  const { w, h } = frame;
  frame.gemD.fill(255);
  frame.hasGem = false;
  frame.gemR = radius;
  const src = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (frame.cov[i] === COVERED && frame.mat[i] === MAT.GEM) {
      src[i] = i;
      frame.gemD[i] = 0;
      frame.gemDx[i] = 0;
      frame.gemDy[i] = 0;
      queue.push(i);
      frame.hasGem = true;
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const x = i % w, y = (i / w) | 0;
    const s = src[i]!, sx = s % w, sy = (s / w) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      const d = Math.hypot(nx - sx, ny - sy);
      if (d > radius + 0.5) continue;
      if (src[j] === -1 || d < frame.gemD[j]!) {
        if (src[j] === -1) queue.push(j);
        src[j] = s;
        frame.gemD[j] = Math.min(254, Math.round(d));
        frame.gemDx[j] = sx - nx;
        frame.gemDy[j] = sy - ny;
      }
    }
  }
}

/** Art pixels run perpendicular to their slope; swept edges already carry their run direction. */
function markTangents(frame: Frame): void {
  for (let i = 0; i < frame.cov.length; i++) {
    if (frame.cov[i] !== COVERED || frame.src[i] === SRC.EDGE) continue;
    const nx = frame.nx[i]!, ny = frame.ny[i]!;
    const len = Math.hypot(nx, ny);
    if (len > 0.15) {
      frame.tx[i] = -ny / len;
      frame.ty[i] = nx / len;
    } else {
      frame.tx[i] = 0;
      frame.ty[i] = 0;
    }
  }
}

/** Contact shadow as a cavity map at 1 and 2 px, plus convexity for edge wear. */
function markOcclusion(frame: Frame): void {
  const { w, h } = frame;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      frame.ao[i] = 0;
      if (frame.cov[i] !== COVERED) continue;
      const v = frame.hgt[i]!;
      const H = (px: number, py: number) => (frame.covered(px, py) ? frame.hgt[py * w + px]! : v);
      let occ = 0;
      for (let a = 0; a < 8; a += 2) {
        const [dx, dy] = DIRS[a]!;
        for (let s = 1; s <= 2; s++) occ += Math.max(0, H(x + dx * s, y + dy * s) + H(x - dx * s, y - dy * s) - 2 * v) / (s * s);
      }
      frame.ao[i] = Math.min(1, occ / 4);
      let cv = 0;
      for (let a = 0; a < 8; a += 2) {
        const [dx, dy] = DIRS[a]!;
        cv += Math.max(0, 2 * v - frame.heightAt(x + dx, y + dy) - frame.heightAt(x - dx, y - dy));
      }
      frame.cvx[i] = Math.min(1, cv / 6);
    }
  }
}

export interface NormalOptions {
  readonly strength?: number;
  readonly radius?: number;
  readonly inset?: boolean;
  /** 0 raised, 0.5 flat mid-step, 1 sunk (negated). */
  readonly press?: number;
  readonly gemRadius?: number;
  readonly flat?: boolean;
}

export function computeNormals(frame: Frame, mode: NormalMode, opts: NormalOptions = {}): Frame {
  const k = opts.strength ?? 0.8;
  if (mode === 'distance') distanceMode(frame, Math.max(1, opts.radius || 4), k);
  else if (mode === 'sobel') sobelMode(frame, k);
  else if (mode === 'blend') blendMode(frame, Math.max(1, opts.radius || 4), k);
  else profileMode(frame, k);
  markRidges(frame);
  markTangents(frame);
  markOcclusion(frame);
  markGemField(frame, opts.gemRadius || 4);
  const press = opts.press || 0;
  const mult = (opts.inset ? -1 : 1) * (1 - 2 * press);
  let maxH = 0;
  for (let i = 0; i < frame.cov.length; i++) {
    if (frame.cov[i] !== COVERED) continue;
    if (opts.flat) {
      frame.nx[i] = 0; frame.ny[i] = 0; frame.nz[i] = 1;
    } else if (mult !== 1) {
      frame.nx[i] = frame.nx[i]! * mult;
      frame.ny[i] = frame.ny[i]! * mult;
      if (Math.abs(mult) !== 1) frame.nz[i] = Math.sqrt(Math.max(0, 1 - frame.nx[i]! ** 2 - frame.ny[i]! ** 2));
    }
    if (frame.hgt[i]! > maxH) maxH = frame.hgt[i]!;
  }
  frame.maxH = maxH;
  frame.inset = mult < 0;
  frame.press = press;
  return frame;
}

export type FacingClass = 'front' | 'top' | 'bottom' | 'left' | 'right';

/** Five-way class: the dominant facing axis wins. */
export function classify(nx: number, ny: number, t = 0.2): FacingClass {
  const ax = Math.abs(nx), ay = Math.abs(ny);
  if (ax < t && ay < t) return 'front';
  if (ay >= ax) return ny < 0 ? 'top' : 'bottom';
  return nx < 0 ? 'left' : 'right';
}
