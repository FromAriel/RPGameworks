// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { hubScreen } from '../../src/presentation/menu/hub';
import type { HubOptions } from '../../src/presentation/menu/hub';
import type { ScreenContext } from '../../src/presentation/menu/screens';
import { DEFAULT_MENU } from '../../src/platform/menu-loader';
import { readMenu } from '../../src/content/validation.mjs';
import type { MenuDefinition } from '../../src/content/generated/menu';

/** Decision 0016 U2.1: the hub's rules, independent of the game. */
const menu: MenuDefinition = {
  schemaVersion: 1,
  entries: [
    { id: 'items', label: 'Items', screen: 'builtin:items', help: 'Your things.' },
    { id: 'status', label: 'Status', screen: 'builtin:status', help: 'Strength.' },
    { id: 'secret', label: 'Secret', screen: 'builtin:items', when: { type: 'factEquals', factId: 'demo:fact.x', value: true } },
  ],
  info: ['location', 'play-time', 'money'],
};
function open(options: Partial<HubOptions> & { holds?: boolean } = {}) {
  const chosen: string[] = [];
  const context = { services: { holds: () => options.holds ?? false }, open: () => undefined, back: () => undefined, close: () => undefined } as ScreenContext;
  const screen = hubScreen(context, {
    menu: options.menu ?? menu,
    party: () => [{ id: 'hero', name: 'Hero' }],
    info: options.info ?? (() => ({ location: 'Workshop' })),
    available: options.available ?? (entry => entry.screen === 'builtin:items'),
    choose: entry => chosen.push(entry.id),
  });
  document.body.replaceChildren(screen.element);
  const rows = () => [...screen.element.querySelectorAll<HTMLButtonElement>('.menu-row')];
  return { screen, rows, chosen };
}

describe('the hub (decision 0016 U2.1)', () => {
  it('lists entries in data order, hides one whose unlock condition does not hold, and greys screens that do not exist yet', () => {
    const { rows } = open();
    expect(rows().map(r => r.textContent)).toEqual(['Items', 'Status']);
    expect(rows()[1]!.getAttribute('aria-disabled')).toBe('true');
    expect(rows()[1]!.dataset.help).toBe('Strength. Arrives later.');
    expect(open({ holds: true }).rows().map(r => r.textContent)).toEqual(['Items', 'Status', 'Secret']);
  });
  it('chooses only entries that do something', () => {
    const { rows, chosen } = open();
    rows()[1]!.click(); rows()[0]!.click();
    expect(chosen).toEqual(['items']);
  });
  it('shows only the info slots with a value, sized to them, under the command column', () => {
    const { screen } = open();
    const info = screen.element.querySelector<HTMLElement>('.menu-info-window')!;
    expect(info.textContent).toBe('Location Workshop');
    expect([info.style.left, info.style.top, info.style.height]).toEqual(['432px', '310px', '50px']);
    expect(screen.element.querySelector<HTMLElement>('.menu-commands')!.style.height).toBe('260px');
    const none = open({ info: () => ({}) }).screen;
    expect(none.element.querySelector('.menu-info-window')).toBeNull();
    expect(none.element.querySelector<HTMLElement>('.menu-commands')!.style.height).toBe('310px');
  });
  it('puts the command column on the left when the layout says so', () => {
    const { screen } = open({ menu: { ...menu, layout: 'command-left' } });
    expect(screen.element.querySelector<HTMLElement>('.menu-commands')!.style.left).toBe('0px');
    expect(screen.element.querySelector<HTMLElement>('.menu-party-window')!.style.left).toBe('208px');
  });
  it('the default menu for a game without menu.json is valid menu data', () => {
    expect(readMenu(structuredClone(DEFAULT_MENU))).toEqual(DEFAULT_MENU);
  });
});
