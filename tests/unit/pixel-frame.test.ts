import { describe, expect, it } from 'vitest';
import {
  ART_MAX, ART_NAMES, COVERED, Frame, STYLES, HIGH_CONTRAST, MAT, RAMPS, SRC, THEMES,
  artDef, artFromImage, artToImage, artToStrings, classify, composeFrame, computeNormals, createImage,
  fillColumn, geometry, getArt, hexToRgb, profileSlope, ramp, rampsFromBase, reconstruct, renderBaked,
  parseFrameManifest, presetsFromTheme, ridgeIndices, rgbToHsl, shade, shadeForBake, themeFromBase,
} from '../../src/presentation/pixel-frame/index.ts';
import type { UiTheme } from '../../src/presentation/pixel-frame/index.ts';
import validateTheme from '../../src/content/generated/ui-theme-validator.mjs';
import schema from '../../schemas/ui-theme.schema.json';
import type { BakeSettings, ComposedFrame, RgbaImage, StyleId } from '../../src/presentation/pixel-frame/index.ts';
import { DEFAULT_THEME, bakeAll, readTheme } from '../../tools/bake-frames.ts';

const THEME = readTheme(DEFAULT_THEME);
const FF_WINDOW = presetsFromTheme(THEME).find(preset => preset.id === 'battle')!;

// Carried over from the Pixel Frame demonstrator's engine checks (numbers in brackets), plus fill and bake checks.

const near = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) <= eps;
const hueDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const BAKE: BakeSettings = {
  theme: 'iron', az: 225, el: 40, steps: 6, dither: false, outline: true, shadow: true,
  normalMode: 'blend', strength: 0.8, radius: 5, brushed: true, brush: 0.35, ao: 0.35,
  flair: 'full', ornament: 'large', animate: true,
};

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

