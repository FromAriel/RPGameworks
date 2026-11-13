/**
 * Skin studio (decision 0013 B4): open a recipe, change its settings, and see real W1 windows composed from the bake at
 * 1× and 2×. The bake runs in the page with the same core as `npm run skins` (B4-Q3). Saving downloads recipe.json;
 * the page never writes into the repository. Local authoring tool: never part of the game build (B4-Q4).
 */
import '../../src/presentation/ui/tokens.css';
import '../../src/presentation/skin/windowskin.css';
import './studio.css';
import { ART_LIBRARY, readRecipeWith } from '../skin-bake/recipe-core.mjs';
import { bakeAtlas } from '../skin-bake/bake-core.ts';
import type { FilledRecipe } from '../skin-bake/bake-core.ts';
import type { RgbaImage } from '../skin-bake/pixel-frame/shade.ts';
import { mountWindowskin } from '../../src/presentation/ui/windowskin';
import type { WindowskinHandle } from '../../src/presentation/ui/windowskin';
import { applyFlair, fillColors, parseProfile, parseRamp, recipeText, withBand, withFillColor, withFillType } from './studio-model';
import type { Draft, FillType, Flair } from './studio-model';

const RECIPES = import.meta.glob<Draft>(['../../assets/source/ui/skins/*/recipe.json', '../../tests/fixtures/recipes/**/*.json'], { eager: true, import: 'default' });
const ART = import.meta.glob<string>(['../../assets/source/ui/skins/*/*.png', '../../tests/fixtures/recipes/**/*.png'], { eager: true, query: '?url', import: 'default' });
const DEFAULT_RECIPE = '../../assets/source/ui/skins/white-silver/recipe.json';
const BAKED_ATLAS = 'Window.png';

declare global {
  interface Window { __SKIN_STUDIO__?: { recipe(): Draft; atlasSha: string; bakes: number; errors: readonly string[] } }
}

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Skin studio markup is missing #${id}`);
  return element as T;
};
const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);

const folderOf = (key: string) => key.slice(0, key.lastIndexOf('/'));
const label = (key: string) => key.replace('../../assets/source/ui/', '').replace('../../tests/fixtures/', 'example ').replace(/\/recipe\.json$/, '').replace(/\.json$/, '');
const artCache = new Map<string, RgbaImage>();

let recipeKey = RECIPES[DEFAULT_RECIPE] ? DEFAULT_RECIPE : Object.keys(RECIPES)[0]!;
let original: Draft = structuredClone(RECIPES[recipeKey]!);
let draft: Draft = structuredClone(original);
let errors: string[] = [];
let handle: WindowskinHandle | null = null;
let atlasUrl: string | null = null;
let bakes = 0, atlasSha = '', timer: ReturnType<typeof setTimeout> | null = null, generation = 0;

/** Decode a PNG to exact RGBA (no premultiplying, no colour management), as pngjs does in Node. */
async function decode(url: string): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('No 2D canvas');
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data };
}

/** The PNG art beside the open recipe (never its own baked atlas). */
const folderArt = () => Object.keys(ART).filter((key) => folderOf(key) === folderOf(recipeKey) && !key.endsWith(`/${BAKED_ATLAS}`));
async function loadFolderArt(): Promise<void> {
  await Promise.all(folderArt().filter((key) => !artCache.has(key)).map(async (key) => { artCache.set(key, await decode(ART[key]!)); }));
}

function buildPickers(): void {
  const pick = select('recipe-pick');
  pick.replaceChildren(...Object.keys(RECIPES).sort().map((key) => new Option(label(key), key, false, key === recipeKey)));
  const corner = select('corner-art');
  const pngs = folderArt().map((key) => key.slice(key.lastIndexOf('/') + 1));
  corner.replaceChildren(...ART_LIBRARY.map((name) => new Option(name, `library:${name}`)), ...pngs.map((name) => new Option(`${name} (beside the recipe)`, `png:${name}`)));
}

