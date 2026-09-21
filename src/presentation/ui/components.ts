export type UiIntent = 'primary' | 'secondary' | 'danger';
export type UiStatusKind = 'pending' | 'information' | 'success' | 'warning' | 'failure';
export type UiMeterTone = 'neutral' | 'information' | 'success' | 'warning' | 'danger';
export type ScrollAvailability = 'none' | 'above' | 'below' | 'both';

/** Optional presentation enhancement. It never owns a timer or changes component meaning. */
export function setUiGlowPulse(element: HTMLElement, enabled: boolean): void {
  if (enabled) element.dataset.uiGlow = 'pulse';
  else delete element.dataset.uiGlow;
}

interface DisabledState {
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export interface ActionButtonOptions extends DisabledState {
  readonly id: string;
  readonly label: string;
  readonly intent?: UiIntent;
  readonly onActivate?: () => void;
}

export interface ActionButtonHandle {
  readonly element: HTMLButtonElement;
  readonly reason: HTMLParagraphElement;
  setDisabled(disabled: boolean, reason?: string): void;
  setBusy(busy: boolean, busyLabel?: string): void;
  dispose(): void;
}

function disabledReasonId(id: string): string { return `${id}-disabled-reason`; }

function applyDisabledState(
  element: HTMLButtonElement,
  reason: HTMLParagraphElement,
  disabled: boolean,
  message?: string,
): void {
  element.disabled = disabled;
  const text = disabled && message ? message : '';
  reason.textContent = text;
  reason.hidden = text.length === 0;
  if (text) element.setAttribute('aria-describedby', reason.id);
  else element.removeAttribute('aria-describedby');
}

/** Semantic action control. The caller owns asynchronous work and state transitions. */
export function createActionButton(options: ActionButtonOptions): ActionButtonHandle {
  const element = document.createElement('button');
  element.id = options.id;
  element.type = 'button';
  element.className = 'ui-action-button';
  element.dataset.intent = options.intent ?? 'primary';
  element.textContent = options.label;
  const reason = document.createElement('p');
  reason.id = disabledReasonId(options.id);
  reason.className = 'ui-disabled-reason';
  reason.hidden = true;
  let busy = false;
  const lifetime = new AbortController();
  element.addEventListener('click', (event) => {
    if (busy || element.disabled || element.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    options.onActivate?.();
  }, { signal: lifetime.signal });
  applyDisabledState(element, reason, options.disabled ?? false, options.disabledReason);
  return {
    element,
    reason,
    setDisabled(disabled, message): void {
      if (busy) throw new Error('A busy action cannot change its disabled state.');
      applyDisabledState(element, reason, disabled, message);
    },
    setBusy(nextBusy, busyLabel): void {
      if (busy === nextBusy) return;
      busy = nextBusy;
      if (nextBusy) {
        element.setAttribute('aria-busy', 'true');
        element.setAttribute('aria-disabled', 'true');
        element.dataset.label = element.textContent ?? options.label;
        if (busyLabel) element.textContent = busyLabel;
      } else {
        element.removeAttribute('aria-busy');
        element.removeAttribute('aria-disabled');
        element.textContent = element.dataset.label ?? options.label;
        delete element.dataset.label;
      }
    },
    dispose(): void { lifetime.abort(); },
  };
}

export interface ListRowOptions extends DisabledState {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly trailing?: string;
  readonly selected?: boolean;
  readonly onActivate?: () => void;
}

export interface ListRowHandle {
  readonly element: HTMLButtonElement;
  readonly reason: HTMLParagraphElement;
  setSelected(selected: boolean): void;
  setDisabled(disabled: boolean, reason?: string): void;
  dispose(): void;
}

/** Selectable semantic row with a stable text marker instead of a color-only state. */
export function createListRow(options: ListRowOptions): ListRowHandle {
  const element = document.createElement('button');
  element.id = options.id;
  element.type = 'button';
  element.className = 'ui-list-row';
  const marker = document.createElement('span');
  marker.className = 'ui-list-row__marker';
  marker.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.className = 'ui-list-row__copy';
  const label = document.createElement('span');
  label.className = 'ui-list-row__label';
  label.textContent = options.label;
  copy.append(label);
  if (options.description) {
    const description = document.createElement('span');
    description.className = 'ui-list-row__description';
    description.textContent = options.description;
    copy.append(description);
  }
  element.append(marker, copy);
  if (options.trailing) {
    const trailing = document.createElement('span');
    trailing.className = 'ui-list-row__trailing';
    trailing.textContent = options.trailing;
    element.append(trailing);
  }
  const reason = document.createElement('p');
  reason.id = disabledReasonId(options.id);
  reason.className = 'ui-disabled-reason';
  reason.hidden = true;
  const lifetime = new AbortController();
  element.addEventListener('click', () => options.onActivate?.(), { signal: lifetime.signal });
  const setSelected = (selected: boolean): void => {
    element.setAttribute('aria-pressed', String(selected));
    marker.textContent = selected ? 'Selected' : '';
  };
  setSelected(options.selected ?? false);
  applyDisabledState(element, reason, options.disabled ?? false, options.disabledReason);
  return {
    element,
    reason,
    setSelected,
    setDisabled(disabled, message): void { applyDisabledState(element, reason, disabled, message); },
    dispose(): void { lifetime.abort(); },
  };
}

export interface TabsController {
  readonly selectedId: string;
  select(tabId: string, focus?: boolean): void;
  dispose(): void;
}

/** Tab semantics only. MenuNavigation remains the sole directional navigation owner. */
export function mountTabs(root: HTMLElement, onSelect?: (tabId: string) => void): TabsController {
  const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  if (tabs.length === 0) throw new Error('A tablist requires at least one tab.');
  const ids = new Set<string>();
  for (const tab of tabs) {
    if (!tab.id || ids.has(tab.id)) throw new Error('Every tab requires a unique ID.');
    ids.add(tab.id);
    const panelId = tab.getAttribute('aria-controls');
    if (!panelId || !document.getElementById(panelId)) throw new Error(`Tab ${tab.id} has no controlled panel.`);
  }
  const lifetime = new AbortController();
  let selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') ?? tabs[0]!;
  const choose = (tab: HTMLButtonElement, focus: boolean, notify: boolean): void => {
    selected = tab;
    for (const candidate of tabs) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(candidate.getAttribute('aria-controls')!);
      if (panel) panel.hidden = !active;
    }
    if (focus) tab.focus({ preventScroll: true });
    if (notify) onSelect?.(tab.id);
  };
  choose(selected, false, false);
  root.addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (tab && tabs.includes(tab) && !tab.disabled) choose(tab, false, true);
  }, { signal: lifetime.signal });
  root.addEventListener('keydown', (event) => {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]');
    if (!tab || !tabs.includes(tab)) return;
    let index: number | null = null;
    if (event.key === 'ArrowRight') index = (tabs.indexOf(tab) + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (tabs.indexOf(tab) - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    if (index === null) return;
    event.preventDefault();
    event.stopPropagation();
    choose(tabs[index]!, true, true);
  }, { signal: lifetime.signal });
  return {
    get selectedId(): string { return selected.id; },
    select(tabId, focus = false): void {
      const tab = tabs.find((candidate) => candidate.id === tabId);
      if (!tab) throw new Error(`Unknown tab: ${tabId}`);
      choose(tab, focus, true);
    },
    dispose(): void { lifetime.abort(); },
  };
}

