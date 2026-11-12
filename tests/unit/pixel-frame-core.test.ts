import { describe, expect, it } from 'vitest';
import { COVERED, Frame, MAT, SRC, artToStrings } from '../../tools/skin-bake/pixel-frame/bitmap.ts';
import { classify, computeNormals } from '../../tools/skin-bake/pixel-frame/normals.ts';
import { profileSlope, ridgeIndices } from '../../tools/skin-bake/pixel-frame/profile.ts';
import { composeFrame } from '../../tools/skin-bake/pixel-frame/frame.ts';
import type { ComposedFrame } from '../../tools/skin-bake/pixel-frame/frame.ts';
import { createImage, shade } from '../../tools/skin-bake/pixel-frame/shade.ts';
import type { RgbaImage } from '../../tools/skin-bake/pixel-frame/shade.ts';
import { HIGH_CONTRAST, THEMES, hexToRgb, ramp, rampsFromBase, rgbToHsl, themeFromBase } from '../../tools/skin-bake/pixel-frame/palettes.ts';
import { artDef, getArt } from '../../tools/skin-bake/pixel-frame/art.ts';
import { ART_MAX, artFromImage, artToImage } from '../../tools/skin-bake/pixel-frame/art-io.ts';

/**
 * Ariel's Pixel Frame demonstrator's engine checks (numbers in brackets), on the core restored as skin-bake tool code
 * (decision 0013 B2). Check [17] (the 9-slice bake rebuilding a live frame) does not apply: the skin bake cuts W1 tiles
 * instead, and tests/unit/skin-bake.test.ts checks those.
 */

