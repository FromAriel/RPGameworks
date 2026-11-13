// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCatalog, readMenu } from '../../src/content/validation.mjs';
import { expandCatalog, parseCredits } from '../../tools/library-credits.mjs';
import { CATALOG_SCREEN, catalogScreen } from '../../src/presentation/menu/catalog-screen';
import { MenuController, ScreenRegistry, createMenuLayer, type ScreenContext } from '../../src/presentation/menu/screens';
import { NOTES_SCREEN, registerExampleScreens } from '../fixtures/plugin/notes-screen';

/** Decision 0016 U2.4: data-only catalog screens, library credits, and a code plug-in screen. */
const issues = (run: () => unknown) => {
  try { run(); return []; } catch (error) {
    return ((error as { issues?: { path: string; message: string }[] }).issues ?? [{ path: '', message: String(error) }]).map(i => `${i.path}: ${i.message}`);
  }
};
const known = { facts: new Set(['demo:fact.gallery.plaque-read']), items: new Set<string>(), quests: new Set<string>(), placements: new Set<string>() };

/** A bestiary added with data only: a file and a menu entry, no code. */
const bestiary = {
  schemaVersion: 1, title: 'Bestiary',
  categories: [{ id: 'beasts', label: 'Beasts' }, { id: 'spirits', label: 'Spirits' }],
  entries: [
    { id: 'mygame:beast.wolf', category: 'beasts', title: 'Wolf', text: ['Hunts in packs.'] },
    { id: 'mygame:beast.drake', category: 'beasts', title: 'Drake', text: ['Breathes fire.'], when: { type: 'factEquals', factId: 'demo:fact.gallery.plaque-read', value: true } },
    { id: 'mygame:spirit.wisp', category: 'spirits', title: 'Wisp', text: ['A floating light.'] },
  ],
};

describe('catalog files', () => {
  it('accept a bestiary, and report mistakes with their place', () => {
    expect(issues(() => readCatalog(bestiary, 'bestiary.json', known))).toEqual([]);
    const withEntry = (extra: Record<string, unknown>) => ({ ...bestiary, entries: [...bestiary.entries, { id: 'mygame:beast.bear', category: 'beasts', title: 'Bear', text: ['Big.'], ...extra }] });
    expect(issues(() => readCatalog(withEntry({ id: 'mygame:beast.wolf' }), 'b.json', known))).toEqual(['/entries/3/id: Duplicate entry ID']);
    expect(issues(() => readCatalog(withEntry({ category: 'fish' }), 'b.json', known))).toEqual(['/entries/3/category: Unknown category']);
    expect(issues(() => readCatalog(withEntry({ category: undefined }), 'b.json', known))).toEqual(['/entries/3/category: This catalog has categories: name one']);
    expect(issues(() => readCatalog(withEntry({ when: { type: 'factEquals', factId: 'demo:fact.nope', value: true } }), 'b.json', known))).toEqual(['/entries/3/when/factId: Unknown fact']);
    expect(issues(() => readCatalog({ schemaVersion: 1, title: 'Credits', entries: [], libraryCredits: ['stone-soup'] }, 'c.json')))
      .toEqual(['/libraryCredits: Library credits become their own category: give the catalog categories']);
    expect(issues(() => readCatalog({ ...bestiary, libraryCredits: ['stone-soup', 'stone-soup'] }, 'c.json'))).toEqual(['/libraryCredits/1: Each library may be listed once']);
    expect(issues(() => readCatalog({ ...bestiary, libraryCredits: ['lpc'] }, 'c.json'))[0]).toContain('/libraryCredits/0');
  });

  it('menu entries on builtin:catalog name a catalog the game has', () => {
    const menu = (entry: Record<string, unknown>) => ({ schemaVersion: 1, entries: [{ id: 'bestiary', label: 'Bestiary', screen: 'builtin:catalog', ...entry }] });
    const catalogs = { ...known, catalogs: new Set(['bestiary']) };
    expect(issues(() => readMenu(menu({ catalog: 'bestiary' }), 'menu.json', catalogs))).toEqual([]);
    expect(issues(() => readMenu(menu({}), 'menu.json', catalogs))).toEqual(['/entries/0/catalog: A catalog entry names its catalog']);
    expect(issues(() => readMenu(menu({ catalog: 'codex' }), 'menu.json', catalogs))).toEqual(['/entries/0/catalog: Unknown catalog (game.json catalogs)']);
    expect(issues(() => readMenu(menu({ screen: 'builtin:items', catalog: 'bestiary' }), 'menu.json', catalogs))).toEqual(['/entries/0/catalog: Only builtin:catalog entries name a catalog']);
  });
});

