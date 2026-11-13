import type Phaser from 'phaser';
import type { GameManifest } from '../content/generated/game';
import type { CreatureAtlasTable, CreatureFrames } from '../content/creature-atlas.mjs';
import { fetchContent } from './map-loader';

/**
 * Baked Stone Soup creature art for battles (decision 0015 C3): one atlas texture and, per creature and facing, its
 * frame names and loop timings. The frame table and decoded image are fetched once per content build and cached; the
 * texture belongs to the battle that uses it and is removed when that battle ends (BattleView.destroy), so a battle
 * leaves no texture behind. If the art cannot load, battles fall back to each enemy's frame.
 */
export interface CreatureArt {
  readonly texture: string;
  /** Keyed by `creatureKey(id, faces)`. */
  readonly creatures: ReadonlyMap<string, CreatureFrames>;
}

interface Source { readonly table: CreatureAtlasTable; readonly image: HTMLImageElement }
const loaded = new Map<string, Promise<Source>>();

export async function loadCreatureArt(textures: Phaser.Textures.TextureManager, base: URL, game: GameManifest, signal: AbortSignal): Promise<CreatureArt | null> {
  const file = game.creaturesFile;
  if (!file) return null;
  let pending = loaded.get(file);
  if (!pending) {
    pending = load(base, file);
    loaded.set(file, pending);
    pending.catch(() => loaded.delete(file)); // A failed load may be retried by the next battle.
  }
  const { table, image } = await pending;
  signal.throwIfAborted();
  const key = `creatures:${file}`;
  if (!textures.exists(key)) {
    const texture = textures.addImage(key, image);
    if (!texture) throw new Error(`${table.image} could not become a texture`);
    for (const [name, r] of Object.entries(table.frames)) texture.add(name, 0, r.x, r.y, r.w, r.h);
  }
  return { texture: key, creatures: new Map(Object.entries(table.creatures)) };
}

async function load(base: URL, file: string): Promise<Source> {
  const table = readTable(await fetchContent(new URL(`generated/content/${file}`, base), new AbortController().signal), file);
  const image = new Image();
  image.src = new URL(`generated/content/${table.image}`, base).href;
  await image.decode();
  if (image.naturalWidth !== table.size.width || image.naturalHeight !== table.size.height) throw new Error(`${table.image} is not ${table.size.width} × ${table.size.height}`);
  return { table, image };
}

/** Check the frame table's shape: every creature's frames exist and lie inside the atlas. */
function readTable(value: unknown, file: string): CreatureAtlasTable {
  const table = value as CreatureAtlasTable;
  const bad = (why: string): never => { throw new Error(`${file}: ${why}`); };
  if (!table || table.format !== 'rpgameworks.creature-atlas' || table.formatVersion !== 1) bad('not a creature atlas table');
  if (!/^creatures\.[a-f0-9]{12}\.png$/.test(table.image)) bad('invalid image name');
  for (const [name, r] of Object.entries(table.frames ?? {})) {
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.x + r.w > table.size.width || r.y + r.h > table.size.height) bad(`frame ${name} lies outside the atlas`);
  }
  for (const [key, c] of Object.entries(table.creatures ?? {})) {
    for (const name of [c.still, c.flash, ...c.walk, ...c.idle]) if (!table.frames[name]) bad(`${key} names a missing frame ${name}`);
    if (!c.idle.length || !(c.idleMs > 0) || !(c.walkMs > 0)) bad(`${key} has no idle loop`);
  }
  return table;
}
