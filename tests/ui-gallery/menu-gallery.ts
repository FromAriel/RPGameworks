/**
 * Test-only menu showcase (decision 0016 U2.0): the shared menu blocks composed like the hub at 1× and 2×, and a real
 * MenuController with two gallery screens (a hub and an items-style screen with tabs, list, detail and a party picker)
 * so browser tests can drive the screen stack, Cancel, tabs and pickers. Not the game's menu: U2.1 builds that.
 */
import { createDetail, createHelpLine, createInfo, createList, createPartyCards, createTabs, menuWindow } from '../../src/presentation/menu/blocks';
import type { PartyMember } from '../../src/presentation/menu/blocks';
import { MenuController, ScreenRegistry, createMenuLayer } from '../../src/presentation/menu/screens';
import type { MenuScreen, ScreenContext } from '../../src/presentation/menu/screens';
import type { WindowskinHandle } from '../../src/presentation/ui/windowskin';
import type { PadInput } from '../../src/platform/gamepad-model';

function portrait(color: string, letter: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 40; canvas.height = 40;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#18243a'; g.fillRect(0, 0, 40, 40);
  g.fillStyle = color; g.fillRect(8, 6, 24, 28);
  g.fillStyle = '#0b111b'; g.font = '16px "UNSCII 16"'; g.fillText(letter, 16, 26);
  return canvas;
}
const party = (): PartyMember[] => [
  { id: 'hero', name: 'Hero', level: 3, hp: 29, maxHp: 30, mp: 8, maxMp: 10, portrait: portrait('#518d98', 'H') },
  { id: 'archer', name: 'Archer', level: 3, hp: 22, maxHp: 22, mp: 4, maxMp: 6, portrait: portrait('#62747c', 'A') },
  { id: 'lancer', name: 'Lancer', level: 2, hp: 6, maxHp: 26, mp: 0, maxMp: 4, portrait: portrait('#b88755', 'L') },
  { id: 'mage', name: 'Mage', level: 2, hp: 20, maxHp: 20, mp: 14, maxMp: 16, portrait: portrait('#8e6279', 'M') },
];
const COMMANDS = [
  { id: 'items', label: 'Items', help: 'Use and inspect what you carry.' },
  { id: 'status', label: 'Status', help: 'Each member’s strength and condition.', enabled: false },
  { id: 'formation', label: 'Formation', help: 'Arrange the party on the battle grid.', enabled: false },
  { id: 'journal', label: 'Journal', help: 'Your quests.' },
  { id: 'config', label: 'Config', help: 'Effects, controls and display.' },
  { id: 'save', label: 'Save', help: 'Save or load your progress.' },
];

/** The hub composition: help line, party cards, command column and info windows. */
function hubScreen(context: ScreenContext | null): MenuScreen {
  const element = document.createElement('div');
  element.className = 'gallery-hub';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const partyWindow = menuWindow({ box: { x: 0, y: 50, w: 432, h: 310 } });
  const commands = menuWindow({ title: 'Menu', box: { x: 432, y: 50, w: 208, h: 200 } });
  const info = menuWindow({ box: { x: 432, y: 250, w: 208, h: 110 }, className: 'menu-info-window' });
  const line = createHelpLine(element, 'Choose a command.');
  help.body.append(line.element);
  partyWindow.body.append(createPartyCards({ members: party() }).element);
  const list = createList({ label: 'Menu', entries: COMMANDS, onChoose: id => { if (id === 'items') context?.open('gallery:items'); } });
  commands.body.append(list.element);
  info.body.append(createInfo('Location', 'Workshop').element, createInfo('Time', '0:42:10').element, createInfo('Gold', '120 G').element);
  element.append(help.element, partyWindow.element, commands.element, info.element);
  return { element, focusFirst: () => list.focus(), dispose: () => element.remove() };
}

const ITEMS: Record<string, { id: string; label: string; detail: string; help: string; text: string }[]> = {
  consumables: [
    { id: 'tonic', label: 'Workshop tonic', detail: '2', help: 'Restores 12 HP.', text: 'A bitter tonic brewed in the Workshop. Restores 12 HP.' },
    { id: 'ether', label: 'Ether', detail: '1', help: 'Restores 10 MP.', text: 'A faintly glowing vial. Restores 10 MP.' },
  ],
  key: [{ id: 'brass-key', label: 'Brass key', detail: '', help: 'Opens the storeroom.', text: 'A heavy brass key with a sigil on its bow.' }],
  materials: [{ id: 'shard', label: 'Sigil shard', detail: '3', help: 'A crafting material.', text: 'A splinter of a practice sigil. Still warm.' }],
};