describe('library credits', () => {
  it('come from the library\'s own credit file: about the library, then one entry per artist', () => {
    const credits = parseCredits(readFileSync('assets/source/creatures/stone-soup/CREDITS.md', 'utf8'));
    expect(credits.artists[0]).toBe('Eino Keskitalo (evktalo)');
    expect(credits.artists.length).toBeGreaterThan(40);
    expect(credits.sources).toContain('https://opengameart.org/content/dungeon-crawl-32x32-tiles');
    const written = JSON.parse(readFileSync('content/games/demo/catalogs/credits.json', 'utf8'));
    const expanded = readCatalog(expandCatalog(readCatalog(written, 'credits.json'), '.'), 'credits.json');
    expect(expanded.categories!.map(c => c.label)).toEqual(['RPGameworks', 'Stone Soup']);
    const stoneSoup = expanded.entries.filter(e => e.category === 'stone-soup');
    expect(stoneSoup).toHaveLength(credits.artists.length + 1);
    expect(stoneSoup[0]!.text.join(' ')).toContain('Licence: CC0-1.0.');
    expect(stoneSoup[1]!.title).toBe('Eino Keskitalo (evktalo)');
    expect(stoneSoup.every(e => e.title.length <= 32)).toBe(true); // Long names are clipped in the list, whole in the text.
    expect('libraryCredits' in expanded).toBe(false);
  });
  it('fail loudly when a credit file loses its artist list', () => {
    expect(() => parseCredits('# Some art\n\nNo artists here.')).toThrow('no "## Artists" section');
  });
});

describe('catalog screen and plug-in screens', () => {
  const setup = (holds: boolean) => {
    document.body.replaceChildren();
    const layer = createMenuLayer(document.body, 'Game menu');
    const registry = new ScreenRegistry();
    const catalogs = new Map([['bestiary', readCatalog(bestiary, 'bestiary.json', known)]]);
    registry.register(CATALOG_SCREEN, (context: ScreenContext, params) => catalogScreen(context, catalogs, params as { catalog: string }));
    registerExampleScreens(registry, [{ id: 'first', title: 'First note', text: 'Remember the lens.' }]);
    let closed = 0;
    const menu = new MenuController(layer, registry, { holds: () => holds }, null, () => { closed += 1; });
    const rows = () => [...layer.surface.querySelectorAll<HTMLButtonElement>('.menu-screen:not([hidden]) .menu-row')].map(r => r.textContent);
    return { menu, layer, rows, closed: () => closed };
  };

  it('a data-only bestiary opens with tabs, hides undiscovered entries as ???, and counts what was found', () => {
    const { menu, layer, rows } = setup(false);
    menu.push(CATALOG_SCREEN, { catalog: 'bestiary' });
    expect(rows()).toEqual(['Wolf', '???']);
    expect(layer.surface.querySelector('.menu-catalog-top')!.textContent).toContain('2 / 3');
    expect(layer.surface.querySelector('.menu-window h2')?.textContent).toBe('Bestiary');
    (layer.surface.querySelectorAll<HTMLButtonElement>('.menu-row')[1]!).focus();
    expect(layer.surface.querySelector('.menu-detail')!.textContent).toContain('Not discovered yet.');
    layer.surface.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
    expect(rows()).toEqual(['Wisp']);
  });
  it('a discovered entry shows its title and text', () => {
    const { menu, layer, rows } = setup(true);
    menu.push(CATALOG_SCREEN, { catalog: 'bestiary' });
    expect(rows()).toEqual(['Wolf', 'Drake']);
    (layer.surface.querySelectorAll<HTMLButtonElement>('.menu-row')[1]!).focus();
    expect(layer.surface.querySelector('.menu-detail')!.textContent).toContain('Breathes fire.');
  });
  it('the worked plug-in example registers, opens from its menu entry, and closes the menu', () => {
    expect(issues(() => readMenu({ schemaVersion: 1, entries: [{ id: 'notes', label: 'Notes', screen: NOTES_SCREEN }] }, 'menu.json'))).toEqual([]);
    const { menu, layer, rows, closed } = setup(true);
    menu.push(NOTES_SCREEN);
    expect(menu.topId).toBe(NOTES_SCREEN);
    expect(rows()).toEqual(['First note', 'Done']);
    expect(layer.surface.querySelector('.menu-detail')!.textContent).toContain('Remember the lens.');
    layer.surface.querySelector<HTMLButtonElement>('.menu-row[data-id="done"]')!.click();
    expect(menu.open).toBe(false);
    expect(closed()).toBe(1);
  });
});
