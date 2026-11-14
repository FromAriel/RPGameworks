// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFacts, readItems, readParty } from '../../src/content/validation.mjs';
import { defaultParty, moveMember, shieldsAt } from '../../src/domain/party';
import { SessionState } from '../../src/domain/session';
import { SessionController } from '../../src/runtime/session-controller';
import { FORMATION_SCREEN, formationScreen } from '../../src/presentation/menu/formation-screen';
import { STATUS_SCREEN, statusScreen } from '../../src/presentation/menu/status-screen';
import { MenuController, ScreenRegistry, createMenuLayer } from '../../src/presentation/menu/screens';

/** Decision 0014 M5.4d-2: the Formation and Status screens on the menu blocks, and the grid block. */
const json = (file: string) => JSON.parse(readFileSync(`content/games/demo/${file}`, 'utf8')) as unknown;
const roster = readParty(json('party.json'));
const members = roster.members.map(m => ({ id: m.id, name: m.name, hp: m.hp, attack: m.attack, defense: m.defense, speed: m.speed, reach: m.reach ?? 'melee' as const }));

function setup() {
  document.body.replaceChildren();
  const sessions = new SessionController(new SessionState({ items: readItems(json('items.json')), facts: readFacts(json('facts.json')), party: roster }));
  const layer = createMenuLayer(document.body, 'Game menu');
  const registry = new ScreenRegistry();
  const party = () => sessions.current.party()!;
  let commits = 0;
  registry.register(FORMATION_SCREEN, context => formationScreen(context, {
    members, party, picture: () => null,
    commit: cells => { commits += 1; return sessions.transact({ actions: [{ type: 'setFormation', cells }] }).kind === 'committed'; },
  }));
  registry.register(STATUS_SCREEN, context => statusScreen(context, { members, party, portrait: () => null }));
  const menu = new MenuController(layer, registry, { holds: () => true }, null, () => undefined);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => layer.surface.querySelector<T>(selector);
  const cell = (lane: number, depth: number) => $<HTMLButtonElement>(`[data-grid-cell][data-lane="${lane}"][data-depth="${depth}"]`)!;
  const key = (code: string, key = code) => (document.activeElement ?? layer.surface).dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
  return { sessions, menu, $, cell, key, commits: () => commits, rows: () => [...layer.surface.querySelectorAll('.menu-list .menu-row')].map(r => r.textContent) };
}

describe('party helpers', () => {
  it('move a member, swapping with whoever stands there, and count shields from either side', () => {
    const start = defaultParty(roster); // Hero 2-1, Archer 2-2, Lancer 3-1, Mage 3-3.
    const swapped = moveMember(start, 'hero', { lane: 2, depth: 2 });
    expect(swapped.cells.hero).toEqual({ lane: 2, depth: 2 });
    expect(swapped.cells.archer).toEqual({ lane: 2, depth: 1 });
    expect(start.cells.hero).toEqual({ lane: 2, depth: 1 }); // The original is untouched.
    expect([shieldsAt(start, 'archer', 'front'), shieldsAt(start, 'mage', 'front'), shieldsAt(start, 'hero', 'rear')]).toEqual([1, 1, 1]);
    expect(shieldsAt(start, 'mage', 'rear')).toBe(0);
  });
});