/** An items-style screen: tabs, a list, a detail window, and a party picker for "use on whom?". */
function itemsScreen(context: ScreenContext | null): MenuScreen {
  const element = document.createElement('div');
  element.className = 'gallery-items';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const tabsWindow = menuWindow({ box: { x: 0, y: 50, w: 640, h: 50 } });
  const listWindow = menuWindow({ title: 'Items', box: { x: 0, y: 100, w: 300, h: 260 } });
  const detailWindow = menuWindow({ box: { x: 300, y: 100, w: 340, h: 260 } });
  const line = createHelpLine(element, 'Q and E change the category.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  let picker: HTMLElement | null = null;
  const show = (tab: string) => {
    list.setEntries(ITEMS[tab]!.map(i => ({ id: i.id, label: i.label, detail: i.detail, help: i.help, enabled: tab === 'consumables' })));
    list.focus();
  };
  const list = createList({
    label: 'Items',
    entries: [],
    onFocus: id => { const item = Object.values(ITEMS).flat().find(i => i.id === id); detail.set(item ? { heading: item.label, lines: [item.text] } : null); },
    onChoose: id => {
      // "Use on whom?": the party picker replaces the detail window until a member is chosen or Cancel.
      const cards = createPartyCards({ members: party(), label: 'Use on whom?', onChoose: member => { closePicker(); detail.set({ heading: 'Used', lines: [`Used ${id} on ${member}.`] }); } });
      picker = cards.element;
      detailWindow.body.replaceChildren(picker);
      cards.focus();
    },
  });
  const closePicker = () => { if (!picker) return; picker = null; detailWindow.body.replaceChildren(detail.element); list.focus(); };
  const tabs = createTabs({ label: 'Categories', tabs: [{ id: 'consumables', label: 'Consumables' }, { id: 'key', label: 'Key Items' }, { id: 'materials', label: 'Materials' }], onChange: show });
  tabsWindow.body.append(tabs.element);
  listWindow.body.append(list.element);
  element.append(help.element, tabsWindow.element, listWindow.element, detailWindow.element);
  show(tabs.selected);
  return {
    element,
    focusFirst: () => list.focus(),
    step: delta => { if (!picker) tabs.step(delta); },
    cancel: () => { if (!picker) return false; closePicker(); return true; },
    dispose: () => { element.remove(); void context; },
  };
}

/** The static showcase: the hub composition at 1× and 2×. Built before the gallery mounts its window skins. */
export function buildMenuShowcase(root: HTMLElement): void {
  for (const scale of [1, 2]) {
    const frame = document.createElement('div');
    frame.className = 'gallery-menu-frame';
    frame.dataset.scale = String(scale);
    frame.style.setProperty('--game-scale', String(scale));
    frame.style.setProperty('--game-left', '0px');
    frame.style.setProperty('--game-top', '0px');
    Object.assign(frame.style, { position: 'relative', width: `${640 * scale}px`, height: `${360 * scale}px`, overflow: 'hidden' });
    const surface = document.createElement('div');
    surface.className = 'menu-surface';
    surface.append(hubScreen(null).element);
    frame.append(surface);
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    const label = document.createElement('h3');
    label.textContent = `Menu blocks at ${scale}×`;
    scroller.append(label, frame);
    root.append(scroller);
  }
}

export interface GalleryMenu { open(): void; sample(pad: Readonly<PadInput>): void; state(): { open: boolean; top: string | null; focused: string | null; help: string } ; dispose(): void }

/** A real menu over the page: the controller, the registry and two gallery screens. */
export function createGalleryMenu(windowskin: () => WindowskinHandle | null, onClose: () => void): GalleryMenu {
  const registry = new ScreenRegistry();
  registry.register('gallery:hub', context => hubScreen(context));
  registry.register('gallery:items', context => itemsScreen(context));
  let controller: MenuController | null = null;
  return {
    open() {
      controller?.dispose();
      controller = new MenuController(createMenuLayer(document.body, 'Gallery menu'), registry, { holds: () => true }, windowskin(), () => onClose());
      controller.push('gallery:hub');
    },
    sample(pad) { controller?.sample(pad, 400); },
    state() {
      const layer = controller?.layer.element;
      const active = document.activeElement;
      return {
        open: !!controller?.open,
        top: controller?.topId ?? null,
        focused: active instanceof HTMLElement && layer?.contains(active) ? active.textContent?.trim() ?? null : null,
        help: [...(layer?.querySelectorAll<HTMLElement>('.menu-screen:not([hidden]) .menu-help-text') ?? [])].map(e => e.textContent).join(''),
      };
    },
    dispose() { controller?.dispose(); controller = null; },
  };
}
