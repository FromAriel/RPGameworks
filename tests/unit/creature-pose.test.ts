import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { motionAssignmentProblems, motionStyleProblems, poseLoop, poseSprite, shadowMask, spriteShape } from '../../src/content/creature-pose.mjs';
import type { MotionStyle, MotionStyles, Rgba } from '../../src/content/creature-pose.mjs';
import { LIBRARY_ROOT, fileOf, libraryIds } from '../../tools/import-stone-soup.mjs';

/**
 * Decision 0015 C2: Splurt's pixel motion ported, with Ariel's motion styles and 1,282 assignments. The first three
 * tests are DanJen Delver's sprite-motion tests, ported.
 */
const styles = JSON.parse(readFileSync('assets/source/creatures/motion-styles.json', 'utf8')) as MotionStyles;
const assignments = JSON.parse(readFileSync('assets/source/creatures/motion-assignments.json', 'utf8')) as { assignments: Record<string, string> };
const tile = (id: string): Rgba => { const png = PNG.sync.read(readFileSync(fileOf(LIBRARY_ROOT, id))); return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }; };

// A 12 × 12 test sprite: a red body (rows 2–8), two blue feet (rows 9–10, columns 3–4 and 7–8) and a black shadow blob
// off to the side (columns 10–11, rows 10–11), clear of any colour, as Stone Soup draws them.
function figure(): Rgba {
  const w = 12, h = 12, data = new Uint8ClampedArray(w * h * 4);
  const set = (x: number, y: number, rgb: number[]) => data.set([...rgb, 255], (y * w + x) * 4);
  for (let y = 2; y <= 8; y++) for (let x = 3; x <= 8; x++) set(x, y, [200, 40, 40]);
  for (let y = 9; y <= 10; y++) for (const x of [3, 4, 7, 8]) set(x, y, [40, 40, 200]);
  for (let y = 10; y <= 11; y++) for (let x = 10; x <= 11; x++) set(x, y, [0, 0, 0]);
  return { width: w, height: h, data };
}
const at = (img: Rgba, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const colours = (img: Rgba) => { const out = new Set<string>(); for (let i = 0; i < img.data.length; i += 4) out.add(img.data.subarray(i, i + 4).join()); return out; };

describe('creature pixel motion (decision 0015 C2)', () => {
  it('finds the drop shadow and leaves it out of the body', () => {
    const img = figure(), mask = shadowMask(img), s = spriteShape(img)!;
    expect(mask[11 * 12 + 11]).toBe(1);
    expect(mask[10 * 12 + 3]).toBe(0); // A foot is not shadow.
    expect([s.top, s.bottom, s.left, s.right]).toEqual([2, 10, 3, 8]);
  });

  it('an empty pose only pads the sprite; every pose uses only the sprite’s own colours', () => {
    const img = figure(), pad = 3, still = poseSprite(img, {}, { pad });
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) expect(at(still, x + pad, y + pad)).toEqual(at(img, x, y));
    const moved = poseSprite(img, { legL: [-1, -1], legR: [1, 0], lean: 2, bounce: -2, squash: 1 }, { legShare: 0.22, pad });
    const source = colours(img);
    for (const c of colours(moved)) expect(source.has(c), `colour ${c}`).toBe(true);
  });

  it('a bounce lifts the body but not its shadow; legs step on their own; the flash leaves the shadow out', () => {
    const img = figure(), pad = 3;
    const up = poseSprite(img, { bounce: -2 }, { pad });
    expect(at(up, 11 + pad, 11 + pad)).toEqual([0, 0, 0, 255]); // The shadow stays on the floor.
    expect(at(up, 5 + pad, 0 + pad)).toEqual([200, 40, 40, 255]); // The body rose two.
    expect(at(poseSprite(img, {}, { pad, keepShadow: false }), 11 + pad, 11 + pad)).toEqual([0, 0, 0, 0]);
    const step = poseSprite(img, { legL: [0, -1] }, { legShare: 0.22, pad });
    expect(at(step, 3 + pad, 10 + pad)).toEqual([0, 0, 0, 0]); // The left foot lifted off its lowest row.
    expect(at(step, 7 + pad, 10 + pad)).toEqual([40, 40, 200, 255]); // The right foot stayed.
  });

  it('the motion styles are valid whole-pixel poses, and bad ones are reported', () => {
    expect(motionStyleProblems(styles)).toEqual([]);
    expect(Object.fromEntries(Object.entries(styles.styles).map(([name, st]) => [name, st.label]))).toEqual({ walk: 'Walk', slither: 'Slither', hover: 'Float' });
    const broken = structuredClone(styles) as unknown as { styles: Record<string, Record<string, unknown>> };
    broken.styles.walk!.walk = [{ squash: 2 }, { legL: [0.5, 0] }, { spin: 1 }];
    broken.styles.hover!.idleMs = 0;
    expect(motionStyleProblems(broken)).toEqual([
      'styles.walk: walk[0].squash must be -1, 0 or 1',
      'styles.walk: walk[1].legL must be two whole numbers',
      'styles.walk: walk[2].spin is not a pose setting',
      'styles.hover: idleMs must be a whole number from 16 to 5000',
    ]);
  });

  it('Ariel’s assignments give every one of the 1,282 monsters a known style', () => {
    const ids = libraryIds(LIBRARY_ROOT);
    expect(motionAssignmentProblems(assignments, ids, Object.keys(styles.styles))).toEqual([]);
    expect(Object.keys(assignments.assignments).sort()).toEqual(ids);
    const count: Record<string, number> = {};
    for (const style of Object.values(assignments.assignments)) count[style] = (count[style] ?? 0) + 1;
    expect(count).toEqual({ walk: 589, hover: 379, slither: 314 });
    expect(motionAssignmentProblems({ ...assignments, assignments: { 'dcss/monster/nope': 'walk', 'dcss/monster/animals/adder': 'fly' } }, ids, ['walk']))
      .toEqual(['dcss/monster/nope: not in the Stone Soup library', 'dcss/monster/animals/adder: unknown motion style "fly"']);
  });

  it('every monster poses through its walk and idle loops using only its own colours', () => {
    const problems: string[] = [];
    for (const [id, styleName] of Object.entries(assignments.assignments)) {
      const img = tile(id), style = styles.styles[styleName] as MotionStyle, source = colours(img);
      for (const loop of ['walk', 'idle'] as const) {
        for (const pose of poseLoop(style, loop, img, { pad: styles.pad })) {
          if (pose.width !== 32 + 2 * styles.pad) problems.push(`${id} ${loop}: size`);
          for (const c of colours(pose)) if (c !== '0,0,0,0' && !source.has(c)) { problems.push(`${id} ${loop}: new colour ${c}`); break; }
        }
      }
    }
    expect(problems).toEqual([]);
  }, 30_000); // 1,282 PNG decodes and about 11,000 poses: about 3.5 s alone, over 5 s when the whole suite runs in parallel.

  it('bakes the same pixels every time (pinned for one monster of each style)', () => {
    const digest = (id: string, styleName: string, faces: 'left' | 'right') => {
      const style = styles.styles[styleName] as MotionStyle, hash = createHash('sha256');
      for (const loop of ['walk', 'idle'] as const) for (const pose of poseLoop(style, loop, tile(id), { pad: styles.pad, faces })) hash.update(pose.data);
      return hash.digest('hex').slice(0, 16);
    };
    const pinned = {
      walk: digest('dcss/monster/undead/skeletal_warrior_new', 'walk', 'right'),
      hover: digest('dcss/monster/demons/white_imp', 'hover', 'left'),
      slither: digest('dcss/monster/animals/adder', 'slither', 'right'),
    };
    expect(digest('dcss/monster/undead/skeletal_warrior_new', 'walk', 'right')).toBe(pinned.walk);
    expect(pinned).toMatchInlineSnapshot(`
      {
        "hover": "f4fc40242422d799",
        "slither": "b24fddb429d9114c",
        "walk": "3a09ffc8dacd8379",
      }
    `);
  });
});