const statusLabels: Readonly<Record<UiStatusKind, string>> = Object.freeze({
  pending: 'Pending', information: 'Information', success: 'Success', warning: 'Warning', failure: 'Failure',
});

export interface StatusPresenter {
  set(kind: UiStatusKind, message: string): void;
  clear(): void;
  dispose(): void;
}

export function mountStatus(root: HTMLElement): StatusPresenter {
  root.classList.add('ui-status');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-atomic', 'true');
  let disposed = false;
  return {
    set(kind, message): void {
      if (disposed) return;
      root.dataset.kind = kind;
      root.textContent = `${statusLabels[kind]}: ${message}`;
      root.hidden = false;
    },
    clear(): void {
      if (disposed) return;
      root.textContent = '';
      root.hidden = true;
      delete root.dataset.kind;
    },
    dispose(): void { disposed = true; },
  };
}

export interface MeterValue { readonly current: number; readonly maximum: number }

export interface MeterModel extends MeterValue {
  readonly clamped: number;
  readonly percentage: number;
  readonly text: string;
}

export function resolveMeter(value: MeterValue): MeterModel {
  if (!Number.isFinite(value.current)) throw new Error('Meter current value must be finite.');
  if (!Number.isFinite(value.maximum) || value.maximum <= 0) throw new Error('Meter maximum must be finite and positive.');
  const clamped = Math.max(0, Math.min(value.maximum, value.current));
  return Object.freeze({ ...value, clamped, percentage: clamped / value.maximum * 100, text: `${value.current} / ${value.maximum}` });
}

