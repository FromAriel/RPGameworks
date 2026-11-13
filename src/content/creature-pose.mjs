/**
 * Creature pixel motion (decision 0015 C2). From one still 32 × 32 Stone Soup tile, build short pose loops by moving
 * whole art pixels: alternating leg steps and arm swing (walk), a sideways wave (slither), or a bounce and lean
 * (hover, shown to people as "float"). The drop shadow stays on the floor while the body moves.
 *
 * Ported from Ariel's Splurt project (tools/pose-sprite.mjs), itself adapted from DanJen Delver's sprite-motion.mjs.
 * Pure pixels: no canvas, Phaser or file access, so the content build (Node) can bake with it. A JSDoc-typed .mjs
 * checked by the strict typecheck, because the content build also runs on the Pages runner's Node 22 (Ariel,
 * November 12).
 */

/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Rgba */
/** @typedef {{ top: number, bottom: number, left: number, right: number, cx: number }} Shape */
/**
 * One pose. Leg offsets are [dx, dy] in art pixels; arm offsets move the outer bands of the upper body vertically;
 * lean shifts the upper body sideways, fading toward the feet; squash -1 makes the body a row shorter and wider, +1
 * taller and narrower; bounce moves the whole body vertically; wave is a slither phase in turns (0 to 1).
 * @typedef {{ legL?: readonly [number, number], legR?: readonly [number, number], armL?: number, armR?: number,
 *   lean?: number, squash?: number, bounce?: number, wave?: number }} Pose
 */
/**
 * @typedef {{ legShare?: number, armShare?: number, pad?: number, waveAmp?: number, wavePeriod?: number,
 *   keepShadow?: boolean, faces?: 'left' | 'right' }} PoseOptions
 */

/** Near-black pixels (every channel at most this) in the lowest SHADOW_SHARE of rows may be drop shadow. */
const SHADOW_MAX_RGB = 12;
const SHADOW_SHARE = 0.3;

/** @param {Rgba} img @param {number} x @param {number} y */
const solid = (img, x, y) => /** @type {number} */ (img.data[(y * img.width + x) * 4 + 3]) > 0;
/** @param {Rgba} img @param {number} x @param {number} y */
const dark = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return /** @type {number} */ (img.data[i]) <= SHADOW_MAX_RGB && /** @type {number} */ (img.data[i + 1]) <= SHADOW_MAX_RGB
    && /** @type {number} */ (img.data[i + 2]) <= SHADOW_MAX_RGB;
};

/**
 * A Stone Soup tile's drop shadow: near-black pixels in the lowest 30% of the drawn rows with no coloured pixel beside
 * them (the 1-pixel outline touches colour, so it moves with the body). 1 marks shadow.
 * @param {Rgba} img
 */
export function shadowMask(img) {
  const mask = new Uint8Array(img.width * img.height);
  let top = -1, bottom = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (solid(img, x, y)) { if (top < 0) top = y; bottom = y; }
  if (top < 0) return mask;
  const from = bottom - Math.floor((bottom - top + 1) * SHADOW_SHARE) + 1;
  /** @param {number} x @param {number} y */
  const colour = (x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && solid(img, x, y) && !dark(img, x, y);
  for (let y = from; y <= bottom; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!solid(img, x, y) || !dark(img, x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (colour(x + dx, y + dy)) { near = true; break; }
      if (!near) mask[y * img.width + x] = 1;
    }
  }
  return mask;
}

/**
 * The body's drawn extent and balance column (the mean x of its pixels in the lower third, where the legs are), so
 * legs split under the body even when the art is off-centre. Null for an empty tile.
 * @param {Rgba} img @param {Uint8Array} [shadow]
 * @returns {Shape | null}
 */
export function spriteShape(img, shadow = shadowMask(img)) {
  /** @param {number} x @param {number} y */
  const body = (x, y) => solid(img, x, y) && !shadow[y * img.width + x];
  let top = -1, bottom = -1, left = img.width, right = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!body(x, y)) continue;
      if (top < 0) top = y;
      bottom = y; left = Math.min(left, x); right = Math.max(right, x);
    }
  }
  if (top < 0) return null;
  const from = bottom - Math.max(1, Math.floor((bottom - top + 1) / 3)) + 1;
  let sum = 0, n = 0;
  for (let y = from; y <= bottom; y++) for (let x = left; x <= right; x++) if (body(x, y)) { sum += x; n++; }
  return { top, bottom, left, right, cx: n ? Math.round(sum / n) : Math.round((left + right) / 2) };
}

/**
 * The tile in one pose, on a canvas padded by `pad` pixels on every side. Every output pixel is a copy of a source
 * pixel. `keepShadow: false` leaves the shadow out (the hurt flash lights the body only).
 * @param {Rgba} img @param {Pose} [pose] @param {PoseOptions} [options]
 * @returns {Rgba}
 */
