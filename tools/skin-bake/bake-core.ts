/**
 * Skin bake core (decision 0013 B2): turn a validated skin recipe into an ordinary v2 window skin — atlas pixels plus
 * their manifest — that the game loads like any hand-made skin. Tool code only; the game never imports it.
 *
 * No file system and no PNG codec here (0013 B4-Q3): the same core runs in Node (bake.ts, npm run skins) and in the
 * skin studio page. The caller supplies a recipe's PNG art as decoded pixels and encodes the atlas itself.
 *
 * Method: compose a few lit reference frames with the Pixel Frame core (Ariel's pixelstudio demonstrator, ported in
 * W2.1 and restored here as tool code) and cut every W1 piece out of them: four corners (each lit on its own side of
 * the light), one pattern period of each rail, plain gap pieces, medallions, title posts, divider pieces and the fill.
 * Pieces cut from one lit frame meet without seams. Outward overhang is not supported yet (0011 D10), so ornament
 * pixels outside the window box are clipped.
 */
import { composeFrame } from './pixel-frame/frame.ts';
import type { ComposedFrame } from './pixel-frame/frame.ts';
import { shade } from './pixel-frame/shade.ts';
import type { RgbaImage, ShadeOptions } from './pixel-frame/shade.ts';
import { ORNAMENT_SIZES, defineAccentVariant, defineArt, getArt } from './pixel-frame/art.ts';
import type { OrnamentSize } from './pixel-frame/art.ts';
import { artFromImage } from './pixel-frame/art-io.ts';
import { hexToRgb, mix, resolveTheme, themeFromBase } from './pixel-frame/palettes.ts';
import type { Theme } from './pixel-frame/palettes.ts';
import type { FrameStyle } from './pixel-frame/styles.ts';
import type { Profile } from './pixel-frame/profile.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
/** Rail tile length when a recipe has no motif. */
const PLAIN_PERIOD = 16;
const ATLAS_WIDTH = 256;

interface ArtRef { readonly library?: string; readonly png?: string }
type ArtMaterial = 'as-drawn' | 'accent';
/** A recipe after readRecipe (tools/skin-bake/recipe.mjs): every default filled in. */
export interface FilledRecipe {
  readonly name: string;
  readonly band: Readonly<Record<Side, number>>;
  readonly profile: readonly number[];
  readonly corner: { readonly art: ArtRef; readonly size: OrnamentSize; readonly material: ArtMaterial };
  readonly motif?: { readonly art: ArtRef; readonly size: OrnamentSize; readonly material: ArtMaterial; readonly period: number; readonly spacing: 'mirrored-end' | 'even' };
  readonly medallions?: Partial<Record<Side, { readonly art: ArtRef; readonly size?: OrnamentSize; readonly material?: ArtMaterial; readonly minEdge?: number }>>;
  readonly title: { readonly openWidth: number; readonly fillWidth: number; readonly closeWidth: number; readonly textGap: number };
  readonly colors: { readonly theme?: 'iron' | 'brass' | 'silver' | 'obsidian'; readonly base?: string; readonly frame?: readonly string[]; readonly accent?: readonly string[] };
  readonly light: { readonly azimuth: number; readonly elevation: number; readonly steps: number; readonly outline: boolean; readonly shadow: boolean; readonly wear: number; readonly tarnish: boolean };
  readonly fill: {
    readonly type: 'flat' | 'bands' | 'gradient'; readonly color?: string; readonly top?: string; readonly bottom?: string; readonly bandHeight?: number; readonly tileHeight?: number;
    readonly from?: string; readonly to?: string; readonly steps?: number; readonly direction?: 'down' | 'up' | 'right' | 'left';
  };
  readonly divider: { readonly band: number; readonly profile: readonly number[] };
  readonly contentMargin: number;
}

/** One cut piece of the skin. */
interface Tile { readonly id: string; readonly w: number; readonly h: number; readonly data: Uint8ClampedArray }
type TileEntry = { id: string; rect: { x: number; y: number; w: number; h: number } } | { id: string; same: string };

export interface BakedAtlas {
  /** The v2 manifest; `image` names the atlas file it was written for. */
  readonly manifest: Record<string, unknown>;
  readonly atlas: RgbaImage;
}

/** Decoded pixels of one of the recipe's PNG art files, by its name in the recipe. */
export type ArtLoader = (png: string) => RgbaImage;

