/**
 * Decision 0011 W3.4: a game's UI theme names its window skins and the default skin for each surface.
 *
 *   readUiTheme(...)  validates the theme, every skin it lists (v2 reader and atlas size) and every skin a map
 *                     message or dialogue names; it throws one precise error, so the content build stops before writing.
 *   emitUiTheme(...)  writes each skin's atlas and normalized v2 manifest under hashed names, plus the generated theme.
 *
 * Skin manifests live under assets/source/ui/ (paths in the theme are relative to it and may not leave it).
 */
import { readFileSync, realpathSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import validateTheme from '../src/content/generated/ui-theme-validator.mjs';
import { readSkinManifest } from '../src/presentation/skin/skin-manifest.mjs';

export const SURFACES = Object.freeze(['dialogue', 'inventory', 'saves', 'settings', 'confirmation', 'battle']);
const MAX_ATLAS_BYTES = 4 * 1024 * 1024;

/** @param {string} parent @param {string} child */
const inside = (parent, child) => { const rel = relative(parent, child); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };

/** Width and height from a PNG's IHDR chunk, or an error naming the file.
 * @param {Buffer} bytes @param {string} label @returns {{ width: number, height: number }} */
export function pngSize(bytes, label) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${label}: not a PNG image`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * @param {{ themeFile: string, themeJson: any, skinRoot: string, maps: Map<string, any>, mapFiles: Map<string, string> }} input
 * @returns {{ theme: any, skins: { id: string, file: string, skin: any, atlas: Buffer }[] }}
 */
export function readUiTheme({ themeFile, themeJson, skinRoot, maps, mapFiles }) {
  if (!validateTheme(themeJson)) {
    const first = validateTheme.errors?.[0];
    throw new Error(`${themeFile} ${first?.instancePath || '/'}: ${first?.message ?? 'is invalid'}`);
  }
  const theme = themeJson;
  const root = realpathSync(skinRoot);
  /** @type {{ id: string, file: string, skin: any, atlas: Buffer }[]} */
  const skins = [];
  /** @type {Set<string>} */
  const ids = new Set();
  theme.skins.forEach((/** @type {{ id: string, manifest: string }} */ entry, /** @type {number} */ index) => {
    const where = `${themeFile} /skins/${index}`;
    if (ids.has(entry.id)) throw new Error(`${where}/id: duplicate skin ${entry.id}`);
    ids.add(entry.id);
    const manifestPath = resolve(root, entry.manifest);
    if (!inside(root, manifestPath)) throw new Error(`${where}/manifest: ${entry.manifest} leaves assets/source/ui/`);
    /** @type {string} */
    let real;
    try { real = realpathSync(manifestPath); } catch { throw new Error(`${where}/manifest: ${entry.manifest} does not exist`); }
    if (!inside(root, real)) throw new Error(`${where}/manifest: ${entry.manifest} leaves assets/source/ui/`);
    if (statSync(real).size > 262144) throw new Error(`${where}/manifest: ${entry.manifest} exceeds the 256 KiB limit`);
    /** @type {unknown} */
    let json;
    try { json = JSON.parse(readFileSync(real, 'utf8')); } catch (error) { throw new Error(`${where}/manifest: ${entry.manifest} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
    const read = readSkinManifest(json);
    if (!read.ok) throw new Error(`${where}/manifest: ${entry.manifest} is not a valid window skin: ${read.errors[0]}`);
    const imagePath = resolve(dirname(real), read.skin.image);
    if (!inside(root, imagePath)) throw new Error(`${where}: ${entry.manifest} names an image outside assets/source/ui/`);
    /** @type {Buffer} */
    let atlas;
    try { atlas = readFileSync(imagePath); } catch { throw new Error(`${where}: atlas ${relative(root, imagePath).split(sep).join('/')} does not exist`); }
    if (atlas.length > MAX_ATLAS_BYTES) throw new Error(`${where}: atlas exceeds ${MAX_ATLAS_BYTES} bytes`);
    const size = pngSize(atlas, `${where} atlas`);
    if (size.width !== read.skin.size.width || size.height !== read.skin.size.height) {
      throw new Error(`${where}: atlas is ${size.width} × ${size.height}, but ${entry.manifest} declares ${read.skin.size.width} × ${read.skin.size.height}`);
    }
    skins.push({ id: entry.id, file: entry.manifest, skin: read.skin, atlas });
  });
  /** @type {Record<string, string>} */
  const chosen = theme.surfaces;
  for (const surface of SURFACES) {
    if (!ids.has(chosen[surface] ?? '')) throw new Error(`${themeFile} /surfaces/${surface}: unknown skin ${chosen[surface]}`);
  }
  checkMapSkins(maps, mapFiles, ids, themeFile);
  return { theme, skins };
}

/** Every skin a map message or dialogue names must be in the theme (or there must be a theme at all).
 * @param {Map<string, any>} maps @param {Map<string, string>} mapFiles @param {Set<string>} ids @param {string | undefined} themeFile */
export function checkMapSkins(maps, mapFiles, ids, themeFile) {
  for (const [mapId, map] of maps) {
    const file = mapFiles.get(mapId) ?? mapId;
    for (const [kind, list] of [['messages', map.messages ?? []], ['dialogues', map.dialogues ?? []]]) {
      list.forEach((/** @type {{ skin?: string }} */ entry, /** @type {number} */ index) => {
        if (entry.skin === undefined) return;
        if (!themeFile) throw new Error(`${file} /${kind}/${index}/skin: ${entry.skin} needs a UI theme, but game.json has no uiThemeFile`);
        if (!ids.has(entry.skin)) throw new Error(`${file} /${kind}/${index}/skin: unknown skin ${entry.skin} (not in ${themeFile})`);
      });
    }
  }
}

/** Write the skins and the generated theme into the staging folder; returns the generated theme's file name.
 * @param {string} staging @param {{ theme: any, skins: { id: string, skin: any, atlas: Buffer }[] }} input @returns {string} */
export function emitUiTheme(staging, { theme, skins }) {
  mkdirSync(join(staging, 'skins'), { recursive: true });
  const hash = (/** @type {string | Buffer} */ data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
  const out = skins.map(({ id, skin, atlas }) => {
    const stem = id.replace(/^[^:]+:skin\./, '').replace(/\./g, '-');
    const atlasFile = `skins/${stem}.${hash(atlas)}.png`;
    writeFileSync(join(staging, atlasFile), atlas);
    const manifestText = `${JSON.stringify({ ...skin, image: atlasFile.slice('skins/'.length) })}\n`;
    const manifestFile = `skins/${stem}.${hash(manifestText)}.json`;
    writeFileSync(join(staging, manifestFile), manifestText);
    return { id, manifest: manifestFile, atlas: atlasFile };
  });
  const text = `${JSON.stringify({ schemaVersion: 1, skins: out, surfaces: theme.surfaces })}\n`;
  const file = `ui-theme.${hash(text)}.json`;
  writeFileSync(join(staging, file), text);
  return file;
}
