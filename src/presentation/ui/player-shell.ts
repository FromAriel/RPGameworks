/**
 * The side panel shows one thing at a time (decision 0016 U2.3b): Controller setup, opened from the menu's Config
 * screen, or Debug, a developer readout opened with F2. Player settings live in Config.
 */
export type ToolTab = 'controller' | 'debug';
const TITLES: Record<ToolTab, string> = { controller: 'Controller setup', debug: 'Debug' };

/** Page chrome only. Never reads or mutates world state. */
export function mountPlayerShell(
  stage: HTMLElement,
  onInputBoundary: () => void,
  onChange: () => void,
  canOpen: () => boolean,
  onGameMenu?: () => void,
): { readonly debugVisible: boolean; readonly ownsInput: boolean; close(): void; open(tab: ToolTab): void; dispose(): void } {
  const get = <T extends HTMLElement>(id: string): T => {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing player shell element: ${id}`);
    return value as T;
  };
  const panel = get<HTMLElement>('tools-panel');
  const toggle = get<HTMLButtonElement>('tools-toggle');
  const settings = get<HTMLDetailsElement>('controller-settings');
  const sections: Record<ToolTab, HTMLElement> = { controller: get('controller-section'), debug: get('debug-panel') };
  const touch = get<HTMLElement>('touch-controls');
  const touchEnabled = get<HTMLInputElement>('touch-enabled');
  const coarse = window.matchMedia('(pointer: coarse)');
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  let tab: ToolTab = 'controller';
  let touchOverride = false;
  let disposed = false;

  function applyTouch(): void {
    touch.hidden = !touchEnabled.checked;
    onInputBoundary();
  }
  touchEnabled.checked = coarse.matches;
  touch.hidden = !touchEnabled.checked;
  touchEnabled.addEventListener('change', () => { touchOverride = true; applyTouch(); }, options);
  coarse.addEventListener('change', () => {
    if (!touchOverride) { touchEnabled.checked = coarse.matches; applyTouch(); }
  }, options);

  function open(next: ToolTab): void {
    if (!canOpen() || document.querySelector('dialog[open]')) return;
    tab = next;
    panel.dataset.mode = next;
    get('tools-title').textContent = TITLES[next];
    for (const [id, section] of Object.entries(sections)) section.hidden = id !== next;
    // The controller form is always shown here; its open state is what pauses gameplay while the player configures.
    settings.open = next === 'controller';
    panel.hidden = false;
    document.body.classList.add('tools-open');
    toggle.setAttribute('aria-expanded', 'true');
    (next === 'controller' ? get('controller-activate') : panel).focus({ preventScroll: true });
    onChange();
  }
  function close(): void {
    if (panel.hidden) return;
    onInputBoundary();
    settings.open = false;
    panel.hidden = true;
    document.body.classList.remove('tools-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (canOpen() && !document.querySelector('dialog[open]')) stage.focus({ preventScroll: true });
    onChange();
  }
  toggle.addEventListener('click', () => { if (onGameMenu && canOpen()) onGameMenu(); else open('controller'); }, options);
  get('tools-close').addEventListener('click', close, options);
  get('tools-resume').addEventListener('click', close, options);
  // Entering the panel releases gameplay immediately, including between two frame polls.
  panel.addEventListener('focusin', event => {
    if (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget)) onInputBoundary();
  }, options);
  panel.addEventListener('pointerdown', (event) => {
    onInputBoundary();
    if (!(event.target instanceof HTMLElement) || !event.target.closest('button, input, select, textarea, a, summary')) {
      panel.focus({ preventScroll: true });
    }
  }, options);
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || document.hidden || !document.hasFocus()) return;
    if (event.code !== 'Escape' && event.code !== 'F2') return;
    if (document.querySelector('dialog[open]')) return; // Dialogue/travel owns Escape.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && (focused.isContentEditable || focused.closest('input, select, textarea'))) return;
    if (!canOpen()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.code === 'F2') {
      if (!panel.hidden && tab === 'debug') close(); else open('debug');
    } else if (panel.hidden) { if (onGameMenu) onGameMenu(); else open('controller'); } else close();
  }, { ...options, capture: true });
  return {
    get debugVisible() { return !panel.hidden && tab === 'debug'; },
    get ownsInput() { return !panel.hidden && panel.contains(document.activeElement); },
    close, open,
    dispose(): void {
      if (disposed) return;
      disposed = true; lifetime.abort();
      panel.hidden = true; settings.open = false;
      document.body.classList.remove('tools-open');
      toggle.setAttribute('aria-expanded', 'false');
    },
  };
}
