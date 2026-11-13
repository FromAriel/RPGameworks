/**
 * Library credits for catalog screens (decision 0016 U2.4). A catalog's `libraryCredits` names art libraries; the
 * content build reads each library's own credit file and adds a category of entries: one about the library (source,
 * licence) and one per artist, so the game's Credits screen cannot drift from the libraries it ships.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Libraries with a credit file, by the id a catalog uses. LPC joins when its art is committed (S1). */
export const LIBRARIES = Object.freeze({
  'stone-soup': { label: 'Stone Soup', credits: 'assets/source/creatures/stone-soup/CREDITS.md', library: 'assets/source/creatures/stone-soup/library.json' },
});

const TITLE = 32, LINE = 400;
const clip = (/** @type {string} */ text, /** @type {number} */ max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
/** Split prose into lines of at most LINE characters, at sentence ends where possible. */
function lines(/** @type {string} */ text) {
  const out = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= LINE) { current = next; continue; }
    if (current) out.push(current);
    current = clip(sentence, LINE);
  }
  if (current) out.push(current);
  return out;
}
/** Markdown to plain text: drop emphasis and inline code marks, keep link text and URLs readable. */
const plain = (/** @type {string} */ text) => text.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

/**
 * Parse a library credit file: its title, its first paragraph, its source links, and the bullet list under
 * "## Artists". Throws when the file lacks an artist list, so a reshaped credit file fails the build loudly.
 * @param {string} markdown
 */
export function parseCredits(markdown) {
  const text = markdown.replace(/\r\n/g, '\n');
  const title = /^# (.+)$/m.exec(text)?.[1]?.trim() ?? '';
  const blocks = text.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const intro = blocks.find(block => !block.startsWith('#') && !block.startsWith('- ')) ?? '';
  const artistsAt = text.search(/^## Artists\s*$/m);
  if (artistsAt < 0) throw new Error('credit file has no "## Artists" section');
  const rest = text.slice(artistsAt).split('\n').slice(1);
  const end = rest.findIndex(line => /^## /.test(line));
  const artists = (end < 0 ? rest : rest.slice(0, end)).filter(line => line.startsWith('- ')).map(line => line.slice(2).trim()).filter(Boolean);
  if (!artists.length) throw new Error('credit file lists no artists');
  const sources = text.slice(0, artistsAt).split('\n').filter(line => /^- https?:\/\//.test(line)).map(line => line.slice(2).trim());
  return { title, intro: plain(intro), sources, artists };
}

/**
 * The category and entries a library adds to a catalog.
 * @param {keyof typeof LIBRARIES} id @param {string} repo
 */
export function libraryCredits(id, repo) {
  const library = LIBRARIES[id];
  if (!library) throw new Error(`Unknown art library "${id}"`);
  const credits = parseCredits(readFileSync(join(repo, library.credits), 'utf8'));
  const licence = JSON.parse(readFileSync(join(repo, library.library), 'utf8')).licence;
  const about = {
    id: `library:${id}.about`, category: id, title: clip(`About the ${library.label} art`, TITLE),
    text: [...lines(credits.intro), ...(licence ? [`Licence: ${licence}.`] : []), ...credits.sources.map(source => `Source: ${source}`)],
  };
  const artists = credits.artists.map((name, index) => ({
    id: `library:${id}.artist-${String(index + 1).padStart(3, '0')}`, category: id, title: clip(name, TITLE),
    // The full name repeats in the text only when the list title had to be shortened.
    text: [...(name.length > TITLE ? [name] : []), `An artist of the ${library.label} art used in this game, as named in the pack's credits.`],
  }));
  return { category: { id, label: library.label }, entries: [about, ...artists] };
}

/**
 * A catalog with its library credits expanded, ready to emit. `libraryCredits` is consumed here.
 * @param {import('../src/content/generated/catalog.js').CatalogDefinition} catalog @param {string} repo
 */
export function expandCatalog(catalog, repo) {
  const { libraryCredits: wanted = [], ...rest } = catalog;
  const added = wanted.map(id => libraryCredits(id, repo));
  return {
    ...rest,
    ...(added.length ? { categories: [...(rest.categories ?? []), ...added.map(a => a.category)] } : {}),
    entries: [...rest.entries, ...added.flatMap(a => a.entries)],
  };
}
