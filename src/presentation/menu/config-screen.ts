/**
 * Config (decision 0016 U2.3b): the player's settings in the menu. Each setting is an On/Off row: Enter, a click, or
 * Left/Right flips it, and the detail window explains it. "Controller setup…" opens the detailed controller panel,
 * which closes back here. Developer readouts stay in the Debug panel (F2), not in this screen.
 */
import { createDetail, createHelpLine, createList, menuWindow } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';

export const CONFIG_SCREEN = 'builtin:config';
/** The row that opens Controller setup; the screen comes back focused on it. */
export const CONTROLLER_SETUP = 'controller-setup';

export interface PlayerSetting {
  readonly id: string;
  readonly label: string;
  /** The help line while the row is highlighted. */
  readonly help: string;
  /** More about the setting, for the detail window. */
  readonly about: readonly string[];
  get(): boolean;
  set(value: boolean): void;
}
export interface ConfigOptions {
  readonly settings: readonly PlayerSetting[];
  /** The controller's detection status, shown with Controller setup. */
  readonly controllerStatus: () => string;
  /** Leave the menu for the Controller setup panel; it reopens Config when it closes. */
  readonly openControllerSetup: () => void;
}
export interface ConfigParams { readonly focus?: string }

const onOff = (value: boolean) => value ? 'On' : 'Off';

export function configScreen(_context: ScreenContext, options: ConfigOptions, params?: ConfigParams): MenuScreen {
  const element = document.createElement('div');
  element.className = 'menu-config-screen';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const listWindow = menuWindow({ title: 'Config', box: { x: 0, y: 50, w: 300, h: 310 } });
  const detailWindow = menuWindow({ box: { x: 300, y: 50, w: 340, h: 310 } });
  const line = createHelpLine(element, 'Enter or Left/Right: change.');
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  const entries = () => [
    ...options.settings.map(setting => ({ id: setting.id, label: setting.label, detail: onOff(setting.get()), help: setting.help, checked: setting.get() })),
    { id: CONTROLLER_SETUP, label: 'Controller setup…', help: 'Device, buttons, sticks and a diagnostic report.' },
  ];
  const describe = (id: string) => {
    const setting = options.settings.find(s => s.id === id);
    detail.set(setting
      ? { heading: `${setting.label}: ${onOff(setting.get())}`, lines: setting.about }
      : { heading: 'Controller setup', lines: [options.controllerStatus(), 'Choose the device, remap buttons and sticks, or copy a diagnostic report. Close it to come back here.'] });
  };
  const list = createList({
    label: 'Settings',
    entries: entries(),
    onChoose: id => {
      if (id === CONTROLLER_SETUP) { options.openControllerSetup(); return; }
      const setting = options.settings.find(s => s.id === id);
      if (!setting) return;
      setting.set(!setting.get());
      list.setEntries(entries());
      describe(id);
    },
    onFocus: describe,
  });
  listWindow.body.append(list.element);
  element.append(help.element, listWindow.element, detailWindow.element);
  return {
    element,
    focusFirst: () => { list.setEntries(entries()); list.focus(params?.focus); },
    dispose: () => element.remove(),
  };
}
