import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCREEN_ID, ScreenRegistry } from '../../src/presentation/menu/screens';
import type { MenuScreen, ScreenContext } from '../../src/presentation/menu/screens';
import { BUILTIN_MENU_SCREENS, readMenu } from '../../src/content/validation.mjs';

/** Decision 0016 U2.0: the screen registry contract and the menu.json format. */
const context = {} as ScreenContext;
const screen = (): MenuScreen => ({ element: {} as HTMLElement, focusFirst: () => undefined, dispose: () => undefined });

describe('menu screen registry (decision 0016 U2.0)', () => {
  it('registers screens by namespaced ID, refuses duplicates and bad IDs, and creates them with their parameters', () => {
    const registry = new ScreenRegistry();
    let seen: unknown;
    registry.register('builtin:items', (_ctx, params) => { seen = params; return screen(); });
    registry.register('mygame:crafting', () => screen());
    expect(registry.ids).toEqual(['builtin:items', 'mygame:crafting']);
    expect(registry.has('mygame:crafting')).toBe(true);
    registry.create('builtin:items', context, { tab: 'key' });
    expect(seen).toEqual({ tab: 'key' });
    expect(() => registry.register('builtin:items', () => screen())).toThrow('Menu screen "builtin:items" is already registered');
    expect(() => registry.register('Crafting', () => screen())).toThrow('Invalid menu screen ID "Crafting"');
    expect(() => registry.create('builtin:nope', context, undefined)).toThrow('Unknown menu screen "builtin:nope"');
    expect(SCREEN_ID.test('mygame:screen.bestiary-2')).toBe(true);
  });
});

describe('menu.json (decision 0016 U2.0)', () => {
  const demo = JSON.parse(readFileSync('content/games/demo/menu.json', 'utf8')) as { entries: Record<string, unknown>[] };
  const known = { facts: new Set(['demo:fact.gallery.plaque-read']), items: new Set(['demo:item.tonic']), quests: new Set<string>(), placements: new Set<string>() };
  const errors = (value: unknown) => {
    try { readMenu(value, 'menu.json', known); return []; } catch (error) {
      return ((error as { issues?: { path: string; message: string }[] }).issues ?? [{ path: '', message: String(error) }]).map(i => `${i.path}: ${i.message}`);
    }
  };

  it('accepts the demo menu: nine entries on built-in screens, three info slots', () => {
    const menu = readMenu(demo, 'menu.json', known);
    expect(menu.entries.map(e => e.label)).toEqual(['Items', 'Status', 'Formation', 'Journal', 'Codex', 'Config', 'Help', 'Credits', 'Save']);
    expect(menu.entries.every(e => BUILTIN_MENU_SCREENS.includes(e.screen.split(':')[1]!))).toBe(true);
    expect(menu.info).toEqual(['location', 'play-time', 'money']);
  });

  it('accepts a game’s own screens and unlock conditions, and reports mistakes with their place', () => {
    const entry = (extra: Record<string, unknown>) => ({ id: 'crafting', label: 'Crafting', screen: 'mygame:crafting', ...extra });
    expect(errors({ schemaVersion: 1, entries: [entry({ when: { type: 'factEquals', factId: 'demo:fact.gallery.plaque-read', value: true } })] })).toEqual([]);
    expect(errors({ schemaVersion: 1, entries: [entry({}), entry({})] })).toEqual(['/entries/1/id: Duplicate menu entry ID']);
    expect(errors({ schemaVersion: 1, entries: [entry({ screen: 'builtin:crafting' })] })[0]).toContain('/entries/0/screen: Unknown built-in screen');
    expect(errors({ schemaVersion: 1, entries: [entry({ when: { type: 'factEquals', factId: 'demo:fact.nope', value: true } })] })).toEqual(['/entries/0/when/factId: Unknown fact']);
    expect(errors({ schemaVersion: 1, entries: [entry({ when: { type: 'not', condition: { type: 'itemAtLeast', itemId: 'demo:item.nope', quantity: 1 } } })] }))
      .toEqual(['/entries/0/when/condition/itemId: Unknown item']);
    expect(errors({ schemaVersion: 1, entries: [entry({})], info: ['location', 'location'] })).toEqual(['/info/1: Each info window may appear once']);
    expect(errors({ schemaVersion: 1, entries: [entry({ label: 'A label far too long for it' })] })[0]).toContain('/entries/0/label');
    expect(errors({ schemaVersion: 1, entries: [] })[0]).toContain('/entries');
  });
});
