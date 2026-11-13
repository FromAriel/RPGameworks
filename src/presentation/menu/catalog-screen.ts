/**
 * The catalog screen (decision 0016 U2.4): a data-only menu screen. A content file gives the title, optional categories
 * (tabs), and entries with a title and paragraphs; an entry with an unlock condition shows as ??? until it holds. A
 * codex, a bestiary, a glossary or the credits are each a catalog file plus a menu entry, with no code.
 */
import type { CatalogDefinition } from '../../content/generated/catalog';
import type { Condition } from '../../domain/session';
import { createDetail, createHelpLine, createInfo, createList, createTabs, menuWindow, type ListEntry } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';

export const CATALOG_SCREEN = 'builtin:catalog';
/** A menu entry's `catalog`, passed when the screen opens. */
export interface CatalogParams { readonly catalog: string }

const LOCKED = '???';

export function catalogScreen(context: ScreenContext, catalogs: ReadonlyMap<string, CatalogDefinition>, params: CatalogParams | undefined): MenuScreen {
  const catalog = params && catalogs.get(params.catalog);
  if (!catalog) throw new Error(`Unknown catalog "${params?.catalog ?? ''}"`);
  const known = (entry: CatalogDefinition['entries'][number]) => !entry.when || context.services.holds(entry.when as Condition);
  const tabbed = !!catalog.categories?.length;
  const element = document.createElement('div');
  element.className = 'menu-catalog';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const top = tabbed ? menuWindow({ box: { x: 0, y: 50, w: 640, h: 50 }, className: 'menu-catalog-top' }) : null;
  const y = tabbed ? 100 : 50;
  const listWindow = menuWindow({ title: catalog.title, box: { x: 0, y, w: 260, h: 360 - y } });
  const detailWindow = menuWindow({ box: { x: 260, y, w: 380, h: 360 - y }, className: 'menu-catalog-detail' });
  const line = createHelpLine(element, tabbed ? 'Q/E: category.' : '');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);

  const shown = (category: string | undefined) => catalog.entries.filter(entry => !tabbed || entry.category === category);
  const describe = (id: string) => {
    const entry = catalog.entries.find(e => e.id === id);
    if (!entry) { detail.set({ heading: 'Nothing here', lines: ['Nothing in this category yet.'] }); return; }
    detail.set(known(entry) ? { heading: entry.title, lines: entry.text } : { heading: LOCKED, lines: ['Not discovered yet.'] });
  };
  const list = createList({ label: catalog.title, entries: [], onChoose: () => undefined, onFocus: describe });
  const show = (category: string | undefined) => {
    const entries: ListEntry[] = shown(category).map(entry => known(entry)
      ? { id: entry.id, label: entry.title, help: entry.text[0] ?? '' }
      : { id: entry.id, label: LOCKED, enabled: false, help: 'Not discovered yet.' });
    list.setEntries(entries.length ? entries : [{ id: '', label: 'Nothing here', enabled: false, help: 'Nothing in this category yet.' }]);
    list.focus();
    describe(list.focusedId ?? '');
  };
  const tabs = tabbed ? createTabs({ label: 'Categories', tabs: catalog.categories!, onChange: id => show(id) }) : null;
  if (top && tabs) {
    top.body.append(tabs.element);
    // Discovery progress, when the catalog has entries to discover.
    if (catalog.entries.some(entry => entry.when)) {
      const found = catalog.entries.filter(known).length;
      top.body.append(createInfo('Found', `${found} / ${catalog.entries.length}`).element);
    }
  }
  listWindow.body.append(list.element);
  element.append(help.element, ...(top ? [top.element] : []), listWindow.element, detailWindow.element);
  return {
    element,
    focusFirst: () => show(tabs?.selected),
    ...(tabs ? { step: (delta: -1 | 1) => tabs.step(delta) } : {}),
    dispose: () => element.remove(),
  };
}