/** Bake a filled recipe into atlas pixels. `art` supplies PNG art; `image` names the atlas file in the manifest. */
export function bakeAtlas(recipe: FilledRecipe, { art: loadArt, image = 'Window.png' }: { art: ArtLoader; image?: string }): BakedAtlas {
  const o = recipe.light.outline ? 1 : 0;
  const p = recipe.profile.length;
  for (const side of SIDES) {
    if (o + p > recipe.band[side]) throw new Error(`The ${side} band (${recipe.band[side]}) has no room for the outline and the ${p}-step profile; make it at least ${o + p}`);
  }
  if (o + recipe.divider.profile.length > recipe.divider.band) {
    throw new Error(`The divider band (${recipe.divider.band}) has no room for the outline and its ${recipe.divider.profile.length}-step profile`);
  }
  const shadeOptions: ShadeOptions = {
    az: recipe.light.azimuth, el: recipe.light.elevation, steps: recipe.light.steps, outline: recipe.light.outline, shadow: recipe.light.shadow,
    theme: recipeTheme(recipe), wear: recipe.light.wear, tarnish: recipe.light.tarnish, dither: false, brushed: false,
  };
  const backdrop = fillColor(recipe);
  // A gradient changes across the window, so no fixed colour can stand in for it inside the frame pieces: where the
  // painter's fill already covers (from the middle of each band inward), those pixels stay clear and the fill shows.
  const clearFill = recipe.fill.type === 'gradient'
    ? { top: Math.floor(recipe.band.top / 2), right: Math.floor(recipe.band.right / 2), bottom: Math.floor(recipe.band.bottom / 2), left: Math.floor(recipe.band.left / 2) }
    : null;
  const lit = (style: FrameStyle, W: number, H: number, size: OrnamentSize, transpose = false): Lit =>
    makeLit(style, W, H, size, shadeOptions, o, backdrop, transpose, clearFill);
  const style = (extra: Partial<FrameStyle> = {}, profile: readonly number[] = recipe.profile): FrameStyle =>
    ({ name: recipe.name, tier: 'panel', profile: profile as Profile, corner: null, motif: null, medallion: null, ...extra });

  const tiles: Tile[] = [];
  const entries: TileEntry[] = [];
  const add = (tile: Tile): void => { tiles.push(tile); };
  const alias = (id: string, same: string): void => { entries.push({ id, same }); };

  // Corners: each lit on its own side of the light, so all four are separate tiles.
  const cornerArt = artName(recipe.corner.art, loadArt, recipe.corner.material);
  const art = getArt(cornerArt, recipe.corner.size);
  const reachX = art ? Math.max(0, art.w - art.ox) : 0, reachY = art ? Math.max(0, art.h - art.oy) : 0;
  const cw = (side: 'left' | 'right') => Math.max(recipe.band[side], o + Math.max(p, reachX));
  const ch = (side: 'top' | 'bottom') => Math.max(recipe.band[side], o + Math.max(p, reachY));
  {
    const W = 2 * Math.max(cw('left'), cw('right')) + 4, H = 2 * Math.max(ch('top'), ch('bottom')) + 4;
    const frame = lit(style({ corner: cornerArt }), W, H, recipe.corner.size);
    add(frame.cut('corner.tl', 0, 0, cw('left'), ch('top')));
    add(frame.cut('corner.tr', frame.outerW - cw('right'), 0, cw('right'), ch('top')));
    add(frame.cut('corner.bl', 0, frame.outerH - ch('bottom'), cw('left'), ch('bottom')));
    add(frame.cut('corner.br', frame.outerW - cw('right'), frame.outerH - ch('bottom'), cw('right'), ch('bottom')));
  }

  // Rails: one pattern period from the middle of a frame whose motifs fall exactly every period.
  const motif = recipe.motif;
  const P = motif ? Math.round(motif.period * ORNAMENT_SIZES[motif.size]) : PLAIN_PERIOD;
  const count = 3 + 2 * Math.ceil((p + o + 1) / P); // Room for the mitred corners on both sides of the middle period.
  const railBox = count * P + 2;
  const middle = 1 + Math.floor(count / 2) * P; // Box offset of the middle period (placeAlong starts at reserve + 1).
  const cutRails = (frame: Lit, suffix: string): void => {
    add(frame.cut(`edge.top.${suffix}`, o + middle, 0, P, recipe.band.top));
    add(frame.cut(`edge.bottom.${suffix}`, o + middle, frame.outerH - recipe.band.bottom, P, recipe.band.bottom));
    add(frame.cut(`edge.left.${suffix}`, 0, o + middle, recipe.band.left, P));
    add(frame.cut(`edge.right.${suffix}`, frame.outerW - recipe.band.right, o + middle, recipe.band.right, P));
  };
  if (motif) {
    cutRails(lit(style({ motif: { art: artName(motif.art, loadArt, motif.material), period: motif.period } }), railBox, railBox, motif.size), 'rail');
    cutRails(lit(style(), railBox, railBox, 'medium'), 'plain');
  } else {
    cutRails(lit(style(), railBox, railBox, 'medium'), 'rail');
    for (const side of SIDES) alias(`edge.${side}.plain`, `edge.${side}.rail`);
  }
  alias('edge.top.left', 'edge.top.rail'); alias('edge.top.right', 'edge.top.rail');
  alias('edge.bottom.left', 'edge.bottom.rail'); alias('edge.bottom.right', 'edge.bottom.rail');
  alias('edge.left.upper', 'edge.left.rail'); alias('edge.left.lower', 'edge.left.rail');
  alias('edge.right.upper', 'edge.right.rail'); alias('edge.right.lower', 'edge.right.rail');

  // Medallions: Pixel Frame centres them on the top and bottom edges; left and right ones come from a transposed
  // frame lit with the transposed light, then turned back.
  const midpoints: Partial<Record<Side, { minEdge: number }>> = {};
  for (const side of SIDES) {
    const spec = recipe.medallions?.[side];
    if (!spec) continue;
    const size = spec.size ?? 'medium';
    const name = artName(spec.art, loadArt, spec.material);
    const medal = getArt(name, size);
    if (!medal) throw new Error(`Medallion art for the ${side} side could not be loaded`);
    const vertical = side === 'left' || side === 'right';
    const along = medal.w + 2 * (p + o + 4) + 2, across = 2 * (Math.max(...SIDES.map(s => recipe.band[s])) + medal.h) + 4;
    const frame = lit(style({ medallion: name }), vertical ? across : along, vertical ? along : across, size, vertical);
    const at = frame.medalAt as number; // Box offset of the medallion along its edge.
    const mid = Math.floor(p / 2), topInward = mid - (medal.h >> 1) + medal.h;
    const thick = Math.max(recipe.band[side], o + topInward);
    const outerAcross = vertical ? frame.outerW : frame.outerH;
    const start = side === 'top' || side === 'left' ? 0 : outerAcross - thick;
    add(vertical ? frame.cut(`mid.${side}`, start, o + at, thick, medal.w) : frame.cut(`mid.${side}`, o + at, start, medal.w, thick));
    const corners = vertical ? ch('top') + ch('bottom') : cw('left') + cw('right');
    midpoints[side] = { minEdge: spec.minEdge ?? corners + medal.w + 8 };
  }

  // Title posts and divider label posts: small lit blocks; the title fill is the window fill.
  const post = (id: string, w: number, h: number, profile: readonly number[]): void => {
    const frame = lit(style({}, clampProfile(profile, w, h, o)), Math.max(1, w - 2 * o), Math.max(1, h - 2 * o), 'medium');
    add(frame.cut(id, 0, 0, w, h));
  };
  post('title.open', recipe.title.openWidth, recipe.band.top, recipe.profile);
  post('title.close', recipe.title.closeWidth, recipe.band.top, recipe.profile);
  add(solid('title.fill', recipe.title.fillWidth, recipe.band.top, titleFillColor(recipe) ?? backdrop));

  // Dividers: one lit bar; caps from its ends, the repeat from its middle.
  {
    const band = recipe.divider.band, cap = band, Pd = PLAIN_PERIOD;
    const W = 2 * cap + 3 * Pd + 2, H = Math.max(1, band - 2 * o);
    const frame = lit(style({}, clampProfile(recipe.divider.profile, W, band, o)), W, H, 'medium');
    add(frame.cut('divider.cap.left', 0, 0, cap, band));
    add(frame.cut('divider.cap.right', frame.outerW - cap, 0, cap, band));
    add(frame.cut('divider.h.repeat', o + cap + Pd, 0, Pd, band));
    alias('divider.h.plain', 'divider.h.repeat');
    post('divider.label.open', recipe.title.openWidth, band, recipe.divider.profile);
    post('divider.label.close', recipe.title.closeWidth, band, recipe.divider.profile);
  }

  add(fillTile(recipe));

  // Pack (rows, 1-pixel transparent gutters) and write the manifest.
  const placed = pack(tiles);
  const atlas: RgbaImage = { width: placed.width, height: placed.height, data: new Uint8ClampedArray(placed.width * placed.height * 4) };
  for (const { tile, x, y } of placed.items) {
    for (let row = 0; row < tile.h; row++) atlas.data.set(tile.data.subarray(row * tile.w * 4, (row + 1) * tile.w * 4), ((y + row) * atlas.width + x) * 4);
  }
  const manifestTiles: TileEntry[] = [...placed.items.map(({ tile, x, y }) => ({ id: tile.id, rect: { x, y, w: tile.w, h: tile.h } })), ...entries];
  const spacing = motif?.spacing ?? 'mirrored-end';
  const manifest = {
    format: 'rpgameworks.windowskin', formatVersion: 2, theme: recipe.name, image, size: { width: atlas.width, height: atlas.height },
    geometry: {
      band: { ...recipe.band },
      title: { textCenter: Math.floor(recipe.band.top / 2), textGap: recipe.title.textGap },
      rails: Object.fromEntries(SIDES.map(side => [side, { spacing, gapFill: { tile: `edge.${side}.plain` } }])),
      ...(Object.keys(midpoints).length ? { midpoints } : {}),
      contentMargin: recipe.contentMargin,
      ...(recipe.fill.type === 'gradient' ? { fill: { stretch: recipe.fill.direction === 'right' || recipe.fill.direction === 'left' ? 'horizontal' : 'vertical' } } : {}),
    },
    tiles: manifestTiles,
  };
  return { manifest, atlas };
}

