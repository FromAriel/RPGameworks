/**
 * Help (decision 0016 U2.3a): how to play, by topic, for each input device. Tabs choose the device (Keyboard,
 * Controller, Touch); the list chooses the topic; the detail window lists that topic's controls. Controller lines use
 * the player's current bindings, so remapped buttons are described as they are.
 */
import { createDetail, createHelpLine, createList, createTabs, menuWindow } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';
import type { PadAction } from '../../platform/gamepad-model';
import { standardNames } from '../ui/controller-settings';

export const HELP_SCREEN = 'builtin:help';

export type Device = 'keyboard' | 'controller' | 'touch';
export interface HelpOptions {
  /** The controller's current button for each action (-1 when unassigned). */
  readonly bindings: () => Readonly<Record<PadAction, number>>;
}

const DEVICES: readonly { id: Device; label: string }[] = [
  { id: 'keyboard', label: 'Keyboard' }, { id: 'controller', label: 'Controller' }, { id: 'touch', label: 'Touch' },
];
const TOPICS = [
  { id: 'moving', label: 'Moving', help: 'Walking around the world.' },
  { id: 'talking', label: 'Talking', help: 'People, signs and chests.' },
  { id: 'menu', label: 'The menu', help: 'Items, Journal, Save and more.' },
  { id: 'battle', label: 'Battle', help: 'Commands, targets and moving on the grid.' },
  { id: 'saving', label: 'Saving', help: 'Keeping your progress.' },
] as const;
type Topic = typeof TOPICS[number]['id'];

/** A controller button by number and, on a standard layout, by name. */
export function buttonName(index: number): string {
  if (index < 0) return 'unassigned';
  const name = standardNames[index];
  return name ? `${name.split(' / ')[0]} (button ${index})` : `button ${index}`;
}

export function helpLines(topic: Topic, device: Device, bindings: Readonly<Record<PadAction, number>>): string[] {
  const b = (action: PadAction) => buttonName(bindings[action]);
  const lines: Record<Device, Record<Topic, string[]>> = {
    keyboard: {
      moving: ['Arrow keys or W A S D: walk.', 'Space: a small cosmetic spark.'],
      talking: ['Face someone or something, then E or Enter: talk, read or open.', 'E or Enter: next page.', 'Escape: close.'],
      menu: ['I or Escape: open or close the menu.', 'Arrow keys: choose. Enter: confirm. Escape: back.', 'Q and E: change tabs. R on Items: change the sort.'],
      battle: ['Arrow keys: choose a command or target.', 'Enter: confirm. Escape: back one step.'],
      saving: ['Menu, then Save: three slots, plus import and export.', 'Saves stay in this browser until you export them.'],
    },
    controller: {
      moving: ['Left stick or D-pad: walk.', `${b('burst')}: a small cosmetic spark.`],
      talking: [`Face someone or something, then ${b('interact')}: talk, read or open.`, `${b('interact')}: next page.`, `${b('cancel')}: close.`],
      menu: [`${b('menu')}: open or close the menu.`, `D-pad: choose. ${b('interact')}: confirm. ${b('cancel')}: back.`, `${b('tabPrev')} and ${b('tabNext')}: change tabs. ${b('burst')} on Items: change the sort.`],
      battle: ['D-pad or stick: choose a command or target.', `${b('interact')}: confirm. ${b('cancel')}: back one step.`],
      saving: ['Menu, then Save: three slots, plus import and export.', 'Change buttons in Config, Controller setup.'],
    },
    touch: {
      moving: ['Turn on on-screen controls in Config.', 'The arrow pad: walk.', 'Spark: a small cosmetic spark.'],
      talking: ['Face someone or something, then Interact: talk, read or open.', 'Tap Next page or Close in the window.'],
      menu: ['Menu (top right): open the menu.', 'Tap an entry to choose it; tap a tab to change it.'],
      battle: ['Tap a command, then tap a target.'],
      saving: ['Menu, then Save: three slots, plus import and export.'],
    },
  };
  return lines[device][topic];
}

export function helpScreen(_context: ScreenContext, options: HelpOptions): MenuScreen {
  const element = document.createElement('div');
  element.className = 'menu-help-screen';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const top = menuWindow({ box: { x: 0, y: 50, w: 640, h: 50 } });
  const listWindow = menuWindow({ title: 'Help', box: { x: 0, y: 100, w: 220, h: 260 } });
  const detailWindow = menuWindow({ box: { x: 220, y: 100, w: 420, h: 260 } });
  const line = createHelpLine(element, 'Q/E: input device.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  let topic: Topic = 'moving';
  const describe = () => {
    const entry = TOPICS.find(t => t.id === topic)!;
    detail.set({ heading: `${entry.label}: ${DEVICES.find(d => d.id === tabs.selected)!.label}`, lines: helpLines(topic, tabs.selected as Device, options.bindings()) });
  };
  const list = createList({
    label: 'Topics',
    entries: TOPICS.map(t => ({ id: t.id, label: t.label, help: t.help })),
    onChoose: () => undefined,
    onFocus: id => { topic = id as Topic; describe(); },
  });
  const tabs = createTabs({ label: 'Input device', tabs: DEVICES, onChange: () => describe() });
  top.body.append(tabs.element);
  listWindow.body.append(list.element);
  element.append(help.element, top.element, listWindow.element, detailWindow.element);
  return {
    element,
    focusFirst: () => { list.focus(topic); describe(); },
    step: delta => tabs.step(delta),
    dispose: () => element.remove(),
  };
}
