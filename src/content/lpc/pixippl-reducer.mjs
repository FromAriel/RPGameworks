// @ts-nocheck -- Vendored build output, kept byte-for-byte below this header. Its TypeScript source is Ariel's
// PixiPPL reducer (FromAriel/PixiPPL reducer/core.ts, sha256 b61425ceadd0bfeeb668d704547717c4f5e9aaa4928601ccc48ff7bc9e30320e),
// bundled by esbuild as DanJen Delver's vendor/pixippl-resizer/resizer.mjs (sha256
// bdd2354e3d08afb03377d5614a76d8f07f487759c2fb7899e57bbefa53ff6744). Decision 0019 (S1.5a): tests check its output
// against DanJen's reduced LPC cache, so it must not be edited here; update it from PixiPPL instead.
// src/core.ts
function renderRecipe(source, recipe) {
  if (source.width < 1 || source.height < 1 || source.data.length !== source.width * source.height * 4) {
    throw new Error("Invalid source RGBA geometry");
  }
  if (recipe.version !== 1) throw new Error(`Unsupported recipe version ${recipe.version}`);
  const state = { source, cache: /* @__PURE__ */ new Map() };
  const controls = {
    targetSize: { value: recipe.target.size },
    customSize: { value: recipe.target.size },
    targetMode: { value: recipe.target.mode },
    contrast: { value: recipe.tone.contrast },
    brightness: { value: recipe.tone.brightness },
    gamma: { value: recipe.tone.gamma * 100 },
    saturation: { value: recipe.tone.saturation },
    outlineEnabled: { checked: recipe.outline.enabled },
    outlineStrength: { value: recipe.outline.strength },
    outlineWidth: { value: recipe.outline.width },
    quantMethod: { value: recipe.palette.method },
    maxColors: { value: recipe.palette.maxColors },
    distanceMode: { value: recipe.palette.distance },
    minPopulation: { value: recipe.palette.minPopulation },
    alphaMode: { value: recipe.palette.alphaMode },
    alphaThreshold: { value: recipe.palette.alphaThreshold }
  };
  const $ = (id) => controls[id];
  function clamp(v, lo = 0, hi = 255) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function luma(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function makeImageData(w, h, data) {
    const pixels = data || new Uint8ClampedArray(w * h * 4);
    return typeof ImageData === "undefined" ? { width: w, height: h, data: pixels } : new ImageData(pixels, w, h);
  }
  function cloneImageData(img) {
    return makeImageData(img.width, img.height, new Uint8ClampedArray(img.data));
  }
  function getTargetSize() {
    const sel = $("targetSize").value;
    const n = sel === "custom" ? Number($("customSize").value) : Number(sel);
    return Math.max(4, Math.min(128, Number.isFinite(n) ? Math.round(n) : 32));
  }
  function getGeometry() {
    if (!state.source) return null;
    const size = getTargetSize();
    const sw = state.source.width, sh = state.source.height;
    const mode = $("targetMode").value;
    if (mode === "square") {
      const scale2 = Math.min(size / sw, size / sh);
      const iw2 = Math.max(1, Math.round(sw * scale2));
      const ih = Math.max(1, Math.round(sh * scale2));
      return { outW: size, outH: size, innerW: iw2, innerH: ih, offX: Math.floor((size - iw2) / 2), offY: Math.floor((size - ih) / 2) };
    }
    const scale = size / sh;
    const iw = Math.max(1, Math.round(sw * scale));
    return { outW: iw, outH: size, innerW: iw, innerH: size, offX: 0, offY: 0 };
  }
  function sinc(x) {
    if (Math.abs(x) < 1e-8) return 1;
    const p = Math.PI * x;
    return Math.sin(p) / p;
  }
  const kernelDefs = {
    bilinear: { radius: 1, fn: (x) => {
      x = Math.abs(x);
      return x < 1 ? 1 - x : 0;
    } },
    mitchell: { radius: 2, fn: (x) => {
      const B = 1 / 3, C = 1 / 3;
      x = Math.abs(x);
      if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
      if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
      return 0;
    } },
    catmull: { radius: 2, fn: (x) => {
      const B = 0, C = 0.5;
      x = Math.abs(x);
      if (x < 1) return ((12 - 9 * B - 6 * C) * x * x * x + (-18 + 12 * B + 6 * C) * x * x + (6 - 2 * B)) / 6;
      if (x < 2) return ((-B - 6 * C) * x * x * x + (6 * B + 30 * C) * x * x + (-12 * B - 48 * C) * x + (8 * B + 24 * C)) / 6;
      return 0;
    } },
    lanczos2: { radius: 2, fn: (x) => {
      x = Math.abs(x);
      return x < 2 ? sinc(x) * sinc(x / 2) : 0;
    } },
    lanczos3: { radius: 3, fn: (x) => {
      x = Math.abs(x);
      return x < 3 ? sinc(x) * sinc(x / 3) : 0;
    } }
  };
  function sampleNearest(src, dw, dh) {
    const out = makeImageData(dw, dh);
    const s = src.data, d = out.data;
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(src.height - 1, Math.max(0, Math.floor((y + 0.5) * src.height / dh)));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(src.width - 1, Math.max(0, Math.floor((x + 0.5) * src.width / dw)));
        const si = (sy * src.width + sx) * 4;
        const di = (y * dw + x) * 4;
        d[di] = s[si];
        d[di + 1] = s[si + 1];
        d[di + 2] = s[si + 2];
        d[di + 3] = s[si + 3];
      }
    }
    return out;
  }
  function sampleArea(src, dw, dh) {
    const out = makeImageData(dw, dh);
    const s = src.data, d = out.data;
    const sxScale = src.width / dw, syScale = src.height / dh;
    for (let y = 0; y < dh; y++) {
      const y0 = y * syScale, y1 = (y + 1) * syScale;
      const iy0 = Math.floor(y0), iy1 = Math.ceil(y1);
      for (let x = 0; x < dw; x++) {
        const x0 = x * sxScale, x1 = (x + 1) * sxScale;
        const ix0 = Math.floor(x0), ix1 = Math.ceil(x1);
        let sumW = 0, sumA = 0, sumR = 0, sumG = 0, sumB = 0;
        for (let sy = iy0; sy < iy1; sy++) {
          if (sy < 0 || sy >= src.height) continue;
          const wy = Math.max(0, Math.min(y1, sy + 1) - Math.max(y0, sy));
          for (let sx = ix0; sx < ix1; sx++) {
            if (sx < 0 || sx >= src.width) continue;
            const wx = Math.max(0, Math.min(x1, sx + 1) - Math.max(x0, sx));
            const w = wx * wy;
            if (w <= 0) continue;
            const i = (sy * src.width + sx) * 4;
            const a = s[i + 3] / 255;
            sumW += w;
            sumA += a * w;
            sumR += s[i] * a * w;
            sumG += s[i + 1] * a * w;
            sumB += s[i + 2] * a * w;
          }
        }
        const di = (y * dw + x) * 4;
        const oa = sumW ? sumA / sumW : 0;
        d[di + 3] = clamp(Math.round(oa * 255));
        if (sumA > 1e-8) {
          d[di] = clamp(Math.round(sumR / sumA));
          d[di + 1] = clamp(Math.round(sumG / sumA));
          d[di + 2] = clamp(Math.round(sumB / sumA));
        }
      }
    }
    return out;
  }
  function sampleKernel(src, dw, dh, key) {
    const def = kernelDefs[key];
    const out = makeImageData(dw, dh);
    const s = src.data, d = out.data;
    const scaleX = src.width / dw, scaleY = src.height / dh;
    const stretchX = Math.max(1, scaleX), stretchY = Math.max(1, scaleY);
    const supportX = def.radius * stretchX, supportY = def.radius * stretchY;
    for (let y = 0; y < dh; y++) {
      const cy = (y + 0.5) * scaleY - 0.5;
      const yStart = Math.floor(cy - supportY), yEnd = Math.ceil(cy + supportY);
      for (let x = 0; x < dw; x++) {
        const cx = (x + 0.5) * scaleX - 0.5;
        const xStart = Math.floor(cx - supportX), xEnd = Math.ceil(cx + supportX);
        let sumW = 0, sumA = 0, sumR = 0, sumG = 0, sumB = 0;
        for (let sy = yStart; sy <= yEnd; sy++) {
          if (sy < 0 || sy >= src.height) continue;
          const wy = def.fn((sy - cy) / stretchY);
          if (wy === 0) continue;
          for (let sx = xStart; sx <= xEnd; sx++) {
            if (sx < 0 || sx >= src.width) continue;
            const wx = def.fn((sx - cx) / stretchX);
            const w = wx * wy;
            if (w === 0) continue;
            const i = (sy * src.width + sx) * 4;
            const a = s[i + 3] / 255;
            sumW += w;
            sumA += a * w;
            sumR += s[i] * a * w;
            sumG += s[i + 1] * a * w;
            sumB += s[i + 2] * a * w;
          }
        }
        const di = (y * dw + x) * 4;
        if (Math.abs(sumW) < 1e-8) continue;
        const oa = clamp(sumA / sumW, 0, 1);
        d[di + 3] = Math.round(oa * 255);
        if (Math.abs(sumA) > 1e-8) {
          d[di] = clamp(Math.round(sumR / sumA));
          d[di + 1] = clamp(Math.round(sumG / sumA));
          d[di + 2] = clamp(Math.round(sumB / sumA));
        }
      }
    }
    return out;
  }
  function rawResample(src, dw, dh, filter) {
    if (filter === "nearest") return sampleNearest(src, dw, dh);
    if (filter === "area") return sampleArea(src, dw, dh);
    return sampleKernel(src, dw, dh, filter);
  }
  function placeOnCanvas(inner, geom) {
    if (inner.width === geom.outW && inner.height === geom.outH && geom.offX === 0 && geom.offY === 0) return inner;
    const out = makeImageData(geom.outW, geom.outH);
    for (let y = 0; y < inner.height; y++) {
      for (let x = 0; x < inner.width; x++) {
        const si = (y * inner.width + x) * 4;
        const di = ((y + geom.offY) * geom.outW + (x + geom.offX)) * 4;
        out.data.set(inner.data.subarray(si, si + 4), di);
      }
    }
    return out;
  }
  function getResampled(filter) {
    const geom = getGeometry();
    const key = `${filter}|${geom.outW}x${geom.outH}|${geom.innerW}x${geom.innerH}|${geom.offX},${geom.offY}`;
    if (state.cache.has(key)) return state.cache.get(key);
    const inner = rawResample(state.source, geom.innerW, geom.innerH, filter);
    const out = placeOnCanvas(inner, geom);
    state.cache.set(key, out);
    return out;
  }
  function blendLayer(base2, overlay, mode, opacity, threshold) {
    const out = cloneImageData(base2);
    const a = out.data, b = overlay.data;
    const t = Math.max(0, Math.min(1, opacity));
    for (let i = 0; i < a.length; i += 4) {
      const ba = a[i + 3] / 255, oa = b[i + 3] / 255;
      if (oa <= 0) continue;
      const alphaMix = t * oa;
      const br = a[i], bg = a[i + 1], bb = a[i + 2];
      const or = b[i], og = b[i + 1], ob = b[i + 2];
      let tr = or, tg = og, tb = ob;
      let apply = true;
      if (mode === "darkenMap") apply = luma(or, og, ob) + threshold < luma(br, bg, bb);
      else if (mode === "lightenMap") apply = luma(or, og, ob) - threshold > luma(br, bg, bb);
      else if (mode === "darkenChannel") {
        tr = Math.min(br, or);
        tg = Math.min(bg, og);
        tb = Math.min(bb, ob);
      } else if (mode === "lightenChannel") {
        tr = Math.max(br, or);
        tg = Math.max(bg, og);
        tb = Math.max(bb, ob);
      } else if (mode === "multiply") {
        tr = br * or / 255;
        tg = bg * og / 255;
        tb = bb * ob / 255;
      } else if (mode === "screen") {
        tr = 255 - (255 - br) * (255 - or) / 255;
        tg = 255 - (255 - bg) * (255 - og) / 255;
        tb = 255 - (255 - bb) * (255 - ob) / 255;
      }
      if (!apply) continue;
      const mix = alphaMix;
      a[i] = clamp(Math.round(lerp(br, tr, mix)));
      a[i + 1] = clamp(Math.round(lerp(bg, tg, mix)));
      a[i + 2] = clamp(Math.round(lerp(bb, tb, mix)));
      a[i + 3] = clamp(Math.round((ba + (1 - ba) * oa * t) * 255));
    }
    return out;
  }
  function toneAdjust(img) {
    const out = cloneImageData(img), d = out.data;
    const contrast = Number($("contrast").value) / 100;
    const brightness = Number($("brightness").value);
    const gamma = Number($("gamma").value) / 100;
    const sat = Number($("saturation").value) / 100;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const gray = luma(r, g, b);
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;
      r = (r - 128) * contrast + 128 + brightness;
      g = (g - 128) * contrast + 128 + brightness;
      b = (b - 128) * contrast + 128 + brightness;
      r = 255 * Math.pow(clamp(r) / 255, 1 / gamma);
      g = 255 * Math.pow(clamp(g) / 255, 1 / gamma);
      b = 255 * Math.pow(clamp(b) / 255, 1 / gamma);
      d[i] = clamp(Math.round(r));
      d[i + 1] = clamp(Math.round(g));
      d[i + 2] = clamp(Math.round(b));
    }
    return out;
  }
  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function rgbToOklab(r, g, b) {
    r = srgbToLinear(r);
    g = srgbToLinear(g);
    b = srgbToLinear(b);
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(Math.max(0, l)), m_ = Math.cbrt(Math.max(0, m)), s_ = Math.cbrt(Math.max(0, s));
    return [
      0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
      1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
      0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
    ];
  }
  function colorDist(c1, c2, mode) {
    if (mode === "rgb") {
      const dr = c1[0] - c2[0], dg = c1[1] - c2[1], db2 = c1[2] - c2[2];
      return dr * dr + dg * dg + db2 * db2;
    }
    const a = c1._lab || (c1._lab = rgbToOklab(c1[0], c1[1], c1[2]));
    const b = c2._lab || (c2._lab = rgbToOklab(c2[0], c2[1], c2[2]));
    const dl = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
    return dl * dl + da * da + db * db;
  }
  function median(values) {
    if (!values.length) return 0;
    const a = values.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  function isBoundaryPixel(mask, width, height, x, y, radius = 1) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height || !mask[yy * width + xx]) return true;
      }
    }
    return false;
  }
  function analyzeSourceOutline(img, alphaThreshold) {
    const { width: w, height: h, data: d } = img;
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < w * h; p++, i += 4) mask[p] = d[i + 3] >= alphaThreshold ? 1 : 0;
    const boundary = [];
    const interiorLuma = [];
    const counts = /* @__PURE__ */ new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const i = p * 4;
      const rgb = [d[i], d[i + 1], d[i + 2]];
      const lum = luma(rgb[0], rgb[1], rgb[2]);
      if (isBoundaryPixel(mask, w, h, x, y, 1)) {
        boundary.push([rgb[0], rgb[1], rgb[2], lum]);
        const key = `${rgb[0]},${rgb[1]},${rgb[2]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      } else interiorLuma.push(lum);
    }
    if (!boundary.length) return { detected: false, reason: "No opaque alpha boundary found." };
    const boundaryLuma = boundary.map((p) => p[3]);
    const interiorMedian = interiorLuma.length ? median(interiorLuma) : median(boundaryLuma);
    const boundaryMedian = median(boundaryLuma);
    const darkCut = Math.max(0, interiorMedian - Math.max(20, interiorMedian * 0.14));
    let best = null;
    for (const [key, count] of counts) {
      const rgb = key.split(",").map(Number);
      const lum = luma(rgb[0], rgb[1], rgb[2]);
      if (lum > darkCut) continue;
      const darkness = Math.max(0, interiorMedian - lum);
      const score = count * (1 + darkness / 64);
      if (!best || score > best.score) best = { rgb, count, lum, score };
    }
    if (!best) return { detected: false, reason: "No consistently dark boundary color detected.", boundaryMedian, interiorMedian };
    let nearCount = 0;
    for (const p of boundary) {
      const dr = p[0] - best.rgb[0], dg = p[1] - best.rgb[1], db = p[2] - best.rgb[2];
      if (dr * dr + dg * dg + db * db <= 36 * 36 * 3) nearCount++;
    }
    const support = nearCount / boundary.length;
    const contrast = interiorMedian - best.lum;
    const detected = contrast >= 20 && support >= 0.18 && boundaryMedian < interiorMedian - 12;
    return {
      detected,
      color: best.rgb,
      luma: best.lum,
      support,
      contrast,
      boundaryCount: boundary.length,
      boundaryMedian,
      interiorMedian,
      reason: detected ? "" : "Boundary is not consistently darker than the sprite interior."
    };
  }
  function applyOutlinePreservation(img, info) {
    if (!$("outlineEnabled").checked || !info || !info.detected) return cloneImageData(img);
    const strength = Math.max(0, Math.min(1, Number($("outlineStrength").value) / 100));
    if (strength <= 0) return cloneImageData(img);
    const radius = Math.max(1, Math.min(2, Number($("outlineWidth").value) || 1));
    const alphaThreshold = Number($("alphaThreshold").value);
    const out = cloneImageData(img), d = out.data, w = out.width, h = out.height;
    const mask = new Uint8Array(w * h);
    for (let p = 0, i = 0; p < w * h; p++, i += 4) mask[p] = d[i + 3] >= alphaThreshold ? 1 : 0;
    const target = info.color;
    const targetLuma = luma(target[0], target[1], target[2]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p] || !isBoundaryPixel(mask, w, h, x, y, radius)) continue;
      const i = p * 4;
      const currentLuma = luma(d[i], d[i + 1], d[i + 2]);
      if (currentLuma <= targetLuma + 2) continue;
      const rr = lerp(d[i], target[0], strength);
      const gg = lerp(d[i + 1], target[1], strength);
      const bb = lerp(d[i + 2], target[2], strength);
      d[i] = clamp(Math.round(Math.min(d[i], rr)));
      d[i + 1] = clamp(Math.round(Math.min(d[i + 1], gg)));
      d[i + 2] = clamp(Math.round(Math.min(d[i + 2], bb)));
    }
    return out;
  }
  function histogram(img, alphaThreshold, minPopulation) {
    const m = /* @__PURE__ */ new Map(), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < alphaThreshold) continue;
      const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      m.set(key, (m.get(key) || 0) + 1);
    }
    const arr = [];
    for (const [k, count] of m) {
      if (count < minPopulation) continue;
      const p = k.split(",").map(Number);
      arr.push([p[0], p[1], p[2], count]);
    }
    return arr.sort((a, b) => b[3] - a[3]);
  }
  function kmeansPalette(points, k, mode) {
    if (!points.length) return [];
    k = Math.max(1, Math.min(k, points.length));
    const centers = [points[0].slice(0, 3)];
    while (centers.length < k) {
      let best = null, bestScore = -1;
      for (const p of points) {
        let md = Infinity;
        for (const c of centers) md = Math.min(md, colorDist(p, c, mode));
        const score = md * Math.sqrt(p[3]);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      centers.push(best.slice(0, 3));
    }
    for (let iter = 0; iter < 10; iter++) {
      const sums = centers.map(() => [0, 0, 0, 0]);
      for (const p of points) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < centers.length; i++) {
          const dd = colorDist(p, centers[i], mode);
          if (dd < bd) {
            bd = dd;
            bi = i;
          }
        }
        const w = p[3], s = sums[bi];
        s[0] += p[0] * w;
        s[1] += p[1] * w;
        s[2] += p[2] * w;
        s[3] += w;
      }
      let moved = 0;
      for (let i = 0; i < centers.length; i++) {
        const s = sums[i];
        if (!s[3]) continue;
        const n = [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])];
        moved += Math.abs(n[0] - centers[i][0]) + Math.abs(n[1] - centers[i][1]) + Math.abs(n[2] - centers[i][2]);
        centers[i] = n;
      }
      if (moved === 0) break;
    }
    return centers;
  }
  function quantize(img) {
    const method = $("quantMethod").value;
    if (method === "none") return { image: applyAlphaMode(cloneImageData(img)), palette: [] };
    const maxColors = Math.max(2, Math.min(256, Number($("maxColors").value) || 16));
    const threshold = Number($("alphaThreshold").value);
    const minPop = Math.max(1, Number($("minPopulation").value) || 1);
    const distMode = $("distanceMode").value;
    const palettePoints = method === "source" ? histogram(state.source, threshold, minPop) : histogram(img, threshold, minPop);
    let palette = palettePoints.map((p) => p.slice(0, 3));
    if (palette.length > maxColors) palette = kmeansPalette(palettePoints, maxColors, distMode);
    if (!palette.length) return { image: applyAlphaMode(cloneImageData(img)), palette: [] };
    const out = cloneImageData(img), d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < threshold) {
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = 0;
        continue;
      }
      const p = [d[i], d[i + 1], d[i + 2]];
      let best = palette[0], bd = Infinity;
      for (const c of palette) {
        const dd = colorDist(p, c, distMode);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      d[i] = best[0];
      d[i + 1] = best[1];
      d[i + 2] = best[2];
    }
    return { image: applyAlphaMode(out), palette };
  }
  function applyAlphaMode(img) {
    const mode = $("alphaMode").value, threshold = Number($("alphaThreshold").value), d = img.data;
    if (mode === "binary") {
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < threshold) {
          d[i] = d[i + 1] = d[i + 2] = 0;
          d[i + 3] = 0;
        } else d[i + 3] = 255;
      }
    }
    return img;
  }
  const base = getResampled(recipe.baseFilter);
  let composite = cloneImageData(base);
  for (const layer of recipe.layers) {
    if (!layer.enabled) continue;
    const overlay = getResampled(layer.filter);
    composite = blendLayer(composite, overlay, layer.blend, layer.opacity / 100, layer.threshold);
  }
  const toned = toneAdjust(composite);
  const outlineInfo = analyzeSourceOutline(source, recipe.palette.alphaThreshold);
  const outlined = applyOutlinePreservation(toned, outlineInfo);
  const reduced = quantize(outlined);
  return { base, composite, toned, outlined, final: reduced.image, palette: reduced.palette, outlineInfo };
}
function resampleForFilter(source, recipe, filter) {
  return renderRecipe(source, { ...recipe, baseFilter: filter, layers: [] }).base;
}

// src/resize.ts
var FILTERS = ["area", "nearest", "bilinear", "mitchell", "catmull", "lanczos2", "lanczos3"];
var BLENDS = ["normal", "darkenMap", "lightenMap", "darkenChannel", "lightenChannel", "multiply", "screen"];
function numberIn(value, min, max, name, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}.`);
  }
}
function choice(value, choices, name) {
  if (!choices.includes(value)) throw new Error(`${name}: choose ${choices.join(", ")}.`);
}
function validateSettings(settings) {
  if (!settings || settings.schemaVersion !== 1) throw new Error("Settings schemaVersion must be 1.");
  const { recipe: r, canvas: c } = settings;
  if (!r || !r.target || !r.tone || !r.outline || !r.palette || !c) throw new Error("Incomplete settings.");
  if (r.version !== 1) throw new Error("Recipe version must be 1.");
  numberIn(r.target.size, 4, 128, "Target size", true);
  choice(r.target.mode, ["height", "square"], "Target mode");
  choice(r.baseFilter, FILTERS, "Base filter");
  if (!Array.isArray(r.layers) || r.layers.length > 16) throw new Error("Use an array of at most 16 filter overlays.");
  for (const layer of r.layers) {
    if (typeof layer.enabled !== "boolean") throw new Error("Overlay enabled must be true or false.");
    choice(layer.filter, FILTERS, "Overlay filter");
    choice(layer.blend, BLENDS, "Overlay blend");
    numberIn(layer.opacity, 0, 100, "Overlay opacity");
    numberIn(layer.threshold, 0, 255, "Overlay threshold");
  }
  numberIn(r.tone.contrast, 0, 300, "Contrast");
  numberIn(r.tone.brightness, -255, 255, "Brightness");
  numberIn(r.tone.gamma, 0.1, 5, "Gamma");
  numberIn(r.tone.saturation, 0, 300, "Saturation");
  if (typeof r.outline.enabled !== "boolean") throw new Error("Outline enabled must be true or false.");
  numberIn(r.outline.strength, 0, 100, "Outline strength");
  numberIn(r.outline.width, 1, 2, "Outline radius", true);
  choice(r.palette.method, ["source", "output", "none"], "Palette method");
  numberIn(r.palette.maxColors, 2, 256, "Maximum colors", true);
  choice(r.palette.distance, ["oklab", "rgb"], "Color distance");
  numberIn(r.palette.minPopulation, 1, 16777216, "Minimum color population", true);
  choice(r.palette.alphaMode, ["binary", "preserve"], "Alpha mode");
  numberIn(r.palette.alphaThreshold, 1, 255, "Alpha threshold", true);
  if (typeof c.enabled !== "boolean") throw new Error("Canvas enabled must be true or false.");
  numberIn(c.size, 4, 512, "Canvas size", true);
  numberIn(c.x, 0, 511, "Canvas X", true);
  numberIn(c.y, 0, 511, "Canvas Y", true);
}
function resizeWithSettings(source, settings) {
  validateSettings(settings);
  numberIn(source.width, 1, 4096, "Source width", true);
  numberIn(source.height, 1, 4096, "Source height", true);
  if (!(source.data instanceof Uint8ClampedArray)) throw new Error("Source data must be Uint8ClampedArray RGBA.");
  const stages = renderRecipe(source, settings.recipe);
  const c = settings.canvas;
  if (!c.enabled) return { ...stages, frame: stages.final };
  if (c.x + stages.final.width > c.size || c.y + stages.final.height > c.size) {
    throw new Error("Reduced image does not fit this canvas/offset. Disable placement or enlarge the canvas.");
  }
  const frame = {
    width: c.size,
    height: c.size,
    data: new Uint8ClampedArray(c.size * c.size * 4)
  };
  for (let y = 0; y < stages.final.height; y++) {
    const start = y * stages.final.width * 4;
    frame.data.set(
      stages.final.data.subarray(start, start + stages.final.width * 4),
      ((y + c.y) * c.size + c.x) * 4
    );
  }
  return { ...stages, frame };
}