/** A lit reference frame and a cutter that reads it in "outer" coordinates (the box edge minus the outline). */
interface Lit {
  readonly outerW: number;
  readonly outerH: number;
  /** For medallion frames: the medallion's offset along its edge, in box coordinates. */
  readonly medalAt: number | null;
  cut(id: string, x: number, y: number, w: number, h: number): Tile;
}

function makeLit(style: FrameStyle, W: number, H: number, size: OrnamentSize, options: ShadeOptions, o: number,
  backdrop: readonly [number, number, number], transpose: boolean, clearFill: Readonly<Record<Side, number>> | null): Lit {
  const p = style.profile.length;
  let frame: ComposedFrame, image: RgbaImage;
  if (!transpose) {
    frame = composeFrame(style, W, H, { ornament: size, normalMode: 'blend' });
    image = shade(frame, options);
  } else {
    // Compose with width and height swapped, light the transposed light, then transpose back.
    frame = composeFrame(style, H, W, { ornament: size, normalMode: 'blend' });
    image = transposeImage(shade(frame, { ...options, az: ((450 - options.az) % 360 + 360) % 360 }));
  }
  const M = frame.M;
  return {
    outerW: W + 2 * o, outerH: H + 2 * o, medalAt: frame.medalX,
    cut(id, x0, y0, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          const bx = x0 + tx - o, by = y0 + ty - o; // Box coordinates.
          const t = (ty * w + tx) * 4;
          // Inside the box beyond the bevel, the window fill shows through (so thick bands have no gap).
          const covered = clearFill !== null && bx + o >= clearFill.left && by + o >= clearFill.top && W - 1 - bx + o >= clearFill.right && H - 1 - by + o >= clearFill.bottom;
          if (!covered && bx >= 0 && by >= 0 && bx < W && by < H && Math.min(bx, by, W - 1 - bx, H - 1 - by) >= p) {
            data[t] = backdrop[0]; data[t + 1] = backdrop[1]; data[t + 2] = backdrop[2]; data[t + 3] = 255;
          }
          const fx = bx + M, fy = by + M;
          if (fx < 0 || fy < 0 || fx >= image.width || fy >= image.height) continue;
          const s = (fy * image.width + fx) * 4, a = image.data[s + 3]! / 255;
          if (!a) continue;
          const da = data[t + 3]! / 255, oa = a + da * (1 - a);
          for (let c = 0; c < 3; c++) data[t + c] = Math.round((image.data[s + c]! * a + data[t + c]! * da * (1 - a)) / oa);
          data[t + 3] = Math.round(oa * 255);
        }
      }
      return { id, w, h, data };
    },
  };
}