export interface MeterOptions extends MeterValue {
  readonly id: string;
  readonly label: string;
  readonly tone?: UiMeterTone;
}

export interface MeterHandle {
  readonly element: HTMLElement;
  set(value: MeterValue): void;
  dispose(): void;
}

export function createMeter(options: MeterOptions): MeterHandle {
  const element = document.createElement('section');
  element.id = options.id;
  element.className = 'ui-meter';
  element.dataset.tone = options.tone ?? 'neutral';
  element.setAttribute('role', 'meter');
  element.setAttribute('aria-valuemin', '0');
  const heading = document.createElement('span');
  heading.className = 'ui-meter__label';
  heading.textContent = options.label;
  const number = document.createElement('span');
  number.className = 'ui-meter__number';
  const track = document.createElement('span');
  track.className = 'ui-meter__track';
  track.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.className = 'ui-meter__fill';
  track.append(fill);
  element.append(heading, number, track);
  let disposed = false;
  const set = (value: MeterValue): void => {
    if (disposed) return;
    const model = resolveMeter(value);
    element.setAttribute('aria-label', `${options.label}: ${model.text}`);
    element.setAttribute('aria-valuemax', String(model.maximum));
    element.setAttribute('aria-valuenow', String(model.clamped));
    element.setAttribute('aria-valuetext', model.text);
    number.textContent = model.text;
    fill.style.width = `${model.percentage}%`;
  };
  set(options);
  return { element, set, dispose(): void { disposed = true; } };
}

export interface PromptEntry { readonly action: string; readonly input: string }

export interface PromptLegendPresenter {
  set(entries: readonly PromptEntry[]): void;
  dispose(): void;
}

export function mountPromptLegend(root: HTMLElement): PromptLegendPresenter {
  root.classList.add('ui-prompt-legend');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Controls');
  let disposed = false;
  return {
    set(entries): void {
      if (disposed) return;
      root.replaceChildren(...entries.map(({ action, input }) => {
        const entry = document.createElement('span');
        entry.className = 'ui-prompt-legend__entry';
        const inputLabel = document.createElement('span');
        inputLabel.className = 'ui-prompt-legend__input';
        inputLabel.textContent = input;
        const actionLabel = document.createElement('span');
        actionLabel.textContent = action;
        entry.append(inputLabel, actionLabel);
        return entry;
      }));
    },
    dispose(): void { disposed = true; },
  };
}

export interface InsetRegionHandle {
  readonly element: HTMLElement;
  readonly body: HTMLElement;
}

export function createInsetRegion(id: string, title: string): InsetRegionHandle {
  const element = document.createElement('section');
  element.className = 'ui-inset';
  element.setAttribute('aria-labelledby', `${id}-title`);
  const heading = document.createElement('h3');
  heading.id = `${id}-title`;
  heading.className = 'ui-inset__title';
  heading.textContent = title;
  const body = document.createElement('div');
  body.id = id;
  body.className = 'ui-inset__body';
  element.append(heading, body);
  return { element, body };
}

export function resolveScrollAvailability(scrollTop: number, clientHeight: number, scrollHeight: number): ScrollAvailability {
  const above = scrollTop > 1;
  const below = scrollTop + clientHeight < scrollHeight - 1;
  if (above && below) return 'both';
  if (above) return 'above';
  if (below) return 'below';
  return 'none';
}

export interface ScrollAffordanceController {
  readonly state: ScrollAvailability;
  refresh(): void;
  dispose(): void;
}

