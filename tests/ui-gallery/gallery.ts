import '../../src/presentation/ui/tokens.css';
import '../../src/presentation/ui/components.css';
import '../../src/presentation/skin/windowskin.css';
import './gallery.css';
import type { Direction } from '../../src/domain/movement';
import type { PadInput } from '../../src/platform/gamepad-model';
import {
  createActionButton,
  createConfirmationDialog,
  createInsetRegion,
  createListRow,
  createMeter,
  mountConfirmation,
  mountPromptLegend,
  mountScrollAffordance,
  mountStatus,
  mountTabs,
  setUiGlowPulse,
} from '../../src/presentation/ui/components';
import { MenuNavigation } from '../../src/presentation/ui/menu-navigation';
import { mountWindowskin } from '../../src/presentation/ui/windowskin';

interface Disposable { dispose(): void }

interface GallerySnapshot {
  readonly activeControllers: number;
  readonly boundaryClears: number;
  readonly busyActivations: number;
  readonly confirmationPending: boolean;
  readonly glowEnabled: boolean;
  readonly lifecycleCycles: number;
  readonly selectedTab: string;
  readonly scrollState: string;
}

declare global {
  interface Window {
    __UI_GALLERY__?: {
      snapshot(): GallerySnapshot;
      sample(direction: Direction | null, interact?: boolean, cancel?: boolean): void;
      setPrompts(family: 'keyboard' | 'controller' | 'touch'): void;
      setGlow(enabled: boolean): void;
      cycleLifecycle(count: number): void;
      tryOverlap(): Promise<string>;
      dispose(): void;
    };
  }
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing UI gallery element: ${id}`);
  return element as T;
}

function card(title: string): HTMLElement {
  const element = document.createElement('section');
  element.className = 'gallery-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  element.append(heading);
  return element;
}

function stack(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gallery-stack';
  return element;
}

const owned = new Set<Disposable>();
function own<T extends Disposable>(value: T): T { owned.add(value); return value; }
function disposeOwned(value: Disposable): void { value.dispose(); owned.delete(value); }
const matrix = required('state-matrix');
const glowTargets: HTMLElement[] = [];
let glowEnabled = false;
function applyGlow(enabled: boolean): void {
  glowEnabled = enabled;
  for (const target of glowTargets) setUiGlowPulse(target, enabled);
}

const actionCard = card('Action buttons');
const actionStack = stack();
for (const [id, label, intent] of [
  ['gallery-primary', 'Continue', 'primary'],
  ['gallery-secondary', 'Return', 'secondary'],
  ['gallery-danger', 'Erase local record', 'danger'],
] as const) {
  const action = own(createActionButton({ id, label, intent }));
  actionStack.append(action.element);
}
const disabledAction = own(createActionButton({
  id: 'gallery-disabled', label: 'Load empty slot', intent: 'secondary', disabled: true,
  disabledReason: 'Unavailable: this slot does not contain a save.',
}));
actionStack.append(disabledAction.element, disabledAction.reason);
let busyActivations = 0;
const busyAction = own(createActionButton({ id: 'gallery-busy', label: 'Save progress', onActivate: () => { busyActivations += 1; } }));
busyAction.setBusy(true, 'Saving progress…');
actionStack.append(busyAction.element, busyAction.reason);
actionCard.append(actionStack);

const rowCard = card('Selectable rows');
const rowStack = stack();
const ordinaryRow = own(createListRow({ id: 'gallery-row-default', label: 'Field journal', description: 'Ordinary selectable destination', trailing: '4' }));
const selectedRow = own(createListRow({ id: 'gallery-row-selected', label: 'Polished lens', description: 'A discovered authored object', trailing: '× 1', selected: true }));
glowTargets.push(selectedRow.element);
const disabledRow = own(createListRow({ id: 'gallery-row-disabled', label: 'Sealed archive', disabled: true, disabledReason: 'Unavailable: the archive has not been discovered.' }));
rowStack.append(ordinaryRow.element, ordinaryRow.reason, selectedRow.element, selectedRow.reason, disabledRow.element, disabledRow.reason);
rowCard.append(rowStack);

const statusCard = card('Status messages');
const statusStack = stack();
for (const [kind, message] of [
  ['pending', 'Preparing the destination.'],
  ['information', 'Three manual slots are available.'],
  ['success', 'Progress saved locally.'],
  ['warning', 'Current unsaved progress will be replaced.'],
  ['failure', 'The selected record is incompatible.'],
] as const) {
  const root = document.createElement('p');
  const presenter = own(mountStatus(root));
  presenter.set(kind, message);
  statusStack.append(root);
}
statusCard.append(statusStack);

const meterCard = card('Meters and prompts');
const meterStack = stack();
const meterHandles = [
  { id: 'gallery-meter-neutral', label: 'Preparation', current: 3, maximum: 8, tone: 'neutral' as const },
  { id: 'gallery-meter-info', label: 'Exploration progress', current: 7, maximum: 10, tone: 'information' as const },
  { id: 'gallery-meter-warning', label: 'Storage capacity', current: 9, maximum: 10, tone: 'warning' as const },
].map((options) => own(createMeter(options)));
for (const meter of meterHandles) meterStack.append(meter.element);
glowTargets.push(meterHandles[1]!.element, meterHandles[2]!.element);
const staticPrompts = document.createElement('div');
const staticPromptPresenter = own(mountPromptLegend(staticPrompts));
staticPromptPresenter.set([{ action: 'Select', input: 'Arrows' }, { action: 'Confirm', input: 'Enter' }, { action: 'Back', input: 'Escape' }]);
meterStack.append(staticPrompts);
const glowNote = document.createElement('p');
glowNote.id = 'gallery-glow-note';
glowNote.className = 'ui-disabled-reason';
glowNote.textContent = 'Optional pulse is off. Selection and meter meaning remain unchanged.';
const glowToggle = own(createActionButton({
  id: 'gallery-glow-toggle', label: 'Enable optional glow pulse', intent: 'secondary',
  onActivate: () => {
    applyGlow(!glowEnabled);
    glowToggle.element.textContent = glowEnabled ? 'Disable optional glow pulse' : 'Enable optional glow pulse';
    glowNote.textContent = glowEnabled
      ? 'Optional pulse is on. It animates one opacity-only glow layer.'
      : 'Optional pulse is off. Selection and meter meaning remain unchanged.';
  },
}));
meterStack.append(glowToggle.element, glowToggle.reason, glowNote);
meterCard.append(meterStack);

const insetCard = card('Inset region');
const inset = createInsetRegion('gallery-inset-body', 'Repository note');
const insetCopy = document.createElement('p');
insetCopy.className = 'gallery-long-copy';
insetCopy.textContent = 'This deliberately long literal-text sample checks wrapping without introducing a new screen, invented character, or unsupported game system. <strong> remains visible text.';
inset.body.append(insetCopy);
insetCard.append(inset.element);

matrix.append(actionCard, rowCard, statusCard, meterCard, insetCard);

const lane = required('interactive-lane');
const interactiveControls = document.createElement('section');
interactiveControls.id = 'interactive-controls';
interactiveControls.setAttribute('aria-label', 'Interactive production components');
const tabsRoot = document.createElement('div');
tabsRoot.className = 'ui-tabs';
tabsRoot.setAttribute('role', 'tablist');
tabsRoot.setAttribute('aria-label', 'Gallery sections');
for (const [id, label, selected] of [
  ['gallery-tab-items', 'Items', true], ['gallery-tab-records', 'Records', false], ['gallery-tab-system', 'System', false],
] as const) {
  const tab = document.createElement('button');
  tab.id = id;
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', `${id}-panel`);
  tab.setAttribute('aria-selected', String(selected));
  tab.textContent = label;
  tabsRoot.append(tab);
  const panel = document.createElement('section');
  panel.id = `${id}-panel`;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', id);
  panel.hidden = !selected;
  const copy = document.createElement('p');
  copy.textContent = `${label} content panel`;
  panel.append(copy);
  interactiveControls.append(panel);
}
interactiveControls.prepend(tabsRoot);

const selectable = stack();
const interactiveRows = ['Workshop key', 'Gallery map', 'Astral record'].map((label, index) => {
  const optionalCopy = index === 0 ? { description: 'Use pointer, keyboard, or controller-style input.' } : {};
  const optionalTrailing = index === 2 ? { trailing: 'New' } : {};
  return own(createListRow({
    id: `interactive-row-${index}`,
    label,
    ...optionalCopy,
    ...optionalTrailing,
    selected: index === 0,
    onActivate: () => {
    for (const [rowIndex, row] of interactiveRows.entries()) row.setSelected(rowIndex === index);
    interactionStatus.set('information', `${label} selected.`);
    },
  }));
});
for (const row of interactiveRows) selectable.append(row.element, row.reason);
glowTargets.push(...interactiveRows.map((row) => row.element));
interactiveControls.append(selectable);

const promptRoot = document.createElement('div');
promptRoot.id = 'interactive-prompts';
const prompts = own(mountPromptLegend(promptRoot));
const promptSets = {
  keyboard: [{ action: 'Select', input: 'Arrows' }, { action: 'Confirm', input: 'Enter' }, { action: 'Back', input: 'Escape' }],
  controller: [{ action: 'Select', input: 'Stick / D-pad' }, { action: 'Confirm', input: 'X' }, { action: 'Back', input: 'B' }],
  touch: [{ action: 'Select', input: 'Tap' }, { action: 'Back', input: 'Back' }],
} as const;
prompts.set(promptSets.keyboard);
interactiveControls.append(promptRoot);

const interactiveDetail = document.createElement('section');
interactiveDetail.id = 'interactive-detail';
const interactionStatusRoot = document.createElement('p');
interactionStatusRoot.id = 'interaction-status';
const interactionStatus = own(mountStatus(interactionStatusRoot));
interactionStatus.set('information', 'Choose a row or open the confirmation.');
const openConfirmation = own(createActionButton({
  id: 'open-confirmation', label: 'Replace current progress', intent: 'danger',
  onActivate: () => {
    void confirmation.confirm({
      title: 'Replace current progress?',
      body: 'Loading this record replaces unsaved session progress.',
      detail: 'The stored record is not changed by cancelling.',
      confirmLabel: 'Replace progress',
      intent: 'danger',
    }).then((confirmed) => interactionStatus.set(confirmed ? 'success' : 'information', confirmed ? 'Replacement confirmed.' : 'Replacement cancelled.'));
  },
}));
glowTargets.push(openConfirmation.element);

const scrollFrame = document.createElement('div');
scrollFrame.className = 'gallery-scroll-frame';
const above = document.createElement('div');
const scroll = document.createElement('div');
scroll.id = 'gallery-scroll';
scroll.tabIndex = 0;
scroll.setAttribute('aria-label', 'Scrollable component examples');
const scrollList = document.createElement('div');
scrollList.id = 'gallery-scroll-list';
for (let index = 0; index < 10; index += 1) {
  const row = own(createListRow({ id: `scroll-row-${index}`, label: `Archive entry ${index + 1}`, trailing: String(index + 1) }));
  scrollList.append(row.element);
}
scroll.append(scrollList);
const below = document.createElement('div');
scrollFrame.append(above, scroll, below);
const scrollAffordance = own(mountScrollAffordance(scroll, above, below));
const lifecycle = document.createElement('p');
lifecycle.id = 'gallery-lifecycle';
interactiveDetail.append(interactionStatusRoot, openConfirmation.element, openConfirmation.reason, scrollFrame, lifecycle);
lane.append(interactiveControls, interactiveDetail);
const tabs = own(mountTabs(tabsRoot));
glowTargets.push(...Array.from(tabsRoot.querySelectorAll<HTMLElement>('[role="tab"]')));

const confirmationParts = createConfirmationDialog('gallery-confirmation');
document.body.append(confirmationParts.dialog);
let boundaryClears = 0;
const confirmation = own(mountConfirmation(confirmationParts, { clearHeldInputs: () => { boundaryClears += 1; } }));
const mainNavigation = own(new MenuNavigation(interactiveControls, () => interactionStatus.set('information', 'Back requested.')));
const confirmationNavigation = own(new MenuNavigation(confirmationParts.dialog, () => confirmationParts.cancel.click()));
own(mountWindowskin());
let lifecycleCycles = 0;

function updateLifecycle(): void {
  lifecycle.textContent = `Active owners: ${owned.size} · Lifecycle cycles: ${lifecycleCycles} · Input boundaries cleared: ${boundaryClears}`;
}
updateLifecycle();

const neutral: Readonly<PadInput> = Object.freeze({ direction: null, burst: false, interact: false, cancel: false, menu: false });
let disposed = false;
window.__UI_GALLERY__ = {
  snapshot: () => ({
    activeControllers: owned.size,
    boundaryClears,
    busyActivations,
    confirmationPending: confirmation.pending,
    glowEnabled,
    lifecycleCycles,
    selectedTab: tabs.selectedId,
    scrollState: scrollAffordance.state,
  }),
  sample(direction, interact = false, cancel = false): void {
    const input: Readonly<PadInput> = { direction, burst: false, interact, cancel, menu: false };
    const navigation = confirmationParts.dialog.open ? confirmationNavigation : mainNavigation;
    navigation.sample(input, 400);
    navigation.sample(neutral, 16);
  },
  setPrompts(family): void { prompts.set(promptSets[family]); },
  setGlow(enabled): void {
    applyGlow(enabled);
    glowToggle.element.textContent = enabled ? 'Disable optional glow pulse' : 'Enable optional glow pulse';
    glowNote.textContent = enabled
      ? 'Optional pulse is on. It animates one opacity-only glow layer.'
      : 'Optional pulse is off. Selection and meter meaning remain unchanged.';
  },
  cycleLifecycle(count): void {
    if (!Number.isInteger(count) || count < 0 || count > 100) throw new Error('Lifecycle cycle count must be an integer from 0 to 100.');
    for (let index = 0; index < count; index += 1) {
      const fixture = document.createElement('div');
      const up = document.createElement('div');
      const down = document.createElement('div');
      document.body.append(fixture, up, down);
      const controller = own(mountScrollAffordance(fixture, up, down));
      disposeOwned(controller);
      fixture.remove(); up.remove(); down.remove();
      lifecycleCycles += 1;
    }
    updateLifecycle();
  },
  async tryOverlap(): Promise<string> {
    try {
      await confirmation.confirm({ title: 'Second request', body: 'This request must be rejected.', confirmLabel: 'Confirm' });
      return 'unexpectedly accepted';
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  },
  dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const owner of [...owned].reverse()) disposeOwned(owner);
    delete window.__UI_GALLERY__;
  },
};

window.addEventListener('pagehide', () => window.__UI_GALLERY__?.dispose(), { once: true });
document.fonts.ready.then(() => { if (!disposed) scrollAffordance.refresh(); }).catch(() => undefined);