const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) <= eps;
const hueDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function block(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Frame {
  const f = new Frame(w, h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = f.index(x, y);
    f.cov[i] = COVERED; f.hgt[i] = 1; f.mat[i] = MAT.METAL;
  }
  return f;
}
const at = (f: Frame, x: number, y: number) => { const i = f.index(x, y); return { nx: f.nx[i]!, ny: f.ny[i]!, cls: classify(f.nx[i]!, f.ny[i]!) }; };
const colours = (f: ComposedFrame, img: RgbaImage, opaqueOnly = false) => {
  const out: string[] = [];
  for (let i = 0; i < f.cov.length; i++) {
    const a = img.data[i * 4 + 3]!;
    if (opaqueOnly ? a !== 255 : !f.cov[i]) continue;
    out.push(`${img.data[i * 4]},${img.data[i * 4 + 1]},${img.data[i * 4 + 2]}`);
  }
  return out;
};
const rampSet = (ramps: readonly (readonly string[])[], steps?: number) =>
  new Set(ramps.flatMap(r => (steps ? ramp(r, steps) : r.map(hexToRgb)).map(c => c.join(','))));

describe('Pixel Frame core, restored for the skin bake (decision 0013 B2)', () => {
  it('[1] sweeps profiles symmetrically with the ridge at the maximum', () => {
    for (const p of [[1, 3, 4, 3, 1], [2, 4, 2, 1, 2, 4, 2], [1, 2, 1]]) {
      for (let d = 0; d < p.length; d++) expect(near(profileSlope(p, d), -profileSlope(p, p.length - 1 - d))).toBe(true);
    }
    expect(ridgeIndices([1, 3, 4, 3, 1])).toEqual([2]);
    expect(profileSlope([1, 2, 2, 2, 1], 2)).toBe(0);
    const f = composeFrame('round', 40, 30, { normalMode: 'profile' });
    const x = f.M + 20;
    expect(f.ny[f.index(x, f.M)]!).toBeLessThan(0); // outer pixel of the top bar faces up
    expect(f.ridge[f.index(x, f.M + 2)]).toBe(1);
  });

  it('[2] distance rule: a solid block faces outward at its rim and front inside', () => {
    const f = block(14, 12, 2, 2, 11, 9);
    computeNormals(f, 'distance', { radius: 3 });
    expect(at(f, 6, 2).cls).toBe('top');
    expect(at(f, 2, 5).cls).toBe('left');
    expect(at(f, 11, 5).cls).toBe('right');
    expect(at(f, 6, 9).cls).toBe('bottom');
    expect(at(f, 2, 2).nx).toBeLessThan(-0.1);
    expect(at(f, 2, 2).ny).toBeLessThan(-0.1);
    expect(at(f, 6, 5).cls).toBe('front');
  });

  it('[4] pressed frames are the exact negation of raised ones in every normal mode', () => {
    for (const mode of ['profile', 'sobel', 'distance', 'blend'] as const) {
      const a = composeFrame('gem', 50, 34, { normalMode: mode });
      const b = composeFrame('gem', 50, 34, { normalMode: mode, pressed: true });
      for (let i = 0; i < a.cov.length; i++) {
        if (!a.cov[i]) continue;
        expect(a.nx[i] === -b.nx[i]! && a.ny[i] === -b.ny[i]! && a.nz[i] === b.nz[i]).toBe(true);
      }
    }
  });

  it('[4b] blend mode averages Sobel and the distance rule and keeps authored heights', () => {
    const s = composeFrame('gem', 50, 34, { normalMode: 'sobel', radius: 5 });
    const d = composeFrame('gem', 50, 34, { normalMode: 'distance', radius: 5 });
    const b = composeFrame('gem', 50, 34, { normalMode: 'blend', radius: 5 });
    for (let i = 0; i < b.cov.length; i++) {
      if (!b.cov[i]) continue;
      let ax = (s.nx[i]! + d.nx[i]!) / 2, ay = (s.ny[i]! + d.ny[i]!) / 2;
      const len2 = ax * ax + ay * ay;
      if (len2 > 0.96) { const k = Math.sqrt(0.96 / len2); ax *= k; ay *= k; }
      expect(near(b.nx[i]!, ax) && near(b.ny[i]!, ay)).toBe(true);
      expect(b.hgt[i]).toBe(s.hgt[i]);
    }
  });

  it('[5] keeps corners identical across sizes, spaces rivets evenly and centres medallions', () => {
    const a = composeFrame('gem', 60, 40), b = composeFrame('gem', 75, 53);
    const span = a.corner!.art.w + 2;
    for (let y = 0; y < span; y++) for (let x = 0; x < span; x++) {
      const ia = a.index(a.corner!.tl[0] + x, a.corner!.tl[1] + y), ib = b.index(b.corner!.tl[0] + x, b.corner!.tl[1] + y);
      expect(a.cov[ia] === b.cov[ib] && a.hgt[ia] === b.hgt[ib] && a.nx[ia] === b.nx[ib]).toBe(true);
    }
    for (const W of [61, 67, 73, 90, 101]) {
      const f = composeFrame('riveted', W, 48);
      const xs = f.motifs.x;
      expect(xs.length).toBeGreaterThan(0);
      const gaps = xs.slice(1).map((v, i) => v - xs[i]!);
      if (gaps.length) expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
      const reserve = f.corner!.art.w - f.corner!.art.ox;
      expect(Math.abs((xs[0]! - reserve) - (W - 1 - reserve - xs[xs.length - 1]!))).toBeLessThanOrEqual(1);
    }
    for (const W of [61, 62, 77, 78]) {
      const f = composeFrame('medallion', W, 40);
      expect(f.medalX).not.toBeNull();
      const left = f.medalX!, right = W - (f.medalX! + f.medalW);
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
      if ((W - f.medalW) % 2 === 0) expect(left).toBe(right);
    }
  });

  it('[6] mirrors corner normals (top-left faces left, top-right faces right)', () => {
    let checked = 0;
    for (const size of ['small', 'medium', 'large'] as const) for (const id of ['gem', 'fleur', 'rosette', 'filigree'] as const) {
      const f = composeFrame(id, 90, 64, { ornament: size });
      const c = f.corner!;
      for (let y = 0; y < c.art.h; y++) for (let x = 0; x < c.art.w; x++) {
        const tl = f.index(c.tl[0] + x, c.tl[1] + y);
        const tr = f.index(c.tr[0] + c.art.w - 1 - x, c.tr[1] + y);
        const bl = f.index(c.bl[0] + x, c.bl[1] + c.art.h - 1 - y);
        if (!f.cov[tl]) continue;
        expect(!!f.cov[tr] && near(f.nx[tr]!, -f.nx[tl]!) && near(f.ny[tr]!, f.ny[tl]!)).toBe(true);
        expect(!!f.cov[bl] && near(f.ny[bl]!, -f.ny[tl]!) && near(f.nx[bl]!, f.nx[tl]!)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('[7] lit output only uses colours from the active ramps, with dithering, brush and contact shadow', () => {
    for (const steps of [3, 4, 6]) {
      const f = composeFrame('gem', 60, 40);
      const theme = THEMES.brass;
      const allowed = rampSet([theme.metal, theme.accent, theme.gem], steps);
      const plain = shade(f, { az: 225, el: 40, steps, outline: false, shadow: false, theme: 'brass', brushed: true, ao: 0.35 });
      const dithered = shade(f, { az: 225, el: 40, steps, dither: true, outline: false, shadow: false, theme: 'brass', brushed: true, ao: 0.35 });
      for (const img of [plain, dithered]) for (const c of colours(f, img)) expect(allowed.has(c)).toBe(true);
      expect(plain.data.some((v, i) => v !== dithered.data[i])).toBe(true);
    }
  });

  it('[10] a half press is flat and a full press is the negation', () => {
    const up = composeFrame('round', 50, 30, { pressAmount: 0 });
    const mid = composeFrame('round', 50, 30, { pressAmount: 0.5 });
    const down = composeFrame('round', 50, 30, { pressAmount: 1 });
    for (let i = 0; i < mid.cov.length; i++) {
      if (!mid.cov[i] || mid.src[i] !== SRC.EDGE) continue;
      expect(mid.nx[i] === 0 && Math.abs(mid.ny[i]!) === 0 && near(mid.nz[i]!, 1)).toBe(true);
      expect(down.nx[i] === -up.nx[i]! && down.ny[i] === -up.ny[i]!).toBe(true);
    }
  });
  it('[22] one-colour themes rise in lightness with cool shadows and warm highlights', () => {
    for (const base of ['#5b7fa6', '#9c2f3a', '#4f7a3a', '#808080', '#0a0a12', '#f2f2ea']) {
      const r = rampsFromBase(base);
      expect(rampsFromBase(base)).toEqual(r);
      for (const list of Object.values(r)) {
        expect(list).toHaveLength(6);
        const L = list.map(c => rgbToHsl(hexToRgb(c))[2]);
        for (let i = 1; i < 6; i++) expect(L[i]!).toBeGreaterThan(L[i - 1]!);
      }
      const [h, s] = rgbToHsl(hexToRgb(base));
      if (s > 0.15) {
        const hs = r.metal.map(c => rgbToHsl(hexToRgb(c))[0]);
        expect(hueDist(hs[0]!, 240)).toBeLessThanOrEqual(hueDist(h, 240) + 0.5);
        expect(hueDist(hs[5]!, 55)).toBeLessThanOrEqual(hueDist(h, 55) + 0.5);
      }
    }
  });

  it('[23] a custom theme renders only its generated colours', () => {
    const theme = themeFromBase('#9c2f3a');
    const f = composeFrame('gem', 70, 48, { ornament: 'large' });
    const img = shade(f, { az: 225, el: 40, steps: 6, outline: true, shadow: false, theme, brushed: true, brush: 0.35, ao: 0.35 });
    const allowed = rampSet([theme.metal, theme.accent, theme.gem]);
    const used = colours(f, img, true);
    expect(used.length).toBeGreaterThan(100);
    for (const c of used) expect(allowed.has(c)).toBe(true);
  });

  it('[24] high contrast uses three colours, a strong focus ridge and no texture effects', () => {
    const hc = rampSet(Object.values(HIGH_CONTRAST));
    const f = composeFrame('gem', 70, 48, { ornament: 'large' });
    const base = { az: 225, el: 40, steps: 6, outline: true, shadow: false, theme: 'brass', contrast: 'high' } as const;
    const focused = shade(f, { ...base, state: { focus: true } });
    for (const c of colours(f, focused, true)) expect(hc.has(c)).toBe(true);
    const lum = (rgb: readonly number[]) => rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let ridge = -1;
    for (let i = 0; i < f.cov.length; i++) if (f.ridge[i] && f.src[i] === SRC.EDGE) { ridge = i; break; }
    const rc = [focused.data[ridge * 4]!, focused.data[ridge * 4 + 1]!, focused.data[ridge * 4 + 2]!];
    expect((lum(rc) + 0.05) / 0.05).toBeGreaterThanOrEqual(7);
    const plain = shade(f, base);
    const textured = shade(f, { ...base, brushed: true, brush: 1, wear: 1, dither: true });
    expect(Buffer.from(plain.data).equals(Buffer.from(textured.data))).toBe(true);
  });

  it('[25] PNG corner art follows the colour conventions and round-trips exactly', () => {
    const img = createImage(4, 2);
    [[128, 128, 128, 255], [220, 30, 40, 255], [230, 150, 20, 255], [255, 0, 255, 255],
      [40, 80, 200, 255], [0, 0, 0, 0], [255, 255, 255, 255], [0, 0, 0, 255]].forEach((c, i) => img.data.set(c, i * 4));
    const result = artFromImage(img, { ox: 1, oy: 1 });
    if (!('def' in result)) throw new Error(result.error);
    expect(result.def.height[0]![0]).toBe('4'); // 50% grey -> height 4
    expect(result.def.height[0]![3]).toBe('x');
    expect(result.def.mat![0]).toBe('mga.');
    expect(result.def.mat![1]![0]).toBe('d');
    expect(result.def.height[1]).toBe(`${result.def.height[1]![0]}.91`);
    const sil = artFromImage(img, { mode: 'silhouette' });
    expect('def' in sil && sil.def.height[0]!.includes('#') && sil.def.mat![0]![0] === 'a').toBe(true);
    let roundTrips = 0;
    for (const name of ['fleur', 'gemBoss', 'rosette', 'scroll', 'plateCorner', 'squareBoss']) {
      for (const size of ['medium', 'large'] as const) {
        const strings = artToStrings(getArt(name, size)!);
        if (strings.height[0]!.length > ART_MAX || strings.height.length > ART_MAX) continue;
        const back = artFromImage(artToImage(strings), { ox: strings.ox, oy: strings.oy });
        if (!('def' in back)) throw new Error(back.error);
        const norm = (m: readonly string[]) => m.map(r => r.replace(/n/g, 'm'));
        expect(back.def.height).toEqual(strings.height);
        expect(norm(back.def.mat!)).toEqual(norm(strings.mat));
        roundTrips++;
      }
    }
    expect(roundTrips).toBeGreaterThanOrEqual(8);
    expect(artFromImage(createImage(21, 21))).toEqual({ error: expect.stringMatching(/20×20/) });
    expect(artDef('notch')).toEqual({ name: 'Notch', ox: 0, oy: 0, height: ['x'] });
  });
});