describe('the Formation screen', () => {
  it('moves a member as a draft and saves the whole layout once, on Done', () => {
    const { sessions, menu, $, cell, rows, commits } = setup();
    menu.push(FORMATION_SCREEN);
    expect(rows()).toEqual(['HeroFront', 'ArcherMiddle', 'LancerFront', 'MageBack', 'Done']);
    expect(cell(3, 3).getAttribute('aria-label')).toBe('Bottom lane, back: Mage, shielded once (20% less damage)');
    expect(cell(3, 3).querySelector('.menu-grid-pips')!.textContent).toBe('◆');
    $<HTMLButtonElement>('.menu-row[data-id="hero"]')!.click();
    expect(cell(2, 1).hasAttribute('data-marked')).toBe(true);
    expect(document.activeElement).toBe(cell(2, 1));
    cell(1, 3).click(); // An empty cell.
    expect(rows()[0]).toBe('HeroBack');
    expect(sessions.current.party()!.cells.hero).toEqual({ lane: 2, depth: 1 }); // Still a draft.
    $<HTMLButtonElement>('.menu-row[data-id="archer"]')!.click();
    cell(1, 3).click(); // Occupied by the Hero: the two swap.
    expect(rows().slice(0, 2)).toEqual(['HeroMiddle', 'ArcherBack']);
    $<HTMLButtonElement>('.menu-row[data-id="done"]')!.click();
    expect(commits()).toBe(1);
    expect(sessions.current.party()!.cells).toMatchObject({ hero: { lane: 2, depth: 2 }, archer: { lane: 1, depth: 3 } });
    expect(menu.open).toBe(false);
  });

  it('arrows move between grid cells and stop at the edges; tapping a member starts moving it', () => {
    const { menu, cell, key } = setup();
    menu.push(FORMATION_SCREEN);
    cell(2, 1).click(); // The Hero: tapping a member on the grid starts moving it.
    expect(document.activeElement).toBe(cell(2, 1));
    key('ArrowLeft'); expect(document.activeElement).toBe(cell(2, 1)); // The front edge.
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight'); expect(document.activeElement).toBe(cell(2, 3));
    key('ArrowUp'); key('ArrowUp'); expect(document.activeElement).toBe(cell(1, 3));
    key('Escape'); // Cancel while moving: back to the list, nothing moved.
    expect(document.activeElement?.getAttribute('data-id')).toBe('hero');
    expect(cell(2, 1).dataset.occupant).toBe('Hero');
    expect(menu.open).toBe(true);
  });

  it('Q/E flips the preview to a back attack', () => {
    const { menu, $, cell, key } = setup();
    menu.push(FORMATION_SCREEN);
    expect($('.menu-formation-grid h2')!.textContent).toBe('Formation · ordinary fight');
    expect(cell(2, 1).querySelector('.menu-grid-pips')!.textContent).toBe('');
    key('KeyE', 'e');
    expect($('.menu-formation-grid h2')!.textContent).toBe('Formation · back attack');
    expect(cell(2, 1).querySelector('.menu-grid-pips')!.textContent).toBe('◆'); // The Archer behind the Hero now shields him.
    expect($('.menu-detail')!.textContent).toContain('In a back attack: shielded once (20% less damage).');
  });

  it('leaving with changes asks first; Keep editing stays and Discard leaves without saving', () => {
    const { sessions, menu, $, cell, key, commits } = setup();
    menu.push(FORMATION_SCREEN);
    key('Escape'); // No changes: leaves at once.
    expect(menu.open).toBe(false);
    menu.push(FORMATION_SCREEN);
    $<HTMLButtonElement>('.menu-row[data-id="mage"]')!.click(); cell(1, 1).click();
    key('Escape');
    const question = $('.menu-formation-confirm')!;
    expect(question.hidden).toBe(false);
    expect($('.menu-formation-grid')!.inert).toBe(true);
    expect(document.activeElement?.textContent).toBe('Keep editing');
    $<HTMLButtonElement>('.menu-formation-confirm .menu-row[data-id="no"]')!.click();
    expect(question.hidden).toBe(true);
    expect(document.activeElement?.getAttribute('data-id')).toBe('done');
    key('Escape');
    $<HTMLButtonElement>('.menu-formation-confirm .menu-row[data-id="yes"]')!.click();
    expect(menu.open).toBe(false);
    expect(commits()).toBe(0);
    expect(sessions.current.party()).toEqual(defaultParty(roster));
  });

  it('opening it again and again adds no session subscribers and leaves one screen', () => {
    const { sessions, menu, $, key } = setup();
    for (let i = 0; i < 5; i += 1) { menu.push(FORMATION_SCREEN); key('Escape'); }
    expect(sessions.subscriberCount).toBe(0);
    menu.push(FORMATION_SCREEN);
    expect(document.querySelectorAll('.menu-formation')).toHaveLength(1);
    expect($('.menu-formation')).not.toBeNull();
  });
});

describe('the Status screen', () => {
  it('shows one member per page, stepped with Q/E', () => {
    const { menu, $, key, rows } = setup();
    menu.push(STATUS_SCREEN);
    expect(rows()).toEqual(['HeroHP 30', 'ArcherHP 22', 'LancerHP 26', 'MageHP 20']);
    expect($('.menu-detail')!.textContent).toContain('HP 30 / 30');
    expect($('.menu-detail')!.textContent).toContain('Melee: front-facing enemies only.');
    key('KeyE', 'e');
    expect($('.menu-detail h3')!.textContent).toBe('Archer');
    expect($('.menu-detail')!.textContent).toContain('Ranged: any enemy.');
    expect($('.menu-detail')!.textContent).toContain('Stands in the middle lane, middle.');
    key('KeyQ', 'q'); key('KeyQ', 'q');
    expect($('.menu-detail h3')!.textContent).toBe('Mage');
  });
});