/** Show the draft in the controls. */
function sync(): void {
  input('name').value = draft.name;
  input('band').value = String(draft.band.top); $('band-value').textContent = `${draft.band.top} px`;
  input('profile').value = draft.profile.join(' ');
  input('title-width').value = String(draft.title.fillWidth);
  input('outline').checked = draft.light.outline ?? true;
  input('shadow').checked = draft.light.shadow ?? false;
  input('content-margin').value = String(draft.contentMargin ?? 4);
  const art = draft.corner.art;
  select('corner-art').value = art.library ? `library:${art.library}` : `png:${art.png}`;
  select('corner-size').value = draft.corner.size ?? 'medium';
  select('corner-material').value = draft.corner.material ?? 'as-drawn';
  select('theme').value = draft.colors.theme ?? 'base';
  input('base').value = draft.colors.base ?? '#4a7bd0';
  input('base').disabled = draft.colors.theme !== undefined;
  input('frame-ramp').value = (draft.colors.frame ?? []).join(' ');
  input('accent-ramp').value = (draft.colors.accent ?? []).join(' ');
  const fill = draft.fill, colours = fillColors(draft);
  select('fill-type').value = fill.type;
  for (const row of document.querySelectorAll<HTMLElement>('[data-fill]')) row.hidden = !(row.dataset.fill ?? '').split(' ').includes(fill.type);
  input('fill').value = colours.from;
  input('fill-from').value = colours.from;
  input('fill-to').value = colours.to;
  input('fill-steps').value = String(fill.steps ?? 16); $('fill-steps-value').textContent = String(fill.steps ?? 16);
  select('fill-direction').value = fill.direction ?? 'down';
  input('azimuth').value = String(draft.light.azimuth); $('azimuth-value').textContent = `${draft.light.azimuth}°`;
  input('elevation').value = String(draft.light.elevation); $('elevation-value').textContent = `${draft.light.elevation}°`;
  input('steps').value = String(draft.light.steps ?? 5);
  input('wear').value = String(draft.light.wear ?? 0); $('wear-value').textContent = (draft.light.wear ?? 0).toFixed(2);
  input('tarnish').checked = draft.light.tarnish ?? true;
}

/** Change the draft, then re-bake shortly after the last change. */
function edit(change: (next: Draft) => Draft | void, problem?: string): void {
  if (problem) { errors = [problem]; showErrors(); return; }
  const next = structuredClone(draft);
  draft = change(next) ?? next;
  sync();
  schedule();
}
function schedule(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void bake(); }, 120);
}

function showErrors(): void {
  $('studio-errors').replaceChildren(...errors.map((text) => Object.assign(document.createElement('li'), { textContent: text })));
  $<HTMLButtonElement>('save').disabled = errors.length > 0;
  if (window.__SKIN_STUDIO__) window.__SKIN_STUDIO__.errors = errors;
  document.body.dataset.studioErrors = String(errors.length);
}

async function sha256(data: Uint8ClampedArray): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function bake(): Promise<void> {
  const run = ++generation;
  await loadFolderArt();
  const artKey = (name: string) => `${folderOf(recipeKey)}/${name}`;
  const read = readRecipeWith(draft, { file: 'recipe', art: (name) => { const image = artCache.get(artKey(name)); return image ? { width: image.width, height: image.height } : 'missing'; } });
  if (!read.ok) { errors = read.errors; showErrors(); return; }
  const started = performance.now();
  let baked: ReturnType<typeof bakeAtlas>;
  try {
    baked = bakeAtlas(read.recipe as FilledRecipe, { image: BAKED_ATLAS, art: (name) => artCache.get(artKey(name))! });
  } catch (cause) { errors = [cause instanceof Error ? cause.message : String(cause)]; showErrors(); return; }
  const ms = performance.now() - started;
  const { atlas, manifest } = baked;
  const canvas = new OffscreenCanvas(atlas.width, atlas.height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(atlas.data), atlas.width, atlas.height), 0, 0);
  const url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
  const sha = await sha256(atlas.data);
  if (run !== generation) { URL.revokeObjectURL(url); return; } // A newer edit is already baking.
  errors = []; showErrors();
  handle?.dispose();
  if (atlasUrl) URL.revokeObjectURL(atlasUrl);
  atlasUrl = url;
  handle = mountWindowskin($('preview'), { atlasUrl: url, manifest });
  bakes += 1; atlasSha = sha;
  Object.assign(document.body.dataset, { bakes: String(bakes), atlasSha: sha });
  if (window.__SKIN_STUDIO__) Object.assign(window.__SKIN_STUDIO__, { bakes, atlasSha: sha });
  $('studio-status').textContent = `Baked “${draft.name}” in ${Math.round(ms)} ms: atlas ${atlas.width} × ${atlas.height}.`;
}

async function open(key: string): Promise<void> {
  recipeKey = key;
  original = structuredClone(RECIPES[key]!);
  draft = structuredClone(original);
  select('flair').value = 'full';
  await loadFolderArt();
  buildPickers();
  sync();
  await bake();
}

function save(): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([recipeText(draft)], { type: 'application/json' }));
  link.download = 'recipe.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  $('studio-status').textContent = 'Saved recipe.json. Put it in assets/source/ui/skins/<name>/ (with its PNG art) and run npm run skins.';
}

