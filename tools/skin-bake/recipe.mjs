/**
 * Skin recipes (decision 0013 B1): a window skin described as settings. This module reads and validates a recipe and
 * fills in its defaults; the bake core (B2) turns the result into an ordinary v2 window skin.
 *
 * Tool code only: the game never imports anything under tools/skin-bake/.
 *
 *   node tools/skin-bake/recipe.mjs <recipe.json>...   validate recipes and print a one-line summary of each
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validateStructure from '../../src/content/generated/skin-recipe-validator.mjs';

/** @typedef {import('../../src/content/generated/skin-recipe').SkinRecipe} SkinRecipe */
/** @typedef {{ library?: string, png?: string }} ArtRef */
/** @typedef {{ ok: true, recipe: any } | { ok: false, errors: string[] }} RecipeResult */

/** Built-in art, ported from Ariel's Pixel Frame demonstrator in B2. */
export const ART_LIBRARY = Object.freeze([
  'notch', 'rivet-boss', 'square-boss', 'plate-corner', 'gem-boss', 'rosette', 'fleur', 'fleur-diagonal', 'scroll', 'medal', 'rivet', 'corner-rivet',
]);
/** Pixel Frame's workbench grid: PNG art may be at most this many pixels on each side. */
export const PNG_ART_MAX = 20;
const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);

/**
 * Validate a recipe and return it with every default filled in.
 * @param {unknown} json parsed recipe
 * @param {{ dir?: string, file?: string }} [where] the recipe's folder (for PNG art) and a label for messages
 * @returns {RecipeResult}
 */
export function readRecipe(json, { dir, file = 'recipe' } = {}) {
  if (!validateStructure(json)) {
    const first = validateStructure.errors?.[0];
    return { ok: false, errors: [`${file} ${first?.instancePath || '/'}: ${first?.message ?? 'is invalid'}`] };
  }
  const r = /** @type {SkinRecipe} */ (json);
  /** @type {string[]} */
  const errors = [];
  const at = (/** @type {string} */ where, /** @type {string} */ message) => errors.push(`${file} ${where}: ${message}`);

  if ((r.colors.theme === undefined) === (r.colors.base === undefined)) at('/colors', 'needs exactly one of "theme" or "base"');
  for (const key of /** @type {const} */ (['frame', 'accent'])) {
    const ramp = r.colors[key];
    const out = ramp?.findIndex((hex, i) => i > 0 && luminance(hex) < luminance(/** @type {string} */ (ramp[i - 1])));
    if (ramp && out !== undefined && out > 0) at(`/colors/${key}/${out}`, `${ramp[out]} is darker than ${ramp[out - 1]}; list the shades darkest first`);
  }
  if (r.fill.type === 'flat') {
    if (!r.fill.color) at('/fill', 'a flat fill needs "color"');
    for (const key of /** @type {const} */ (['top', 'bottom', 'bandHeight', 'tileHeight'])) if (r.fill[key] !== undefined) at(`/fill/${key}`, 'is only used by a banded fill');
  } else {
    for (const key of /** @type {const} */ (['top', 'bottom', 'bandHeight', 'tileHeight'])) if (r.fill[key] === undefined) at('/fill', `a banded fill needs "${key}"`);
    if (r.fill.color !== undefined) at('/fill/color', 'is only used by a flat fill');
    if (r.fill.bandHeight !== undefined && r.fill.tileHeight !== undefined && r.fill.bandHeight > r.fill.tileHeight) {
      at('/fill', `bandHeight (${r.fill.bandHeight}) is taller than tileHeight (${r.fill.tileHeight})`);
    }
  }
  for (const side of SIDES) {
    if (r.profile.length > r.band[side]) at('/profile', `has ${r.profile.length} steps, thicker than the ${side} band (${r.band[side]})`);
  }
  const dividerBand = r.divider?.band ?? r.band.top, dividerProfile = r.divider?.profile ?? r.profile;
  if (dividerProfile.length > dividerBand) at('/divider', `profile has ${dividerProfile.length} steps, thicker than the divider band (${dividerBand})`);

  /** @param {ArtRef} art @param {string} where */
  const checkArt = (art, where) => {
    if ((art.library === undefined) === (art.png === undefined)) { at(where, 'needs exactly one of "library" or "png"'); return; }
    if (art.library !== undefined) {
      if (!ART_LIBRARY.includes(art.library)) at(`${where}/library`, `unknown art "${art.library}" (known: ${ART_LIBRARY.join(', ')})`);
      return;
    }
    const name = /** @type {string} */ (art.png);
    if (!dir) { at(`${where}/png`, `${name} cannot be checked without the recipe's folder`); return; }
    const full = path.join(dir, name);
    if (!existsSync(full)) { at(`${where}/png`, `${name} does not exist beside the recipe`); return; }
    const size = pngSize(readFileSync(full));
    if (!size) { at(`${where}/png`, `${name} is not a PNG image`); return; }
    if (size.width > PNG_ART_MAX || size.height > PNG_ART_MAX) {
      at(`${where}/png`, `${name} is ${size.width} × ${size.height}; PNG art may be at most ${PNG_ART_MAX} × ${PNG_ART_MAX}`);
    }
  };
  checkArt(r.corner.art, '/corner/art');
  if (r.motif) checkArt(r.motif.art, '/motif/art');
  for (const side of SIDES) { const medallion = r.medallions?.[side]; if (medallion) checkArt(medallion.art, `/medallions/${side}/art`); }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    recipe: {
      ...r,
      corner: { size: 'medium', material: 'as-drawn', ...r.corner },
      ...(r.motif ? { motif: { size: 'medium', material: 'as-drawn', spacing: 'mirrored-end', ...r.motif } } : {}),
      title: { textGap: 4, ...r.title },
      light: { steps: 5, outline: true, shadow: false, ...r.light },
      divider: { band: dividerBand, profile: dividerProfile },
      contentMargin: r.contentMargin ?? 4,
    },
  };
}

/** Relative brightness (Rec. 709 weights) of a #rrggbb colour, for checking ramp order. @param {string} hex */
function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** @param {Buffer} bytes @returns {{ width: number, height: number } | null} */
function pngSize(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const file of process.argv.slice(2)) {
    let json;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { console.error(`${file}: not valid JSON: ${error instanceof Error ? error.message : String(error)}`); failed = true; continue; }
    const result = readRecipe(json, { dir: path.dirname(file), file });
    if (result.ok) {
      const r = result.recipe;
      console.log(`${file}: ok — "${r.name}", band ${r.band.top}/${r.band.right}/${r.band.bottom}/${r.band.left}, profile ${r.profile.join(' ')}, ${r.colors.theme ?? r.colors.base}${r.colors.frame ? ' + frame ramp' : ''}${r.colors.accent ? ' + accent ramp' : ''}, ${r.fill.type} fill`);
    } else { failed = true; for (const error of result.errors) console.error(error); }
  }
  process.exitCode = failed ? 1 : 0;
}
