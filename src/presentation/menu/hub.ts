/**
 * The hub (decision 0016 U2.1): the screen the menu key opens. Party cards on one side, the command column from the
 * game's `menu.json` on the other, and small info windows under the commands. A game reorders, renames, hides or adds
 * entries in data; an entry whose screen does not exist yet is shown greyed so the player can read what it will be.
 */
import { createHelpLine, createInfo, createList, createPartyCards, menuWindow } from './blocks';
import type { ListEntry, PartyMember } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';
import type { MenuDefinition, Entry } from '../../content/generated/menu';

export const HUB_SCREEN = 'builtin:hub';

export interface HubOptions {
  readonly menu: MenuDefinition;
  readonly party: () => readonly PartyMember[];
  /** Info-window values by slot; a slot with no value (its system does not exist yet) is not shown. */
  readonly info: () => Partial<Record<'location' | 'play-time' | 'money', string>>;
  /** Whether choosing this entry does anything yet. */
  readonly available: (entry: Entry) => boolean;
  readonly choose: (entry: Entry) => void;
  /** The entry to focus when the hub opens (the last one chosen), if still shown. */
  readonly focus?: () => string | null;
}

const INFO_LABELS = { location: 'Location', 'play-time': 'Time', money: 'Money' } as const;
const COLUMN = 208;
const HELP_HEIGHT = 50;
const INFO_ROW = 18;

export function hubScreen(context: ScreenContext, options: HubOptions): MenuScreen {
  const { menu } = options;
  const element = document.createElement('div');
  element.className = 'menu-hub';
  const left = menu.layout === 'command-left';
  const info = (menu.info ?? []).flatMap(slot => { const value = options.info()[slot]; return value === undefined ? [] : [[slot, value] as const]; });
  // Each info line is one 18 px row inside the window's frame; the commands take the rest of the column.
  const infoHeight = info.length ? 32 + info.length * INFO_ROW : 0;
  const partyX = left ? COLUMN : 0, columnX = left ? 0 : 640 - COLUMN;
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: HELP_HEIGHT }, className: 'menu-help' });
  const partyWindow = menuWindow({ box: { x: partyX, y: HELP_HEIGHT, w: 640 - COLUMN, h: 360 - HELP_HEIGHT }, className: 'menu-party-window' });
  const commands = menuWindow({ title: 'Menu', box: { x: columnX, y: HELP_HEIGHT, w: COLUMN, h: 360 - HELP_HEIGHT - infoHeight }, className: 'menu-commands' });
  const line = createHelpLine(element, 'Choose a command.');
  help.body.append(line.element);
  partyWindow.body.append(createPartyCards({ members: options.party() }).element);
  const shown = menu.entries.filter(entry => !entry.when || context.services.holds(entry.when as Parameters<typeof context.services.holds>[0]));
  const entries: ListEntry[] = shown.map(entry => {
    const ready = options.available(entry);
    return { id: entry.id, label: entry.label, enabled: ready, help: ready ? entry.help ?? '' : `${entry.help ? `${entry.help} ` : ''}Arrives later.` };
  });
  const list = createList({ label: 'Menu', entries, onChoose: id => { const entry = shown.find(e => e.id === id); if (entry) options.choose(entry); } });
  commands.body.append(list.element);
  element.append(help.element, partyWindow.element, commands.element);
  if (info.length) {
    const infoWindow = menuWindow({ box: { x: columnX, y: 360 - infoHeight, w: COLUMN, h: infoHeight }, className: 'menu-info-window' });
    infoWindow.body.append(...info.map(([slot, value]) => createInfo(INFO_LABELS[slot], value).element));
    element.append(infoWindow.element);
  }
  return {
    element,
    focusFirst: () => {
      const wanted = options.focus?.() ?? null;
      list.focus(wanted && shown.some(e => e.id === wanted) ? wanted : undefined);
    },
    dispose: () => element.remove(),
  };
}
