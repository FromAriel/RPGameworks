import './presentation/ui/tokens.css';
import './presentation/ui/components.css';
import './style.css';
import './presentation/ui/inventory.css';
import './presentation/ui/save-menu.css';
import { loadItemCatalog } from './platform/item-loader';
import { loadFactCatalog } from './platform/fact-loader';
import { loadQuestCatalog } from './platform/quest-loader';
import { SessionState } from './domain/session';
import { SessionController } from './runtime/session-controller';
import { SaveService } from './runtime/save-service';
import { IndexedDbSaveRepository } from './platform/save-repository';
import { loadStateIndex } from './platform/state-index-loader';
import { MenuNavigation } from './presentation/ui/menu-navigation';
import { createConfirmationDialog, type ConfirmationDialogParts } from './presentation/ui/components';
import './presentation/skin/windowskin.css';
import { mountWindowskin } from './presentation/ui/windowskin';
import { mountPlayerShell } from './presentation/ui/player-shell';
import { PageErrorLog } from './platform/page-errors';
import { focusGameWhenIdle } from './platform/input';
import { GamepadController } from './platform/gamepad';
import { mountControllerSettings } from './presentation/ui/controller-settings';
import type { PromptEntry } from './presentation/ui/components';
import { loadSelectedMap } from './platform/map-loader';
import type { FoundationHandle } from './runtime-types';

function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}

const stage = required<HTMLElement>('#stage');
const status = required<HTMLElement>('#status');
const error = required<HTMLElement>('#error');
const effects = required<HTMLInputElement>('#effects');
const diagnostics = required<HTMLElement>('#diagnostics');
const mapPreview = required<HTMLSelectElement>('#map-preview');
const rendererLabel = required<HTMLElement>('#render-label');
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
const appLifetime = new AbortController();
effects.checked = !media.matches;
let handle: FoundationHandle | null = null;
let saveService:SaveService|null=null;
let timer: ReturnType<typeof setInterval> | null = null;
let disposed = false;
let failed = false;
let lastStatus = '';
let artWarning = '';
let startupFocusPending = true;
const pageErrors = new PageErrorLog();
const pageErrorNotice = required<HTMLElement>('#page-error-notice');
const controller = new GamepadController();
const controllerPanel = required<HTMLDetailsElement>('#controller-settings');
const loadingNotice = required<HTMLElement>('#loading-notice');
const shell = mountPlayerShell(stage, () => { handle?.clearInput(); controller.reset(); }, () => drawDiagnostics(),
  () => !handle || handle.snapshot().inputMode === 'exploration',
  () => { if (handle?.snapshot().phase === 'ready' && !failed) { shell.close(); handle.openInventory(); } else shell.open('options'); });
const controllerUI = mountControllerSettings(controllerPanel, controller, stage, () => ({
  build: __BUILD_ID__, version: __APP_VERSION__,
  runtimePhase: handle?.snapshot().phase ?? (failed ? 'error' : 'booting'),
  fatalGameError: failed ? error.textContent : null,
  pageErrors: pageErrors.snapshot(),
}), () => shell.close());

const toolsNavigation = new MenuNavigation(required<HTMLElement>('#tools-panel'), () => {
  if (controllerPanel.open) { controllerPanel.open = false; controller.reset(); controllerPanel.querySelector<HTMLElement>('summary')?.focus(); }
  else shell.close();
});
// The Save/Load confirmation frame must exist before the compositor snapshots
// [data-window-skin] surfaces, or it would never receive the shared skin.
const saveConfirmation: ConfirmationDialogParts = createConfirmationDialog('save-confirmation');
document.body.append(saveConfirmation.dialog);
const windowSkin = mountWindowskin();
function inventoryPrompt(): PromptEntry[] {
  const buttons = controller.settings.buttons;
  const label = (index: number): string => index === -1 ? 'unassigned' : `button ${index}`;
  return [
    { action: 'select', input: 'Arrows / stick' },
    { action: 'inspect', input: `E / Enter / ${label(buttons.interact)}` },
    { action: 'back', input: `Escape / ${label(buttons.cancel)}` },
    { action: 'menu', input: `I / ${label(buttons.menu)}` },
  ];
}