function transposeImage(image: RgbaImage): RgbaImage {
  const out: RgbaImage = { width: image.height, height: image.width, data: new Uint8ClampedArray(image.data.length) };
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) out.data.set(image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4), (x * out.width + y) * 4);
  }
  return out;
}

/** A post or divider bar thinner than twice its profile keeps only the outer steps that fit. */
function clampProfile(profile: readonly number[], w: number, h: number, o: number): Profile {
  const room = Math.max(1, Math.floor((Math.min(w, h) - 2 * o) / 2));
  return (profile.length > room ? profile.slice(0, room) : profile) as Profile;
}

/** The starting theme (named or from a base colour) with the recipe's own frame and accent ramps put in. */
function recipeTheme(recipe: FilledRecipe): Theme {
  const start = recipe.colors.theme ? resolveTheme(recipe.colors.theme) : themeFromBase(recipe.colors.base as string);
  return { ...start, metal: recipe.colors.frame ?? start.metal, accent: recipe.colors.accent ?? start.accent };
}

/**
 * Library art by its kebab-case recipe name, or a recipe's PNG registered under a private name. Material "accent"
 * gives the variant whose metal pixels are accent.
 */
function artName(ref: ArtRef, loadArt: ArtLoader, material: ArtMaterial = 'as-drawn'): string {
  const name = baseArtName(ref, loadArt);
  return material === 'accent' ? defineAccentVariant(name) : name;
}

