import type Phaser from 'phaser';
import type { GameManifest } from '../content/generated/game';
import type { PartyAtlasTable, PartyMemberArt } from '../content/party-atlas.mjs';
import { fetchContent } from './map-loader';

/**
 * The party's baked LPC art (decision 0019 S1.5d): one atlas image and, per party member, its animations, standing
 * frames and portrait. The frame table and decoded image are fetched once per content build and cached; menus draw
 * portraits straight from the image; a battle adds the image as a texture it owns and removes when it ends, and the map
 * keeps its own texture for the walking hero (S1.5f) for the app's lifetime. If the
 * art cannot load, or a member has none, the member is drawn with its placeholder frame.
 */
export interface PartyArt {
  readonly table: PartyAtlasTable;
  readonly image: HTMLImageElement;
}

const loaded = new Map<string, Promise<PartyArt>>();

/** The game's party art, or null when it has none. A failed load may be retried by the next caller. */
export async function loadPartyArt(base: URL, game: GameManifest, signal: AbortSignal): Promise<PartyArt | null> {
  const file = game.partyArtFile;
  if (!file) return null;
  let pending = loaded.get(file);
  if (!pending) {
    pending = load(base, file);
    loaded.set(file, pending);
    pending.catch(() => loaded.delete(file));
  }
  const art = await pending;
  signal.throwIfAborted();
  return art;
}

/**
 * Add the atlas as a texture with every frame named, if it is not there yet; returns the texture key. Each owner gets
 * its own key, so a battle removing its texture never takes the map hero's.
 */
export function addPartyTexture(textures: Phaser.Textures.TextureManager, art: PartyArt, owner: 'map' | 'battle'): string {
  const key = `party-art:${owner}:${art.table.image}`;
  if (!textures.exists(key)) {
    const texture = textures.addImage(key, art.image);
    if (!texture) throw new Error(`${art.table.image} could not become a texture`);
    for (const [name, r] of Object.entries(art.table.frames)) texture.add(name, 0, r.x, r.y, r.w, r.h);
  }
  return key;
}

/** A member's art, if the table has it. */
export function memberArt(art: PartyArt | null, id: string): PartyMemberArt | null {
  return art?.table.members[id] ?? null;
}

async function load(base: URL, file: string): Promise<PartyArt> {
  const table = readTable(await fetchContent(new URL(`generated/content/${file}`, base), new AbortController().signal), file);
  const image = new Image();
  image.src = new URL(`generated/content/${table.image}`, base).href;
  await image.decode();
  if (image.naturalWidth !== table.size.width || image.naturalHeight !== table.size.height) throw new Error(`${table.image} is not ${table.size.width} × ${table.size.height}`);
  return { table, image };
}

/** Check the frame table's shape: every member's frames exist and lie inside the atlas. */
function readTable(value: unknown, file: string): PartyAtlasTable {
  const table = value as PartyAtlasTable;
  const bad = (why: string): never => { throw new Error(`${file}: ${why}`); };
  if (!table || table.format !== 'rpgameworks.party-atlas' || table.formatVersion !== 1) bad('not a party atlas table');
  if (!/^party-art\.[a-f0-9]{12}\.png$/.test(table.image)) bad('invalid image name');
  for (const [name, r] of Object.entries(table.frames ?? {})) {
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.x + r.w > table.size.width || r.y + r.h > table.size.height) bad(`frame ${name} lies outside the atlas`);
  }
  for (const [id, m] of Object.entries(table.members ?? {})) {
    const names = [m.stand.left, m.stand.right, m.stand.up, m.stand.down, m.portrait, ...[m.walk, m.attack].flatMap(a => [...(a.left ?? []), ...(a.right ?? []), ...(a.up ?? []), ...(a.down ?? [])]), ...(m.hurt.front ?? [])];
    for (const name of names) if (!table.frames[name]) bad(`${id} names a missing frame ${name}`);
    if (!m.walk.left?.length || !m.walk.right?.length || !m.walk.up?.length || !m.walk.down?.length || !m.attack.left?.length || !m.hurt.front?.length) bad(`${id} is missing an animation`);
  }
  return table;
}
