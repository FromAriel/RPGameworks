/**
 * The Items screen (decision 0016 U2.2): category tabs and a sort bar along the top, the item list on the left and the
 * highlighted item's detail on the right. Browsing only for now (Ariel, U2.2): nothing can be used outside battle until
 * the party has lasting stats (M5.4d), so items with a battle use say so.
 *
 * Q/E or the shoulder buttons change the tab; R, the controller's Burst button or a click changes the sort. The tab and
 * sort are kept in `memory`, which the game holds for the whole play session (not in saves).
 */
import { createDetail, createHelpLine, createList, createTabs, menuWindow } from './blocks';
import type { ListEntry } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';
import { ALL_ITEMS, ITEM_SORTS, nextSort, orderItems } from '../../domain/item-order';
import type { CarriedItem, ItemCategory, ItemSort } from '../../domain/item-order';

export const ITEMS_SCREEN = 'builtin:items';

export interface ItemDetail extends CarriedItem {
  readonly description: string;
  readonly maxStack: number;
  /** One line on what the item is for, such as "Restores 12 HP to one ally in battle." */
  readonly use: string;
}
export interface ItemsMemory { tab: string; sort: ItemSort }
export interface ItemsScreenOptions {
  readonly items: () => readonly ItemDetail[];
  readonly categories: readonly ItemCategory[];
  readonly capacity: () => { readonly used: number; readonly capacity: number };
  readonly memory: ItemsMemory;
}

const SORT_LABELS: Record<ItemSort, { text: string; name: string }> = {
  type: { text: 'Type', name: 'By type' },
  name: { text: 'A-Z', name: 'By name' },
  quantity: { text: 'Qty', name: 'By quantity' },
};
const EMPTY = 'empty';

export function itemsScreen(_context: ScreenContext, options: ItemsScreenOptions): MenuScreen {
  const { memory, categories } = options;
  const element = document.createElement('div');
  element.className = 'menu-items';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const top = menuWindow({ box: { x: 0, y: 50, w: 640, h: 50 }, className: 'menu-items-top' });
  const listWindow = menuWindow({ title: 'Items', box: { x: 0, y: 100, w: 300, h: 260 } });
  const detailWindow = menuWindow({ box: { x: 300, y: 100, w: 340, h: 260 }, className: 'menu-items-detail' });
  const line = createHelpLine(element, 'Q/E: category. R: sort.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);

  const describe = (id: string | null) => {
    const item = options.items().find(i => i.id === id);
    const { used, capacity } = options.capacity();
    const label = categories.find(c => c.id === item?.category)?.label;
    detail.set(item
      ? { heading: item.name, lines: [item.description, `Quantity ${item.count} / ${item.maxStack}`, ...(label ? [`Category: ${label}`] : []), ...(item.use ? [item.use] : []), `Carrying ${used} / ${capacity} stacks`] }
      : { heading: 'Nothing here', lines: [memory.tab === ALL_ITEMS ? 'You are not carrying anything yet.' : 'Nothing in this category yet.', `Carrying ${used} / ${capacity} stacks`] });
  };
  const list = createList({ label: 'Items', entries: [], onChoose: () => undefined, onFocus: id => describe(id === EMPTY ? null : id) });

  const sortGroup = document.createElement('div');
  sortGroup.className = 'menu-sort';
  sortGroup.setAttribute('role', 'group');
  sortGroup.setAttribute('aria-label', 'Sort');
  const sortLabel = document.createElement('span');
  sortLabel.className = 'menu-sort-label'; sortLabel.textContent = 'Sort';
  sortGroup.append(sortLabel);
  const sortButtons = ITEM_SORTS.map(sort => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'menu-sort-button'; button.dataset.sort = sort; button.tabIndex = -1;
    button.textContent = SORT_LABELS[sort].text; button.setAttribute('aria-label', SORT_LABELS[sort].name);
    button.addEventListener('click', () => setSort(sort));
    sortGroup.append(button);
    return button;
  });

  const show = () => {
    for (const b of sortButtons) b.setAttribute('aria-pressed', String(b.dataset.sort === memory.sort));
    const focused = list.focusedId;
    const shown = orderItems(options.items(), memory.tab, memory.sort, categories);
    const entries: ListEntry[] = shown.length
      ? shown.map(item => {
        const full = options.items().find(i => i.id === item.id);
        return { id: item.id, label: item.name, detail: `×${item.count}`, help: full?.use || full?.description || '' };
      })
      : [{ id: EMPTY, label: 'Nothing here', enabled: false, help: 'Nothing in this category yet.' }];
    list.setEntries(entries);
    // Keep the highlighted item when it is still listed; otherwise start at the top.
    list.focus(focused && shown.some(i => i.id === focused) ? focused : undefined);
    describe(list.focusedId === EMPTY ? null : list.focusedId);
  };
  const tabs = createTabs({ label: 'Categories', tabs: [{ id: ALL_ITEMS, label: 'All' }, ...categories], initial: memory.tab, onChange: id => { memory.tab = id; show(); } });
  memory.tab = tabs.selected;
  function setSort(sort: ItemSort): void { if (sort === memory.sort) return; memory.sort = sort; show(); }

  top.body.append(tabs.element, sortGroup);
  listWindow.body.append(list.element);
  element.append(help.element, top.element, listWindow.element, detailWindow.element);
  // R changes the sort from the keyboard (the controller's Burst button reaches `secondary`).
  element.addEventListener('keydown', event => {
    if (event.code !== 'KeyR' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    setSort(nextSort(memory.sort));
  });
  return {
    element,
    focusFirst: () => show(),
    step: delta => tabs.step(delta),
    secondary: () => setSort(nextSort(memory.sort)),
    dispose: () => element.remove(),
  };
}