function baseArtName(ref: ArtRef, loadArt: ArtLoader): string {
  if (ref.library) return ref.library.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const image = loadArt(ref.png as string);
  // Anchored at the window corner: outward overhang is not supported yet (0011 D10), so the whole piece reaches inward.
  const result = artFromImage(image, { ox: 0, oy: 0 });
  if ('error' in result) throw new Error(`${ref.png}: ${result.error}`);
  // Named by its pixels, so two recipes' different "corner.png" files never share a registry entry.
  const name = `png:${ref.png}#${fnv1a(image.data)}`;
  defineArt(name, result.def);
  return name;
}

/** Behind the title, in the top band: a top-to-bottom gradient's top colour (null: the backdrop colour). */
function titleFillColor(recipe: FilledRecipe): readonly [number, number, number] | null {
  const f = recipe.fill;
  if (f.type !== 'gradient' || f.direction === 'right' || f.direction === 'left') return null;
  return hexToRgb((f.direction === 'up' ? f.to : f.from) as string);
}

function fillColor(recipe: FilledRecipe): readonly [number, number, number] {
  const f = recipe.fill;
  // What shows through inside the box beyond the bevel; a gradient uses its middle colour.
  if (f.type === 'gradient') return hexToRgb(mix(f.from as string, f.to as string, 0.5));
  return hexToRgb(f.type === 'flat' ? f.color as string : f.top as string);
}

function solid(id: string, w: number, h: number, rgb: readonly [number, number, number]): Tile {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  return { id, w, h, data };
}

/** The interior tile: 8 pixels wide; flat, or bands blending from the top colour to the bottom colour. */
function fillTile(recipe: FilledRecipe): Tile {
  const f = recipe.fill;
  if (f.type === 'flat') return solid('fill.plain', 8, 8, hexToRgb(f.color as string));
  if (f.type === 'gradient') {
    // One pixel per band, in a line the window stretches across itself (manifest geometry.fill.stretch).
    const steps = f.steps as number, horizontal = f.direction === 'right' || f.direction === 'left';
    const reversed = f.direction === 'up' || f.direction === 'left';
    const data = new Uint8ClampedArray(steps * 4);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), rgb = hexToRgb(mix(f.from as string, f.to as string, reversed ? 1 - t : t));
      data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
    return { id: 'fill.plain', w: horizontal ? steps : 1, h: horizontal ? 1 : steps, data };
  }
  const h = f.tileHeight as number, band = f.bandHeight as number, bands = Math.ceil(h / band);
  const data = new Uint8ClampedArray(8 * h * 4);
  for (let y = 0; y < h; y++) {
    const index = Math.floor(y / band), t = bands > 1 ? index / (bands - 1) : 0;
    const rgb = hexToRgb(mix(f.top as string, f.bottom as string, t));
    for (let x = 0; x < 8; x++) data.set([rgb[0], rgb[1], rgb[2], 255], (y * 8 + x) * 4);
  }
  return { id: 'fill.plain', w: 8, h, data };
}

/** Shelf packing in the order given (deterministic), with a 1-pixel transparent gutter around every tile. */
function pack(tiles: readonly Tile[]): { width: number; height: number; items: { tile: Tile; x: number; y: number }[] } {
  const width = Math.max(ATLAS_WIDTH, ...tiles.map(t => t.w + 2));
  const items: { tile: Tile; x: number; y: number }[] = [];
  let x = 1, y = 1, shelf = 0;
  for (const tile of tiles) {
    if (x + tile.w + 1 > width) { x = 1; y += shelf + 1; shelf = 0; }
    items.push({ tile, x, y });
    x += tile.w + 1; shelf = Math.max(shelf, tile.h);
  }
  return { width, height: y + shelf + 1, items };
}

/** FNV-1a over the art's pixels: a short, stable registry key. */
function fnv1a(data: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) { h ^= data[i]!; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
