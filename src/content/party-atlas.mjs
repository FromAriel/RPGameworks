/**
 * Party atlas bake (decision 0019, roadmap S1.5c). The content build bakes each party member's LPC character, from the
 * committed sheets in assets/source/lpc, into one atlas: for each member its walk and its attack facing left and right,
 * its hurt (a single row in LPC), a standing frame each way (the walk's first frame: none of the chosen outfits has an
 * idle), and a front-facing upper-body portrait for the menus (Ariel, S1.5c). Deterministic: the same manifest and
 * sheets give the same pixels.
 *
 * Pure: the caller supplies the reduced sheets and encodes the PNG. A JSDoc-typed .mjs for the content build.
 */
import { bakeFrame } from './lpc/bake.mjs';

/** @typedef {import('./lpc/bake.mjs').Rgba} Rgba */
/** @typedef {{ x: number, y: number, w: number, h: number }} FrameRect */
/**
 * One animation: its frames facing left and right (or `front` for a single-row action), the frame size, how long each
 * frame shows, and where the feet are within a frame (the stage stands the frame there).
 * @typedef {{ action: string, size: number, frameMs: number, anchor: { x: number, y: number },
 *   left?: string[], right?: string[], front?: string[] }} PartyAnimation
 * @typedef {{ character: string, stand: { left: string, right: string, size: number, anchor: { x: number, y: number } },
 *   walk: PartyAnimation, attack: PartyAnimation, hurt: PartyAnimation, portrait: string }} PartyMemberArt
 * @typedef {{ format: 'rpgameworks.party-atlas', formatVersion: 1, image: string, size: { width: number, height: number },
 *   frames: Record<string, FrameRect>, members: Record<string, PartyMemberArt> }} PartyAtlasTable
 */

/** Milliseconds per frame by LPC action. Starting values, tuned when the battle plays them (S1.5d). */
export const FRAME_MS = Object.freeze({ walk: 110, walk_128: 110, slash_128: 90, shoot: 70, spellcast: 110, thrust: 90, hurt: 120 });
/** The portrait's square crop of a 48-pixel front-facing frame: head and shoulders. */
export const PORTRAIT = 20; // Drawn at exactly 2× in the 40-pixel menu boxes (Ariel, S1.5d).
/** The highest row a portrait crop may start at in a 48-pixel frame. */
const PORTRAIT_TOP = 8;
/** Feet within an LPC frame: 48-pixel frames stand at (24, 40); larger frames are centred on the same point. */
const anchorFor = (/** @type {number} */ size) => ({ x: size / 2, y: size / 2 + 16 });

/**
 * A member's actions sorted into walk, attack and hurt: exactly one walk ('walk' or the bow's 'walk_128'), a 'hurt',
 * and exactly one other action, the weapon's attack.
 * @param {string} character @param {Record<string, unknown>} actions
 */
export function memberActions(character, actions) {
  const names = Object.keys(actions);
  const walks = names.filter(n => n === 'walk' || n === 'walk_128');
  const attacks = names.filter(n => n !== 'hurt' && !(/** @type {string[]} */ (walks)).includes(n));
  if (walks.length !== 1 || !names.includes('hurt') || attacks.length !== 1) {
    throw new Error(`LPC character ${character} needs one walk, one attack and hurt (has ${names.join(', ')})`);
  }
  return { walk: /** @type {string} */ (walks[0]), attack: /** @type {string} */ (attacks[0]), hurt: 'hurt' };
}

/**
 * @param {any} manifest the committed LPC manifest
 * @param {readonly { id: string, character: string }[]} members party members and their LPC characters
 * @param {{ reduced: (file: string) => Rgba & { cellOut: number }, threshold: number, image: string }} source
 * @returns {{ atlas: Rgba, table: PartyAtlasTable }}
 */