export function poseSprite(img, pose = {}, { legShare = 0, armShare = 0, pad = 4, waveAmp = 1, wavePeriod = 8, keepShadow = true, faces = 'right' } = {}) {
  const W = img.width + pad * 2, H = img.height + pad * 2;
  const out = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  const shadow = shadowMask(img), s = spriteShape(img, shadow);
  if (!s) return out;
  const legRows = legShare > 0 ? Math.max(1, Math.round((s.bottom - s.top + 1) * legShare)) : 0;
  const legTop = s.bottom - legRows + 1, bodyRows = Math.max(1, legTop - s.top);
  // Arms: the outer bands across the middle of the upper body.
  const armWidth = Math.floor((s.right - s.left + 1) * armShare);
  const armTop = s.top + Math.floor(bodyRows / 3), armBottom = s.top + Math.ceil((bodyRows * 5) / 6);
  const pivot = Math.round((s.top + legTop - 1) / 2), squash = Math.sign(pose.squash ?? 0);
  const lean = (pose.lean ?? 0) * (faces === 'left' ? -1 : 1), bounce = pose.bounce ?? 0;
  const legL = pose.legL ?? [0, 0], legR = pose.legR ?? [0, 0];
  /** @param {number} sx @param {number} sy @param {number} dx @param {number} dy */
  const put = (sx, sy, dx, dy) => {
    const x = dx + pad, y = dy + pad;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    out.data.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * W + x) * 4);
  };
  if (keepShadow) for (let i = 0; i < shadow.length; i++) if (shadow[i]) put(i % img.width, (i / img.width) | 0, i % img.width, (i / img.width) | 0);
  for (let y = s.top; y <= s.bottom; y++) {
    const leg = legRows > 0 && y >= legTop;
    const armBand = !leg && armWidth > 0 && y >= armTop && y < armBottom;
    let shiftY = bounce, shiftX = 0;
    if (!leg) {
      shiftX += Math.round((lean * (legTop - y)) / bodyRows);
      if (squash < 0 && y < pivot) shiftY += 1; // The rows above the pivot sink one: a row shorter.
      if (squash > 0 && y < pivot) shiftY -= 1; // Or rise one, and the pivot row repeats to fill the gap.
    }
    if (pose.wave !== undefined) shiftX += Math.round(waveAmp * Math.sin(2 * Math.PI * ((y - s.top) / wavePeriod + pose.wave)));
    for (let x = s.left; x <= s.right; x++) {
      if (!solid(img, x, y) || shadow[y * img.width + x]) continue;
      let dx = x + shiftX, dy = y + shiftY;
      if (leg) { const l = x < s.cx ? legL : legR; dx += l[0]; dy += l[1]; }
      else if (squash < 0 && x > s.cx) dx += 1; // Wider: the right half moves out one.
      else if (squash > 0 && x > s.cx) dx -= 1; // Narrower: in one.
      if (armBand) {
        if (x < s.left + armWidth) dy += pose.armL ?? 0;
        else if (x > s.right - armWidth) dy += pose.armR ?? 0;
      }
      put(x, y, dx, dy);
      if (!leg && squash < 0 && x === s.cx) put(x, y, dx + 1, dy); // The centre column repeats into the gap.
      if (!leg && squash > 0 && y === pivot) put(x, y, dx, dy - 1);
    }
  }
  return out;
}

/**
 * A motion style's loop of poses, ready to bake: the shared options plus the walk or idle poses.
 * @param {MotionStyle} style @param {'walk' | 'idle'} loop @param {Rgba} img @param {{ pad: number, faces?: 'left' | 'right', keepShadow?: boolean }} where
 */
export function poseLoop(style, loop, img, { pad, faces = 'right', keepShadow = true }) {
  const options = { legShare: style.legShare, armShare: style.armShare ?? 0, waveAmp: style.waveAmp ?? 1, wavePeriod: style.wavePeriod ?? 8, pad, faces, keepShadow };
  return style[loop].map((pose) => poseSprite(img, pose, options));
}

/**
 * @typedef {{ label: string, legShare: number, armShare?: number, waveAmp?: number, wavePeriod?: number,
 *   walkMs: number, idleMs: number, walk: Pose[], idle: Pose[] }} MotionStyle
 * @typedef {{ format: 'rpgameworks.creature-motion', formatVersion: 1, pad: number, styles: Record<string, MotionStyle> }} MotionStyles
 * @typedef {{ format: 'rpgameworks.creature-motion-assignments', formatVersion: 1, assignments: Record<string, string> }} MotionAssignments
 */

