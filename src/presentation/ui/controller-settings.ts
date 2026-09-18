import { ACTIONS, axisValue, buttonPressed, defaultControllerConfig } from '../../platform/gamepad-model';
import type { PadAction } from '../../platform/gamepad-model';
import type { GamepadController } from '../../platform/gamepad';

const standardNames = ['A / bottom', 'B / right', 'X / left', 'Y / top', 'LB', 'RB', 'LT', 'RT',
  'View', 'Menu', 'Left stick click', 'Right stick click', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Guide'];
const actionNames: Record<PadAction, string> = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', burst: 'Pixel burst' };

/** Build the small settings UI once; telemetry uses the app's existing 4 Hz refresh. */
export function mountControllerSettings(root: HTMLDetailsElement, controller: GamepadController, stage: HTMLElement, appReport: () => object): { refresh(): void; dispose(): void } {
  const lifetime = new AbortController();
  function get<T extends HTMLElement>(selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing controller control: ${selector}`);
    return node;
  }
  const devices = get<HTMLSelectElement>('#controller-device');
  const enabled = get<HTMLInputElement>('#controller-enabled');
  const unmapped = get<HTMLInputElement>('#controller-unmapped');
  const deadzone = get<HTMLInputElement>('#controller-deadzone');
  const deadzoneValue = get<HTMLOutputElement>('#controller-deadzone-value');
  const x = get<HTMLSelectElement>('#controller-axis-x');
  const y = get<HTMLSelectElement>('#controller-axis-y');
  const invertX = get<HTMLInputElement>('#controller-invert-x');
  const invertY = get<HTMLInputElement>('#controller-invert-y');
  const message = get<HTMLElement>('#controller-message');
  const live = get<HTMLElement>('#controller-live');
  const status = get<HTMLElement>('#controller-status');
  const brief = document.querySelector<HTMLElement>('#controller-brief');
  const activate = document.querySelector<HTMLButtonElement>('#controller-activate');
  const report = get<HTMLTextAreaElement>('#controller-report');
  const bindings = new Map<PadAction, HTMLSelectElement>();
  let deviceSignature = '';
  let validationMessage = '';

  function option(select: HTMLSelectElement, value: number | string, label: string): void {
    const node = document.createElement('option'); node.value = String(value); node.textContent = label; select.append(node);
  }
  for (const select of [x, y]) {
    option(select, -1, 'Off');
    for (let i = 0; i < 16; i += 1) option(select, i, `${i}${i < 4 ? ` — ${['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'][i]}` : ''}`);
  }
  for (const action of ACTIONS) {
    const label = document.createElement('label'); label.textContent = actionNames[action];
    const select = document.createElement('select'); select.id = `controller-button-${action}`;
    option(select, -1, 'Unassigned');
    for (let i = 0; i < 64; i += 1) option(select, i, `${i}${standardNames[i] ? ` — ${standardNames[i]}` : ''}`);
    label.append(select); get<HTMLElement>('#controller-bindings').append(label); bindings.set(action, select);
  }

  function sync(): void {
    const config = controller.settings;
    enabled.checked = config.enabled; unmapped.checked = config.allowUnmapped;
    deadzone.value = String(Math.round(config.deadzone * 100)); deadzoneValue.value = `${deadzone.value}%`;
    x.value = String(config.axisX); y.value = String(config.axisY);
    invertX.checked = config.invertX; invertY.checked = config.invertY;
    for (const action of ACTIONS) bindings.get(action)!.value = String(config.buttons[action]);
  }
  function apply(): void {
    const next = controller.settings;
    next.enabled = enabled.checked; next.allowUnmapped = unmapped.checked;
    next.deadzone = Number(deadzone.value) / 100;
    next.axisX = Number(x.value); next.axisY = Number(y.value);
    next.invertX = invertX.checked; next.invertY = invertY.checked;
    for (const action of ACTIONS) next.buttons[action] = Number(bindings.get(action)!.value);
    validationMessage = controller.configure(next) ? '' : 'Not saved: use different X/Y axes and unique buttons, or choose Unassigned first.';
    sync(); refresh();
  }
  const options = { signal: lifetime.signal };
  for (const node of [enabled, unmapped, deadzone, x, y, invertX, invertY, ...bindings.values()]) {
    node.addEventListener('change', apply, options);
  }
  deadzone.addEventListener('input', () => { deadzoneValue.value = `${deadzone.value}%`; }, options);
  devices.addEventListener('change', () => { controller.select(devices.value === 'auto' ? null : Number(devices.value)); refresh(); }, options);
  root.addEventListener('toggle', () => controller.reset(), options);
  get<HTMLButtonElement>('#controller-reset').addEventListener('click', () => {
    controller.configure(defaultControllerConfig()); controller.select(null); validationMessage = ''; sync(); refresh();
  }, options);
  function returnToGame(): void {
    root.open = false;
    controller.rescan();
    stage.focus({ preventScroll: true });
    refresh();
  }
  get<HTMLButtonElement>('#controller-return').addEventListener('click', returnToGame, options);
  activate?.addEventListener('click', () => {
    if (!controller.settings.enabled) controller.configure({ ...controller.settings, enabled: true });
    sync(); returnToGame();
  }, options);
  get<HTMLButtonElement>('#controller-rescan').addEventListener('click', () => {
    controller.rescan(); refresh();
  }, options);
  get<HTMLButtonElement>('#controller-report-button').addEventListener('click', () => {
    controller.refreshDetection();
    report.value = JSON.stringify({
      ...appReport(), browser: navigator.userAgent, origin: location.origin,
      viewportFocused: stage.contains(document.activeElement), settingsOpen: root.open,
      controller: controller.diagnostics(),
    }, null, 2);
    get<HTMLElement>('#controller-report-area').hidden = false;
    report.focus({ preventScroll: true }); report.select();
  }, options);

  function refresh(): void {
    controller.refreshDetection();
    const signature = JSON.stringify([controller.selectedIndex, ...controller.devices.map((pad) => [pad.index, pad.id, pad.mapping])]);
    if (signature !== deviceSignature) {
      deviceSignature = signature; devices.replaceChildren(); option(devices, 'auto', 'Automatic (retain connected controller)');
      for (const pad of controller.devices) option(devices, pad.index, `${pad.index}: ${pad.id.slice(0, 120)}`);
      const selected = controller.selectedIndex;
      if (selected !== null && !controller.devices.some((pad) => pad.index === selected)) option(devices, selected, `${selected}: disconnected`);
      devices.value = selected === null ? 'auto' : String(selected);
    }
    const controllerStatus = controller.status;
    if (status.textContent !== controllerStatus) status.textContent = controllerStatus;
    if (brief && brief.textContent !== controllerStatus) brief.textContent = controllerStatus;
    message.textContent = validationMessage || controller.persistenceStatus;
    if (root.open) {
      const pad = controller.current;
      live.textContent = pad ? `Axes: ${pad.axes.slice(0, 16).map((_, i) => `${i}: ${axisValue(pad, i).toFixed(2)}`).join(' | ')}\nPressed buttons: ${pad.buttons.slice(0, 64).flatMap((_, i) => buttonPressed(pad, i) ? [i] : []).join(', ') || 'none'}` : 'No controller exposed yet.';
    }
  }
  sync(); refresh();
  return { refresh, dispose: () => lifetime.abort() };
}