export function bakePartyAtlas(manifest, members, { reduced, threshold, image }) {
  /** @type {{ name: string, pixels: Rgba }[]} */ const frames = [];
  /** @type {Record<string, PartyMemberArt>} */ const art = {};
  for (const { id, character } of members) {
    const spec = manifest.characters[character];
    if (!spec) throw new Error(`Party member ${id}: no LPC character ${character}`);
    const actions = memberActions(character, spec.actions);
    /** @param {string} name @param {Rgba} pixels */
    const add = (name, pixels) => { frames.push({ name: `${id}/${name}`, pixels }); return `${id}/${name}`; };
    const count = (/** @type {any} */ a) => (a.kind === 'standard' ? a.cycle.length : (a.frames[1] ?? a.frames[0]).length);
    const rowsOf = (/** @type {any} */ a) => (a.kind === 'standard' ? a.rows : a.frames.length);
    /** @param {string} action @returns {PartyAnimation} */
    const animation = (action) => {
      const a = spec.actions[action];
      /** @type {PartyAnimation} */ const out = { action, size: a.size, frameMs: FRAME_MS[/** @type {keyof typeof FRAME_MS} */ (action)] ?? 100, anchor: anchorFor(a.size) };
      const directions = rowsOf(a) >= 4 ? /** @type {const} */ (['left', 'right']) : /** @type {const} */ (['front']);
      for (const direction of directions) {
        const row = direction === 'front' ? 'up' : direction; // A single-row action has only the first row.
        out[direction] = Array.from({ length: count(a) }, (_, phase) => add(`${action}/${direction}/${phase}`, bakeFrame(manifest, character, action, row, phase, reduced, threshold)));
      }
      return out;
    };
    const walk = animation(actions.walk), attack = animation(actions.attack), hurt = animation(actions.hurt);
    const walkSpec = spec.actions[actions.walk];
    const stand = { left: /** @type {string[]} */ (walk.left)[0] ?? '', right: /** @type {string[]} */ (walk.right)[0] ?? '', size: walk.size, anchor: walk.anchor };
    // The portrait: the walk's first frame facing the viewer, cut to head and shoulders around the figure's top.
    const front = bakeFrame(manifest, character, actions.walk, 'down', 0, reduced, threshold);
    add('portrait', portraitCrop(front, walkSpec.size));
    art[id] = { character, stand, walk, attack, hurt, portrait: `${id}/portrait` };
  }
  const { atlas, rects } = pack(frames);
  return { atlas, table: { format: 'rpgameworks.party-atlas', formatVersion: 1, image, size: { width: atlas.width, height: atlas.height }, frames: rects, members: art } };
}

/**
 * A PORTRAIT-square crop of a front-facing frame: from just above the figure's highest pixel, centred on the figure.
 * An oversized frame (the bow's walk) is first reduced to its centred 48-pixel figure area.
 * @param {Rgba} frame @param {number} size
 * @returns {Rgba}
 */
function portraitCrop(frame, size) {
  const inset = (size - 48) / 2;
  let top = 48, left = 48, right = -1;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    if (!frame.data[((y + inset) * size + x + inset) * 4 + 3]) continue;
    top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  if (right < 0) throw new Error('Empty portrait frame');
  const x0 = Math.max(0, Math.min(48 - PORTRAIT, Math.round((left + right + 1) / 2 - PORTRAIT / 2)));
  // A tall hat must not push the face out of the crop: the crop never starts above PORTRAIT_TOP, where an LPC head's
  // hair begins, so a hat's tip is trimmed instead.
  const y0 = Math.max(PORTRAIT_TOP, Math.min(48 - PORTRAIT, top - 1));
  const out = { width: PORTRAIT, height: PORTRAIT, data: new Uint8ClampedArray(PORTRAIT * PORTRAIT * 4) };
  for (let y = 0; y < PORTRAIT; y++) {
    const start = ((y0 + y + inset) * size + x0 + inset) * 4;
    out.data.set(frame.data.subarray(start, start + PORTRAIT * 4), y * PORTRAIT * 4);
  }
  return out;
}

/**
 * Frames of mixed sizes packed on shelves, largest first, with a 1-pixel transparent gutter; the atlas is as wide as
 * twelve of the largest frames.
 * @param {{ name: string, pixels: Rgba }[]} frames
 */
function pack(frames) {
  const sorted = [...frames].sort((a, b) => b.pixels.height - a.pixels.height || (a.name < b.name ? -1 : 1));
  const largest = sorted[0]?.pixels.width ?? 1;
  const width = 12 * (largest + 1) + 1;
  /** @type {Record<string, FrameRect>} */ const rects = {};
  let x = 1, y = 1, shelf = 0;
  for (const { name, pixels } of sorted) {
    if (x + pixels.width + 1 > width) { x = 1; y += shelf + 1; shelf = 0; }
    rects[name] = { x, y, w: pixels.width, h: pixels.height };
    x += pixels.width + 1; shelf = Math.max(shelf, pixels.height);
  }
  const height = y + shelf + 1;
  const atlas = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (const { name, pixels } of frames) {
    const r = /** @type {FrameRect} */ (rects[name]);
    for (let row = 0; row < pixels.height; row++) atlas.data.set(pixels.data.subarray(row * pixels.width * 4, (row + 1) * pixels.width * 4), ((r.y + row) * width + r.x) * 4);
  }
  return { atlas, rects };
}
