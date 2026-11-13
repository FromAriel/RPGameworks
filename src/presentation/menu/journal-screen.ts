/**
 * The Journal (decision 0016 U2.3a): the quests the party knows, active ones first, with the highlighted quest's
 * objective (or how it ended) in the detail window. Read-only.
 */
import { createDetail, createHelpLine, createList, menuWindow } from './blocks';
import type { ListEntry } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';

export const JOURNAL_SCREEN = 'builtin:journal';

export interface JournalQuest {
  readonly id: string;
  readonly title: string;
  readonly state: 'active' | 'completed';
  /** The objective while active; the completion text once completed. */
  readonly text: string;
}
export interface JournalOptions { readonly quests: () => readonly JournalQuest[] }

const EMPTY = 'empty';

export function journalScreen(_context: ScreenContext, options: JournalOptions): MenuScreen {
  const element = document.createElement('div');
  element.className = 'menu-journal';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const listWindow = menuWindow({ title: 'Journal', box: { x: 0, y: 50, w: 280, h: 310 } });
  const detailWindow = menuWindow({ box: { x: 280, y: 50, w: 360, h: 310 } });
  const line = createHelpLine(element, 'Your quests.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  // Active quests first, then completed ones; each group keeps the catalog's order.
  const quests = () => [...options.quests()].sort((a, b) => (a.state === b.state ? 0 : a.state === 'active' ? -1 : 1));
  const describe = (id: string) => {
    const quest = quests().find(q => q.id === id);
    detail.set(quest
      ? { heading: quest.title, lines: [quest.state === 'completed' ? 'Completed.' : 'In progress.', quest.text] }
      : { heading: 'No quests yet', lines: ['Talk to people to find work worth doing.'] });
  };
  const list = createList({ label: 'Quests', entries: [], onChoose: () => undefined, onFocus: describe });
  listWindow.body.append(list.element);
  element.append(help.element, listWindow.element, detailWindow.element);
  return {
    element,
    focusFirst: () => {
      const shown = quests();
      const entries: ListEntry[] = shown.length
        ? shown.map(q => ({ id: q.id, label: q.title, detail: q.state === 'completed' ? '✓' : '', help: q.state === 'completed' ? 'Completed.' : 'In progress.' }))
        : [{ id: EMPTY, label: 'No quests yet', enabled: false, help: 'Talk to people to find work worth doing.' }];
      list.setEntries(entries);
      list.focus();
      describe(list.focusedId ?? EMPTY);
    },
    dispose: () => element.remove(),
  };
}
