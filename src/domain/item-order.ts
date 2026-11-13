/**
 * How the Items screen groups and orders what the party carries (decision 0016 U2.2). Pure: no DOM, no session.
 *
 * Categories come from the item catalog (or the default three). An item without a category belongs to the first one.
 * Sorting is stable and total: every order ends on the item ID, so equal names or counts never shuffle between opens.
 */
import { DEFAULT_ITEM_CATEGORIES } from '../content/validation.mjs';
import type { ItemCatalog } from '../content/generated/items';

export type ItemSort = 'type' | 'name' | 'quantity';
export const ITEM_SORTS: readonly ItemSort[] = ['type', 'name', 'quantity'];
export const ALL_ITEMS = 'all';

export interface ItemCategory { readonly id: string; readonly label: string }
export interface CarriedItem { readonly id: string; readonly name: string; readonly category: string; readonly count: number }

export function itemCategories(catalog: Pick<ItemCatalog, 'categories' | 'strings'>): ItemCategory[] {
  return catalog.categories
    ? catalog.categories.map(c => ({ id: c.id, label: catalog.strings.en[c.labelKey] ?? c.id }))
    : DEFAULT_ITEM_CATEGORIES.map(c => ({ id: c.id, label: c.label }));
}

/** The item's category, or the first category when it has none. */
export function categoryOf(item: { readonly category?: string }, categories: readonly ItemCategory[]): string {
  return item.category ?? categories[0]?.id ?? '';
}

const byName = (a: CarriedItem, b: CarriedItem) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The items shown under a tab (`all` or a category ID), in the chosen order. */
export function orderItems(items: readonly CarriedItem[], tab: string, sort: ItemSort, categories: readonly ItemCategory[]): CarriedItem[] {
  const rank = new Map(categories.map((c, i) => [c.id, i]));
  const shown = tab === ALL_ITEMS ? [...items] : items.filter(item => item.category === tab);
  const compare = sort === 'name' ? byName
    : sort === 'quantity' ? (a: CarriedItem, b: CarriedItem) => b.count - a.count || byName(a, b)
      : (a: CarriedItem, b: CarriedItem) => (rank.get(a.category) ?? rank.size) - (rank.get(b.category) ?? rank.size) || byName(a, b);
  return shown.sort(compare);
}

/** The next sort in the cycle (R or the controller's Burst button on the Items screen). */
export function nextSort(sort: ItemSort): ItemSort {
  return ITEM_SORTS[(ITEM_SORTS.indexOf(sort) + 1) % ITEM_SORTS.length]!;
}
