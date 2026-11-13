/**
 * Node side of the skin bake (decision 0013 B2, split in B4): reads a recipe's PNG art from its folder, runs the shared
 * bake core and encodes the atlas as PNG. The skin studio page runs the same core with its own art loading and PNG
 * writing. Tool code only; the game never imports it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pngjs from 'pngjs';
import { bakeAtlas } from './bake-core.ts';
import type { FilledRecipe } from './bake-core.ts';
import type { RgbaImage } from './pixel-frame/shade.ts';

export type { FilledRecipe } from './bake-core.ts';
const { PNG } = pngjs;

export interface BakedSkin {
  /** The v2 manifest; `image` names the atlas file it was written for. */
  readonly manifest: Record<string, unknown>;
  readonly png: Buffer;
  readonly atlas: RgbaImage;
}

/** Bake a filled recipe. `dir` is the recipe's folder, for PNG art; `image` names the atlas file in the manifest. */
export function bakeSkin(recipe: FilledRecipe, { dir, image = 'Window.png' }: { dir: string; image?: string }): BakedSkin {
  const { manifest, atlas } = bakeAtlas(recipe, { image, art: (name) => readPng(path.join(dir, name)) });
  const png = new PNG({ width: atlas.width, height: atlas.height });
  png.data = Buffer.from(atlas.data.buffer, atlas.data.byteOffset, atlas.data.byteLength);
  return { manifest, png: PNG.sync.write(png, { colorType: 6 }), atlas };
}

function readPng(file: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
