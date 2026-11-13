/**
 * Creature atlas bake (decision 0015 C3). The content build bakes every Stone Soup creature its encounters use into one
 * atlas: for each creature (and facing), a still frame, its walk and idle loops in its assigned motion style, and a
 * body-only white flash for hits. Deterministic: the same creatures, styles and art give the same pixels.
 *
 * Pure: the caller reads the 32 × 32 tiles and encodes the PNG. A JSDoc-typed .mjs for the content build on Node 22.
 */
import { poseLoop, poseSprite } from './creature-pose.mjs';

/** @typedef {import('./creature-pose.mjs').Rgba} Rgba */
/** @typedef {import('./creature-pose.mjs').MotionStyles} MotionStyles */
/** @typedef {{ x: number, y: number, w: number, h: number }} FrameRect */
/**
 * What the battle needs to animate one creature: frame names in the atlas, its loop timings, and which way the art
 * faces (the stage mirrors left-facing art to face the party).
 * @typedef {{ id: string, faces: 'left' | 'right', style: string, walkMs: number, idleMs: number,
 *   still: string, walk: string[], idle: string[], flash: string }} CreatureFrames
 * @typedef {{ format: 'rpgameworks.creature-atlas', formatVersion: 1, image: string, size: { width: number, height: number },
 *   frames: Record<string, FrameRect>, creatures: Record<string, CreatureFrames> }} CreatureAtlasTable
 */

/** Atlas width in frames; frames are separated by a 1-pixel transparent gutter. */
const COLUMNS = 12;

/** The key a creature is stored under: one entry per creature and facing. @param {string} id @param {'left' | 'right'} faces */
export const creatureKey = (id, faces) => `${id}@${faces}`;

/**
 * @param {readonly { id: string, faces: 'left' | 'right' }[]} wanted creatures in use (duplicates are merged)
 * @param {{ tile: (id: string) => Rgba, styles: MotionStyles, assignments: Readonly<Record<string, string>>, image: string }} source
 * @returns {{ atlas: Rgba, table: CreatureAtlasTable }}
 */
export function bakeCreatureAtlas(wanted, { tile, styles, assignments, image }) {
  const keys = [...new Set(wanted.map((w) => creatureKey(w.id, w.faces)))].sort();
  /** @type {{ name: string, pixels: Rgba }[]} */ const frames = [];
  /** @type {Record<string, CreatureFrames>} */ const creatures = {};
  for (const key of keys) {
    const at = key.lastIndexOf('@');
    const id = key.slice(0, at), faces = /** @type {'left' | 'right'} */ (key.slice(at + 1));
    const styleName = assignments[id];
    const style = styleName === undefined ? undefined : styles.styles[styleName];
    if (!styleName || !style) throw new Error(`${id} has no motion assignment`);
    const art = tile(id), pad = styles.pad;
    /** @param {string} name @param {Rgba} pixels */
    const add = (name, pixels) => { frames.push({ name: `${key}/${name}`, pixels }); return `${key}/${name}`; };
    const still = add('still', poseSprite(art, {}, { pad }));
    const walk = poseLoop(style, 'walk', art, { pad, faces }).map((p, i) => add(`walk/${i}`, p));
    const idle = poseLoop(style, 'idle', art, { pad, faces }).map((p, i) => add(`idle/${i}`, p));
    const flashPose = poseSprite(art, {}, { pad, keepShadow: false });
    for (let i = 0; i < flashPose.data.length; i += 4) if (flashPose.data[i + 3]) flashPose.data.set([255, 255, 255], i);
    const flash = add('flash', flashPose);
    creatures[key] = { id, faces, style: styleName, walkMs: style.walkMs, idleMs: style.idleMs, still, walk, idle, flash };
  }
  const cell = frames[0] ? frames[0].pixels.width : 0, step = cell + 1;
  const columns = Math.min(COLUMNS, Math.max(1, frames.length)), rows = Math.ceil(frames.length / columns);
  const width = Math.max(1, columns * step + 1), height = Math.max(1, rows * step + 1);
  const atlas = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  /** @type {Record<string, FrameRect>} */ const rects = {};
  frames.forEach(({ name, pixels }, n) => {
    const x = 1 + (n % columns) * step, y = 1 + Math.floor(n / columns) * step;
    for (let row = 0; row < pixels.height; row++) atlas.data.set(pixels.data.subarray(row * pixels.width * 4, (row + 1) * pixels.width * 4), ((y + row) * width + x) * 4);
    rects[name] = { x, y, w: pixels.width, h: pixels.height };
  });
  return { atlas, table: { format: 'rpgameworks.creature-atlas', formatVersion: 1, image, size: { width, height }, frames: rects, creatures } };
}