describe('Pixel Frame core (decision 0010)', () => {
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

  it('[17] a baked 9-slice rebuilds the live frame pixel-for-pixel at other sizes', () => {
    const ids: StyleId[] = ['flat', 'round', 'rail', 'gem', 'fleur', 'rosette', 'filigree', 'inset', 'neutral'];
    const variants = [
      { ornament: 'medium', normalMode: 'blend', wear: 0, state: {} },
      { ornament: 'large', normalMode: 'profile', wear: 0, state: {} },
      { ornament: 'large', normalMode: 'blend', wear: 0.65, state: { focus: true } },
    ] as const;
    for (const v of variants) {
      const settings: BakeSettings = { ...BAKE, ornament: v.ornament, normalMode: v.normalMode, wear: v.wear, tarnish: true, glow: 0.6 };
      for (const id of ids) {
        const { L, frame } = geometry(id, settings, 0);
        const S = frame.M + L.inner;
        const canon = shadeForBake(frame, settings, v.state);
        for (const [W, H] of [[L.box + 37, L.box + 13], [L.box + 1, L.box + 64]] as const) {
          const direct = shadeForBake(geometry(id, settings, 0, W, H).frame, settings, v.state);
          const rebuilt = reconstruct(canon, S, 1, direct.width, direct.height, 'stretch');
          expect(Buffer.from(rebuilt.data).equals(Buffer.from(direct.data)), `${id} ${v.ornament}/${v.normalMode} at ${W}×${H}`).toBe(true);
        }
      }
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

describe('Window fill (decision 0010 §3)', () => {
  it('fills whole bands from top to bottom colour at any height', () => {
    const fill = { kind: 'bands', top: '#3050b8', bottom: '#0c1854', band: 4 } as const;
    const col = fillColumn(fill, 130)!;
    expect(col).toHaveLength(130);
    expect(col[0]).toEqual(hexToRgb('#3050b8'));
    expect(col[129]).toEqual(hexToRgb('#0c1854'));
    for (let y = 0; y < 130; y++) expect(col[y]).toEqual(col[y - (y % 4)]); // constant within each band
    expect(fillColumn(fill, 3)).toEqual([hexToRgb('#3050b8'), hexToRgb('#3050b8'), hexToRgb('#3050b8')]);
    expect(fillColumn(fill, 0)).toEqual([]);
  });

  it('returns a flat column, no column for none, and rejects fractional sizes', () => {
    expect(fillColumn({ kind: 'flat', color: '#102040' }, 2)).toEqual([[16, 32, 64], [16, 32, 64]]);
    expect(fillColumn({ kind: 'none' }, 10)).toBeNull();
    expect(() => fillColumn({ kind: 'flat', color: '#000000' }, 2.5)).toThrow(RangeError);
    expect(() => fillColumn({ kind: 'bands', top: '#000000', bottom: '#ffffff', band: 0 }, 4)).toThrow(RangeError);
  });
});

describe('UI theme file (W2.2)', () => {
  it('accepts the demo theme and rejects unknown fields, bad colours and fractional bands', () => {
    expect(validateTheme(THEME)).toBe(true);
    const battle = THEME.windows.battle;
    const bad: unknown[] = [
      { ...THEME, extra: 1 },
      { ...THEME, windows: { battle: { ...battle, colors: { ramp: ['#fff', '#000000', '#111111'] } } } },
      { ...THEME, windows: { battle: { ...battle, fill: { kind: 'bands', top: '#000000', bottom: '#ffffff', band: 2.5 } } } },
      { ...THEME, windows: { battle: { ...battle, frame: { profile: [1, 2], corner: 'nope' } } } },
      { ...THEME, windows: { battle: { ...battle, frame: { style: 'round', profile: [1] } } } },
      { ...THEME, battleText: { ...THEME.battleText, text: 'white' } },
      { ...THEME, id: 'demo:theme.blue' },
    ];
    for (const value of bad) expect(validateTheme(value)).toBe(false);
  });

  it("lists only the engine's corner art and styles", () => {
    const frame = schema.definitions.window.properties.frame.oneOf;
    for (const name of frame[1]!.properties.corner!.enum) expect(ART_NAMES).toContain(name);
    for (const name of frame[0]!.properties.style!.enum) expect(Object.keys(STYLES)).toContain(name);
  });

  it('turns named, one-colour and ramp colours into bakeable presets', () => {
    const variants: UiTheme[] = [
      { ...THEME, windows: { battle: { ...THEME.windows.battle, frame: { style: 'round' }, colors: { theme: 'silver' } } } },
      { ...THEME, windows: { battle: { ...THEME.windows.battle, colors: { base: '#5b7fa6' }, fill: { kind: 'flat', color: '#101828' } } } },
    ];
    for (const theme of variants) {
      expect(validateTheme(theme)).toBe(true);
      const { manifest, files } = bakeAll(theme);
      expect(Object.keys(manifest.frames)).toEqual(['battle']);
      expect(files.size).toBeGreaterThanOrEqual(5);
    }
  });

  it('rejects a malformed manifest at runtime', () => {
    const { manifest } = bakeAll(THEME);
    const copy = () => JSON.parse(JSON.stringify(manifest));
    const broken = [copy(), copy(), copy(), copy()];
    broken[0].schemaVersion = 2;
    broken[1].frames.battle.images.raised = '../secret.png';
    broken[2].frames.battle.fill = { kind: 'bands', top: '#000000', bottom: '#ffffff', band: 0 };
    broken[3].battleText.text = 'red';
    for (const value of broken) expect(() => parseFrameManifest(value)).toThrow(/frame manifest/);
  });
});

describe('Frame bake (W2.1)', () => {
  it('bakes the FF window from its own ramps only, exact at battle window sizes', () => {
    const settings = { ...FF_WINDOW.settings, theme: FF_WINDOW.theme };
    const baked = renderBaked(FF_WINDOW.style, settings);
    expect(baked.pulse).toBeNull();
    expect(baked.P).toBe(FF_WINDOW.style.profile.length);
    // Border ramp, plus the gem ramp (focus ridge) and neutral grey (disabled), as in the engine.
    const allowed = rampSet([FF_WINDOW.theme.metal, FF_WINDOW.theme.gem, RAMPS.neutral], settings.steps);
    for (const img of Object.values(baked.images)) {
      for (let i = 0; i < img.width * img.height; i++) {
        const a = img.data[i * 4 + 3]!;
        if (a === 255) expect(allowed.has(`${img.data[i * 4]},${img.data[i * 4 + 1]},${img.data[i * 4 + 2]}`)).toBe(true);
        else expect([0, 190]).toContain(a);
      }
    }
    for (const [W, H] of [[640, 24], [168, 136], [336, 136], [136, 136], [504, 136]] as const) {
      const direct = shadeForBake(geometry(FF_WINDOW.style, settings, 0, W, H).frame, settings, {});
      const rebuilt = reconstruct(baked.images.raised, baked.S, baked.tile, direct.width, direct.height, baked.repeat);
      expect(Buffer.from(rebuilt.data).equals(Buffer.from(direct.data)), `${W}×${H}`).toBe(true);
    }
  });

  it('produces deterministic, content-hashed files and a manifest for every preset and state', () => {
    const a = bakeAll(THEME);
    const b = bakeAll(THEME);
    expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
    expect([...a.files.keys()]).toEqual([...b.files.keys()]);
    for (const [path, bytes] of a.files) expect(b.files.get(path)!.equals(bytes)).toBe(true);
    const ff = a.manifest.frames.battle!;
    expect(parseFrameManifest(JSON.parse(JSON.stringify(a.manifest)))).toEqual(a.manifest);
    expect(a.manifest.battleText).toEqual(THEME.battleText);
    expect(Object.keys(ff.images)).toEqual(['raised', 'hover', 'pressed', 'focus', 'active', 'disabled']);
    for (const path of Object.values(ff.images)) {
      expect(path).toMatch(/^frames\/battle-[a-z]+\.[0-9a-f]{12}\.png$/);
      const png = a.files.get(path)!;
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(ff.size);
      expect(png.readUInt32BE(20)).toBe(ff.size);
    }
    expect(ff.fill).toEqual(FF_WINDOW.fill);
  });
});