required<HTMLElement>('#build-label').textContent = `v${__APP_VERSION__} · ${__BUILD_ID__}`;

function reportError(message: string): void {
  failed = true;
  loadingNotice.hidden = true;
  error.hidden = false;
  error.textContent = message;
  status.textContent = 'The game could not continue. See the on-screen error.';
}

function drawDiagnostics(): void {
  if (disposed) return;
  controllerUI.refresh();
  if (!handle) return;
  const snapshot = handle.snapshot();
  if (snapshot.phase === 'ready' && !failed) {
    loadingNotice.hidden = true;
    if (startupFocusPending && !document.hidden) {
      startupFocusPending = false;
      focusGameWhenIdle(stage);
    }
    const message = artWarning || (snapshot.inputMode === 'inventory' ? 'Inventory open. Inspect items or open the Journal.' :snapshot.inputMode==='save'?'Save menu open. Choose a manual slot or return to Inventory.': snapshot.inputMode === 'message'||snapshot.inputMode==='dialogue' ? 'Conversation open. Advance, choose a response, or close it to resume exploring.' :
      snapshot.inputMode === 'transition' ? 'Preparing the destination. Cancel to remain in this room.' :
      snapshot.inputMode === 'transition-error' ? 'Travel failed safely. Retry or stay in your current room.' :
      snapshot.interactionTarget ? 'Ready. Within reach. Press E / Enter or the configured interaction button.' :
      'Ready. Explore, face an NPC or plaque, and interact. Step into a lit doorway to change rooms.');
    if (message !== lastStatus) { status.textContent = message; lastStatus = message; }
  }
  required<HTMLElement>('#map-title').textContent = snapshot.mapName;
  mapPreview.value = snapshot.mapId;
  mapPreview.disabled = snapshot.inputMode !== 'exploration';
  rendererLabel.textContent = snapshot.renderer.toUpperCase();
  if (!shell.debugVisible) return; // Hidden telemetry does not rebuild DOM at 4 Hz.
  const rows: [string, string][] = [
    ['Renderer', `${snapshot.renderer} / ${snapshot.phaser}`],
    ['Map', snapshot.mapName],
    ['Map cells', `${snapshot.mapWidth} × ${snapshot.mapHeight}`],
    ['Resident maps', String(snapshot.loadedMaps)],
    ['Logical view', '320 × 192'],
    ['Player tile', `${snapshot.actorTile.x}, ${snapshot.actorTile.y}`],
    ['Active scenes', String(snapshot.activeScenes)],
    ['Input owner', snapshot.inputMode],
    ['Room transfers', String(snapshot.transitions)],
    ['Travel failures / cancels', `${snapshot.failedTransitions} / ${snapshot.cancelledTransitions}`],
    ['Display objects', String(snapshot.displayObjects)],
    ['Particles', `${snapshot.aliveParticles} / 64`],
    ['Scene starts / stops', `${snapshot.starts} / ${snapshot.stops}`],
    ['State bindings / subscribers',`${snapshot.activeObjectBindings} / ${snapshot.sessionSubscribers}`],
    ['Pending save operations',String(snapshot.pendingSaveOperations)],
    ['Observed FPS', Number.isFinite(snapshot.fps) ? String(snapshot.fps) : '—'],
  ];
  // Refreshing at 4 Hz avoids rebuilding UI every animation frame.
  diagnostics.replaceChildren(...rows.map(([name, value]) => {
    const row = document.createElement('div');
    const label = document.createElement('dt');
    const detail = document.createElement('dd');
    label.textContent = name;
    detail.textContent = value;
    row.append(label, detail);
    return row;
  }));
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  if (timer) clearInterval(timer);
  appLifetime.abort();
  handle?.destroy();
  saveService?.close();saveService=null;
  controllerUI.dispose();
  toolsNavigation.dispose();
  shell.dispose();
  windowSkin.dispose();
  controller.dispose();
  handle = null;
  delete window.__RPGAMEWORKS__;
}

