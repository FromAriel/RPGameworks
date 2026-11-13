/**
 * Skin recipes (decision 0013 B1): a window skin described as settings. This is the Node side of the reader: it
 * checks a recipe's PNG art in its folder and runs the shared reader core (recipe-core.mjs, also used by the skin
 * studio page). The bake core (B2) turns the result into an ordinary v2 window skin.
 *
 * Tool code only: the game never imports anything under tools/skin-bake/.
 *
 *   node tools/skin-bake/recipe.mjs <recipe.json>...   validate recipes and print a one-line summary of each
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngSize, readRecipeWith } from './recipe-core.mjs';

export { ART_LIBRARY, PNG_ART_MAX } from './recipe-core.mjs';
/** @typedef {import('./recipe-core.mjs').RecipeResult} RecipeResult */

/**
 * Validate a recipe and return it with every default filled in.
 * @param {unknown} json parsed recipe
 * @param {{ dir?: string, file?: string }} [where] the recipe's folder (for PNG art) and a label for messages
 * @returns {RecipeResult}
 */
export function readRecipe(json, { dir, file = 'recipe' } = {}) {
  return readRecipeWith(json, {
    file,
    art: dir === undefined ? undefined : (name) => {
      const full = path.join(dir, name);
      if (!existsSync(full)) return 'missing';
      return pngSize(readFileSync(full)) ?? 'not-png';
    },
  });
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