const number = (id: string) => Number(input(id).value);
function bind(): void {
  select('recipe-pick').addEventListener('change', () => { void open(select('recipe-pick').value); });
  input('name').addEventListener('input', () => edit((d) => { d.name = input('name').value; }));
  input('band').addEventListener('input', () => edit((d) => withBand(d, number('band'))));
  input('profile').addEventListener('change', () => {
    const profile = parseProfile(input('profile').value);
    edit((d) => { if (profile) d.profile = profile; }, profile ? undefined : 'Bevel: type heights 0–9 separated by spaces, for example "3 2".');
  });
  input('title-width').addEventListener('change', () => edit((d) => { const w = number('title-width'); d.title = { ...d.title, openWidth: w, fillWidth: w, closeWidth: w }; }));
  input('outline').addEventListener('change', () => edit((d) => { d.light.outline = input('outline').checked; }));
  input('shadow').addEventListener('change', () => edit((d) => { d.light.shadow = input('shadow').checked; }));
  input('content-margin').addEventListener('change', () => edit((d) => { d.contentMargin = number('content-margin'); }));
  select('flair').addEventListener('change', () => edit((d) => applyFlair(d, original, select('flair').value as Flair)));
  select('corner-art').addEventListener('change', () => edit((d) => {
    const [kind, name] = select('corner-art').value.split(/:(.*)/) as [string, string];
    d.corner = { ...d.corner, art: kind === 'png' ? { png: name } : { library: name } };
  }));
  select('corner-size').addEventListener('change', () => edit((d) => { d.corner.size = select('corner-size').value as 'small' | 'medium' | 'large'; }));
  select('corner-material').addEventListener('change', () => edit((d) => { d.corner.material = select('corner-material').value as 'as-drawn' | 'accent'; }));
  select('theme').addEventListener('change', () => edit((d) => {
    const theme = select('theme').value;
    if (theme === 'base') { delete d.colors.theme; d.colors.base = input('base').value; } else { delete d.colors.base; d.colors.theme = theme as 'iron' | 'brass' | 'silver' | 'obsidian'; }
  }));
  input('base').addEventListener('input', () => edit((d) => { d.colors.base = input('base').value; }));
  for (const key of ['frame', 'accent'] as const) {
    input(`${key}-ramp`).addEventListener('change', () => {
      const ramp = parseRamp(input(`${key}-ramp`).value);
      edit((d) => { if (ramp === undefined) delete d.colors[key]; else if (ramp) d.colors[key] = ramp; },
        ramp === null ? `${key === 'frame' ? 'Frame' : 'Accent'} colours: type #rrggbb colours separated by spaces, darkest first.` : undefined);
    });
  }
  select('fill-type').addEventListener('change', () => edit((d) => withFillType(d, select('fill-type').value as FillType)));
  input('fill').addEventListener('input', () => edit((d) => withFillColor(d, 'from', input('fill').value)));
  input('fill-from').addEventListener('input', () => edit((d) => withFillColor(d, 'from', input('fill-from').value)));
  input('fill-to').addEventListener('input', () => edit((d) => withFillColor(d, 'to', input('fill-to').value)));
  input('fill-steps').addEventListener('input', () => edit((d) => { if (d.fill.type === 'gradient') d.fill.steps = number('fill-steps'); }));
  select('fill-direction').addEventListener('change', () => edit((d) => { if (d.fill.type === 'gradient') d.fill.direction = select('fill-direction').value as 'down' | 'up' | 'right' | 'left'; }));
  input('azimuth').addEventListener('input', () => edit((d) => { d.light.azimuth = number('azimuth'); }));
  input('elevation').addEventListener('input', () => edit((d) => { d.light.elevation = number('elevation'); }));
  input('steps').addEventListener('change', () => edit((d) => { d.light.steps = number('steps'); }));
  input('wear').addEventListener('input', () => edit((d) => { const wear = number('wear'); if (wear) d.light.wear = wear; else delete d.light.wear; }));
  input('tarnish').addEventListener('change', () => edit((d) => { if (input('tarnish').checked) delete d.light.tarnish; else d.light.tarnish = false; }));
  $('save').addEventListener('click', save);
  $('reset').addEventListener('click', () => { void open(recipeKey); });
}

const windows = $<HTMLTemplateElement>('windows');
for (const grid of document.querySelectorAll('.preview-grid')) grid.append(windows.content.cloneNode(true));
window.__SKIN_STUDIO__ = { recipe: () => structuredClone(draft), atlasSha, bakes, errors };
bind();
void open(recipeKey);
