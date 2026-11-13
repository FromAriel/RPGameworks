/**
 * The worked example of a code plug-in screen (decision 0016 U2.4; docs/guides/menu-screens.md). A game registers it
 * in src/game-screens.ts and lists `example:notes` in menu.json. It is test-only: the demo game does not register it.
 *
 * It shows the whole contract: build windows from the shared blocks, focus the first row, react to Cancel, and use
 * ScreenContext to go back or close the menu.
 */
import { createDetail, createHelpLine, createList, menuWindow } from '../../../src/presentation/menu/blocks';
import type { MenuScreen, ScreenContext, ScreenRegistry } from '../../../src/presentation/menu/screens';

export const NOTES_SCREEN = 'example:notes';
export interface Note { readonly id: string; readonly title: string; readonly text: string }

export function notesScreen(context: ScreenContext, notes: readonly Note[]): MenuScreen {
  const element = document.createElement('div');
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const listWindow = menuWindow({ title: 'Notes', box: { x: 0, y: 50, w: 260, h: 310 } });
  const detailWindow = menuWindow({ box: { x: 260, y: 50, w: 380, h: 310 } });
  const line = createHelpLine(element, 'Enter on Done: close the menu.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  const list = createList({
    label: 'Notes',
    entries: [...notes.map(note => ({ id: note.id, label: note.title, help: note.text })), { id: 'done', label: 'Done', help: 'Close the menu.' }],
    // A choice can open another screen (context.open), go back (context.back) or close the menu (context.close).
    onChoose: id => { if (id === 'done') context.close(); },
    onFocus: id => {
      const note = notes.find(n => n.id === id);
      detail.set(note ? { heading: note.title, lines: [note.text] } : { heading: 'Done', lines: ['Close the menu and return to the game.'] });
    },
  });
  listWindow.body.append(list.element);
  element.append(help.element, listWindow.element, detailWindow.element);
  return {
    element,
    focusFirst: () => list.focus(),
    dispose: () => element.remove(),
  };
}

/** What src/game-screens.ts would contain for this game. */
export function registerExampleScreens(registry: ScreenRegistry, notes: readonly Note[]): void {
  registry.register(NOTES_SCREEN, context => notesScreen(context, notes));
}
