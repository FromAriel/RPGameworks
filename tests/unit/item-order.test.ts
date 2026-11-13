import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, categoryOf, itemCategories, nextSort, orderItems } from '../../src/domain/item-order';
import type { CarriedItem } from '../../src/domain/item-order';
import { readItems } from '../../src/content/validation.mjs';

/** Decision 0016 U2.2: item categories and the Items screen's three sorts. */
const demo = () => JSON.parse(readFileSync('content/games/demo/items.json', 'utf8'));
const categories = itemCategories({ strings: { en: {} } });
const items: CarriedItem[] = [
  { id: 'demo:item.b', name: 'bolt', category: 'materials', count: 2 },
  { id: 'demo:item.a', name: 'Apple', category: 'consumables', count: 1 },
  { id: 'demo:item.k', name: 'Key', category: 'key', count: 1 },
  { id: 'demo:item.c', name: 'Cider', category: 'consumables', count: 5 },
  { id: 'demo:item.a2', name: 'apple', category: 'consumables', count: 1 },
];
const ids = (list: CarriedItem[]) => list.map(i => i.id);

describe('item order (decision 0016 U2.2)', () => {
  it('defaults to Consumables, Key Items and Materials, and files an uncategorised item under the first', () => {
    expect(categories).toEqual([{ id: 'consumables', label: 'Consumables' }, { id: 'key', label: 'Key Items' }, { id: 'materials', label: 'Materials' }]);
    expect(categoryOf({}, categories)).toBe('consumables');
    expect(itemCategories({ categories: [{ id: 'gear', labelKey: 'cat.gear' }], strings: { en: { 'cat.gear': 'Gear' } } })).toEqual([{ id: 'gear', label: 'Gear' }]);
  });
  it('sorts by type (category order, then name), by name (case-insensitive), and by quantity (most first); ties end on the ID', () => {
    expect(ids(orderItems(items, ALL_ITEMS, 'type', categories))).toEqual(['demo:item.a', 'demo:item.a2', 'demo:item.c', 'demo:item.k', 'demo:item.b']);
    expect(ids(orderItems(items, ALL_ITEMS, 'name', categories))).toEqual(['demo:item.a', 'demo:item.a2', 'demo:item.b', 'demo:item.c', 'demo:item.k']);
    expect(ids(orderItems(items, ALL_ITEMS, 'quantity', categories))).toEqual(['demo:item.c', 'demo:item.b', 'demo:item.a', 'demo:item.a2', 'demo:item.k']);
  });
  it('filters by tab without changing the input, and cycles the sorts', () => {
    const before = ids(items);
    expect(ids(orderItems(items, 'consumables', 'quantity', categories))).toEqual(['demo:item.c', 'demo:item.a', 'demo:item.a2']);
    expect(orderItems(items, 'gear', 'type', categories)).toEqual([]);
    expect(ids(items)).toEqual(before);
    expect([nextSort('type'), nextSort('name'), nextSort('quantity')]).toEqual(['name', 'quantity', 'type']);
  });
});

describe('item categories in content (decision 0016 Q2)', () => {
  it('accepts the demo, whose items name default categories', () => {
    expect(readItems(demo()).items.map(i => i.category)).toEqual(['key', 'key', 'key', 'key', 'consumables']);
  });
  it('rejects an unknown category, a duplicate category and a missing label string', () => {
    const unknown = demo(); unknown.items[0].category = 'gear';
    expect(() => readItems(unknown)).toThrow('Unknown item category (known: consumables, key, materials)');
    const custom = demo(); custom.categories = [{ id: 'key', labelKey: 'cat.key' }, { id: 'key', labelKey: 'cat.missing' }]; custom.strings.en['cat.key'] = 'Keys';
    custom.items.forEach((item: { category: string }) => { item.category = 'key'; });
    expect(() => readItems(custom)).toThrow(/Duplicate item category[\s\S]*Missing category string/);
    const own = demo(); own.categories = [{ id: 'gear', labelKey: 'cat.gear' }]; own.strings.en['cat.gear'] = 'Gear';
    expect(() => readItems(own)).toThrow('Unknown item category (known: gear)'); // A declared list replaces the defaults.
  });
});