// src/example.ts
function makeExample(outlined = true) {
  const width = 64, height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);
  const rect = (x, y, w, h, color) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      data.set([...color, 255], (yy * width + xx) * 4);
      mask[yy * width + xx] = 1;
    }
  };
  rect(23, 8, 18, 7, [178, 83, 48]);
  rect(20, 12, 24, 8, [215, 113, 61]);
  rect(23, 19, 18, 10, [239, 185, 129]);
  rect(20, 28, 24, 18, [65, 161, 185]);
  rect(15, 30, 7, 15, [229, 171, 115]);
  rect(42, 30, 7, 15, [229, 171, 115]);
  rect(21, 45, 9, 11, [92, 112, 165]);
  rect(34, 45, 9, 11, [92, 112, 165]);
  rect(19, 55, 11, 5, [111, 76, 59]);
  rect(34, 55, 11, 5, [111, 76, 59]);
  for (let y = 31; y < 43; y++) for (let x = 23; x < 41; x++) {
    const i = (y * width + x) * 4;
    data.set([52 + (x - 23) * 5, 125 + (y - 31) * 5, 190 - (x + y) % 11, 255], i);
  }
  if (outlined) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      let boundary = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height || !mask[yy * width + xx]) boundary = true;
      }
      if (boundary) data.set([25, 30, 43, 255], (y * width + x) * 4);
    }
  }
  rect(27, 22, 2, 2, [25, 30, 43]);
  rect(35, 22, 2, 2, [25, 30, 43]);
  return { width, height, data };
}
export {
  BLENDS,
  FILTERS,
  makeExample,
  renderRecipe,
  resampleForFilter,
  resizeWithSettings,
  validateSettings
};