const POSE_KEYS = new Set(['legL', 'legR', 'armL', 'armR', 'lean', 'squash', 'bounce', 'wave']);
const isInt = (/** @type {unknown} */ v) => Number.isInteger(v);
const isPlain = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate the motion styles: whole-pixel poses, squash -1 to 1, wave 0 to 1, positive timings, non-empty loops.
 * @param {unknown} value @returns {string[]} problems, empty when valid
 */
export function motionStyleProblems(value) {
  /** @type {string[]} */ const problems = [];
  if (!isPlain(value)) return ['motion styles must be an object'];
  const v = /** @type {Record<string, unknown>} */ (value);
  if (v.format !== 'rpgameworks.creature-motion' || v.formatVersion !== 1) problems.push('format must be rpgameworks.creature-motion version 1');
  if (!isInt(v.pad) || /** @type {number} */ (v.pad) < 0 || /** @type {number} */ (v.pad) > 16) problems.push('pad must be a whole number from 0 to 16');
  if (!isPlain(v.styles) || !Object.keys(/** @type {object} */ (v.styles)).length) return [...problems, 'styles must name at least one style'];
  for (const [name, raw] of Object.entries(/** @type {Record<string, unknown>} */ (v.styles))) {
    const at = (/** @type {string} */ m) => problems.push(`styles.${name}: ${m}`);
    if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) at('style names are lowercase words');
    if (!isPlain(raw)) { at('must be an object'); continue; }
    const st = /** @type {Record<string, unknown>} */ (raw);
    if (typeof st.label !== 'string' || !st.label.trim()) at('needs a label');
    for (const key of ['legShare', 'armShare']) if (st[key] !== undefined && !(typeof st[key] === 'number' && st[key] >= 0 && st[key] <= 0.5)) at(`${key} must be from 0 to 0.5`);
    if (st.legShare === undefined) at('needs legShare');
    for (const key of ['walkMs', 'idleMs']) if (!isInt(st[key]) || /** @type {number} */ (st[key]) < 16 || /** @type {number} */ (st[key]) > 5000) at(`${key} must be a whole number from 16 to 5000`);
    if (st.waveAmp !== undefined && !(isInt(st.waveAmp) && /** @type {number} */ (st.waveAmp) >= 0 && /** @type {number} */ (st.waveAmp) <= 4)) at('waveAmp must be a whole number from 0 to 4');
    if (st.wavePeriod !== undefined && !(isInt(st.wavePeriod) && /** @type {number} */ (st.wavePeriod) >= 2 && /** @type {number} */ (st.wavePeriod) <= 32)) at('wavePeriod must be a whole number from 2 to 32');
    for (const loop of ['walk', 'idle']) {
      const poses = st[loop];
      if (!Array.isArray(poses) || !poses.length || poses.length > 12) { at(`${loop} needs 1 to 12 poses`); continue; }
      poses.forEach((pose, i) => {
        const where = `${loop}[${i}]`;
        if (!isPlain(pose)) { at(`${where} must be an object`); return; }
        for (const [k, val] of Object.entries(pose)) {
          if (!POSE_KEYS.has(k)) at(`${where}.${k} is not a pose setting`);
          else if (k === 'legL' || k === 'legR') { if (!Array.isArray(val) || val.length !== 2 || !val.every(isInt)) at(`${where}.${k} must be two whole numbers`); }
          else if (k === 'wave') { if (typeof val !== 'number' || val < 0 || val > 1) at(`${where}.wave must be from 0 to 1`); }
          else if (!isInt(val)) at(`${where}.${k} must be a whole number`);
          else if (k === 'squash' && Math.abs(val) > 1) at(`${where}.squash must be -1, 0 or 1`);
        }
      });
    }
  }
  return problems;
}

/**
 * Validate the assignments against the library IDs and the style names.
 * @param {unknown} value @param {Iterable<string>} libraryIds @param {Iterable<string>} styleNames
 * @returns {string[]}
 */
export function motionAssignmentProblems(value, libraryIds, styleNames) {
  if (!isPlain(value)) return ['motion assignments must be an object'];
  const v = /** @type {Record<string, unknown>} */ (value);
  /** @type {string[]} */ const problems = [];
  if (v.format !== 'rpgameworks.creature-motion-assignments' || v.formatVersion !== 1) problems.push('format must be rpgameworks.creature-motion-assignments version 1');
  if (!isPlain(v.assignments)) return [...problems, 'assignments must map monster IDs to styles'];
  const ids = new Set(libraryIds), styles = new Set(styleNames);
  for (const [id, style] of Object.entries(/** @type {Record<string, unknown>} */ (v.assignments))) {
    if (!ids.has(id)) problems.push(`${id}: not in the Stone Soup library`);
    if (typeof style !== 'string' || !styles.has(style)) problems.push(`${id}: unknown motion style ${JSON.stringify(style)}`);
  }
  return problems;
}