function reportPageIssue(kind: string, reason: unknown, source = ''): void {
  pageErrors.record(kind, reason, source);
  const latest = pageErrors.snapshot();
  pageErrorNotice.hidden = false;
  pageErrorNotice.textContent = `Page error observed (${latest.count}); source is not attributed to the game. ` +
    `Game readiness is reported separately. Latest: ${latest.last?.message ?? 'unknown'}. ` +
    'Controller configuration includes a diagnostic report. Original errors remain in the browser console.';
}
// Do not call preventDefault: preserve the browser's original error and stack.
// Explicit startup, asset and scene boundaries still report fatal game failures.
window.addEventListener('error', (event) => reportPageIssue('error', event.error ?? event.message, event.filename), { signal: appLifetime.signal });
window.addEventListener('unhandledrejection', (event) => reportPageIssue('unhandledrejection', event.reason), { signal: appLifetime.signal });
media.addEventListener('change', (event) => {
  if (event.matches) {
    effects.checked = false;
    effects.dispatchEvent(new Event('change'));
  }
}, { signal: appLifetime.signal });
// Retain the running application in a back/forward cache entry; dispose otherwise.
window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { signal: appLifetime.signal });
import.meta.hot?.dispose(dispose);

async function start(): Promise<void> {
  try {
    const content = await loadSelectedMap(new URL(import.meta.env.BASE_URL, document.baseURI), new URLSearchParams(location.search), appLifetime.signal);
    if (disposed) return;
    for (const entry of content.game.maps) {
      const option = document.createElement('option');
      option.value = entry.id; option.textContent = entry.id;
      mapPreview.append(option);
    }
    mapPreview.value = content.map.id;
    mapPreview.disabled = false;
    mapPreview.addEventListener('change', () => {
      const url = new URL(location.href);
      url.searchParams.set('map', mapPreview.value); url.searchParams.delete('spawn');
      location.assign(url);
    }, { signal: appLifetime.signal });
    required<HTMLElement>('#map-title').textContent = content.map.name;
    const base=new URL(import.meta.env.BASE_URL,document.baseURI);
    const [catalog,facts,quests,stateIndex]=await Promise.all([loadItemCatalog(base,content,appLifetime.signal),loadFactCatalog(base,content,appLifetime.signal),loadQuestCatalog(base,content,appLifetime.signal),loadStateIndex(base,content.game,appLifetime.signal)]);
    if(JSON.stringify(quests.map(quest=>quest.id))!==JSON.stringify(stateIndex.questIds??[]))throw new Error('Quest catalog does not match the save state index');
    const session = new SessionController(new SessionState({items:catalog,facts,quests}));
    saveService=new SaveService({gameId:content.game.id,saveCompatibilityVersion:content.game.saveCompatibilityVersion??1,index:stateIndex},new IndexedDbSaveRepository());
    const { createFoundation } = await import('./presentation/foundation');
    if (disposed) {saveService.close();saveService=null;return;}
    handle = createFoundation({
      session,
      inventory: required<HTMLDialogElement>('#inventory-dialog'),
      saveDialog:required<HTMLDialogElement>('#save-dialog'),
      saveConfirmation,
      saves:saveService,
      base,
      inventoryPrompt,
      openSettings: () => shell.open('options'),
      closeTools: () => shell.close(),
      toolsOwnInput: () => shell.ownsInput || controllerPanel.open,
      updateTools: delta => {
        const active = !document.hidden && document.hasFocus();
        const pad = controller.poll(active, 'menu');
        if (active) toolsNavigation.sample(pad,delta); else toolsNavigation.reset();
      },
      stage,
      controls: required<HTMLElement>('.controls'),
      burst: required<HTMLButtonElement>('#burst'),
      restart: required<HTMLButtonElement>('#restart'),
      effects,
      dialog: required<HTMLDialogElement>('#interaction-dialog'),
      interact: required<HTMLButtonElement>('#interact'),
      onArtWarning: message => { artWarning = message ?? ''; drawDiagnostics(); },
      gamepad: controller,
      canPlay: () => !controllerPanel.open && !shell.ownsInput,
      canRestart: () => !controllerPanel.open,
    }, reportError, content);
    const running = handle;
    window.__RPGAMEWORKS__ = Object.freeze({ snapshot: () => running.snapshot() });
    drawDiagnostics();
  } catch (cause) {
    if (disposed) return;
    reportError(cause instanceof Error ? cause.message : String(cause));
  }
}

timer = setInterval(drawDiagnostics, 250);
void start();
