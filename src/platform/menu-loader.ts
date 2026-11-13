import { readMenu } from '../content/validation.mjs';
import type { MenuDefinition } from '../content/generated/menu';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

/** The menu a game without a `menu.json` gets: the built-in screens in the classic order, location only. */
export const DEFAULT_MENU: MenuDefinition = {
  schemaVersion: 1,
  layout: 'command-right',
  entries: [
    { id: 'items', label: 'Items', screen: 'builtin:items', help: 'Use and inspect what you carry.' },
    { id: 'journal', label: 'Journal', screen: 'builtin:journal', help: 'Your quests.' },
    { id: 'config', label: 'Config', screen: 'builtin:config', help: 'Effects, controls and display.' },
    { id: 'help', label: 'Help', screen: 'builtin:help', help: 'How to play.' },
    { id: 'save', label: 'Save', screen: 'builtin:save', help: 'Save or load your progress.' },
  ],
  info: ['location'],
};

/** The game's hub menu (decision 0016). Cross-file references were checked by the content build. */
export async function loadMenu(base: URL, content: LoadedMap, signal: AbortSignal): Promise<MenuDefinition> {
  if (!content.game.menuFile) return DEFAULT_MENU;
  const menu = readMenu(await fetchContent(new URL(`generated/content/${content.game.menuFile}`, base), signal), content.game.menuFile);
  signal.throwIfAborted();
  return menu;
}