export function mountScrollAffordance(
  container: HTMLElement,
  aboveIndicator: HTMLElement,
  belowIndicator: HTMLElement,
): ScrollAffordanceController {
  const lifetime = new AbortController();
  let current: ScrollAvailability = 'none';
  let disposed = false;
  const refresh = (): void => {
    if (disposed) return;
    current = resolveScrollAvailability(container.scrollTop, container.clientHeight, container.scrollHeight);
    container.dataset.scrollAvailability = current;
    aboveIndicator.hidden = current !== 'above' && current !== 'both';
    belowIndicator.hidden = current !== 'below' && current !== 'both';
  };
  aboveIndicator.classList.add('ui-scroll-affordance', 'ui-scroll-affordance--above');
  belowIndicator.classList.add('ui-scroll-affordance', 'ui-scroll-affordance--below');
  aboveIndicator.textContent = 'More above';
  belowIndicator.textContent = 'More below';
  container.addEventListener('scroll', refresh, { passive: true, signal: lifetime.signal });
  const resize = new ResizeObserver(refresh);
  resize.observe(container);
  for (const child of container.children) resize.observe(child);
  refresh();
  return {
    get state(): ScrollAvailability { return current; },
    refresh,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      resize.disconnect();
    },
  };
}

export interface ConfirmationRequest {
  readonly title: string;
  readonly body: string;
  readonly detail?: string;
  readonly confirmLabel: string;
  readonly intent?: UiIntent;
}

export interface ConfirmationHooks {
  readonly clearHeldInputs?: () => void;
  readonly onOpen?: () => void;
  readonly onClose?: () => void;
}

export interface ConfirmationController {
  readonly pending: boolean;
  confirm(request: ConfirmationRequest): Promise<boolean>;
  dispose(): void;
}

export interface ConfirmationDialogParts {
  readonly dialog: HTMLDialogElement;
  readonly title: HTMLElement;
  readonly body: HTMLElement;
  readonly detail: HTMLElement;
  readonly confirm: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
}

export function createConfirmationDialog(id: string): ConfirmationDialogParts {
  const dialog = document.createElement('dialog');
  dialog.id = id;
  dialog.className = 'ui-confirmation';
  dialog.dataset.windowSkin = 'frame';
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.setAttribute('aria-describedby', `${id}-body`);
  const heading = document.createElement('header');
  heading.className = 'ui-confirmation__heading';
  const title = document.createElement('h2');
  title.id = `${id}-title`;
  title.dataset.skinTitle = '';
  heading.append(title);
  const body = document.createElement('p');
  body.id = `${id}-body`;
  body.className = 'ui-confirmation__body';
  const detail = document.createElement('p');
  detail.className = 'ui-confirmation__detail';
  detail.hidden = true;
  const actions = document.createElement('div');
  actions.className = 'ui-confirmation__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'ui-action-button';
  cancel.dataset.intent = 'secondary';
  cancel.textContent = 'Cancel';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'ui-action-button';
  actions.append(cancel, confirm);
  dialog.append(heading, body, detail, actions);
  return { dialog, title, body, detail, confirm, cancel };
}

export function mountConfirmation(parts: ConfirmationDialogParts, hooks: ConfirmationHooks = {}): ConfirmationController {
  const lifetime = new AbortController();
  let resolvePending: ((value: boolean) => void) | null = null;
  let opener: HTMLElement | null = null;
  let disposed = false;
  const finish = (confirmed: boolean): void => {
    if (!resolvePending) return;
    const resolve = resolvePending;
    resolvePending = null;
    if (parts.dialog.open) parts.dialog.close();
    hooks.clearHeldInputs?.();
    hooks.onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    resolve(confirmed);
  };
  parts.cancel.addEventListener('click', () => finish(false), { signal: lifetime.signal });
  parts.confirm.addEventListener('click', () => finish(true), { signal: lifetime.signal });
  parts.dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(false);
  }, { signal: lifetime.signal });
  parts.dialog.addEventListener('close', () => finish(false), { signal: lifetime.signal });
  return {
    get pending(): boolean { return resolvePending !== null; },
    confirm(request): Promise<boolean> {
      if (disposed) return Promise.reject(new Error('Confirmation controller is disposed.'));
      if (resolvePending) return Promise.reject(new Error('A confirmation is already pending.'));
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      parts.title.textContent = request.title;
      parts.body.textContent = request.body;
      parts.detail.textContent = request.detail ?? '';
      parts.detail.hidden = !request.detail;
      parts.confirm.textContent = request.confirmLabel;
      parts.confirm.dataset.intent = request.intent ?? 'primary';
      hooks.clearHeldInputs?.();
      hooks.onOpen?.();
      parts.dialog.showModal();
      queueMicrotask(() => { if (resolvePending) parts.cancel.focus({ preventScroll: true }); });
      return new Promise<boolean>((resolve) => { resolvePending = resolve; });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      finish(false);
    },
  };
}
