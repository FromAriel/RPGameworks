export type ToolTab = 'options' | 'debug';

/** Page chrome only. Never reads or mutates world state. */
export function mountPlayerShell(
  stage: HTMLElement,
  onInputBoundary: () => void,
  onChange: () => void,
  canOpen: () => boolean,
): { readonly debugVisible: boolean; readonly ownsInput: boolean; close(): void; dispose(): void } {
  const get = <T extends HTMLElement>(id: string): T => {
    const value = document.getElementById(id);
    if (!value) throw new Error(`Missing player shell element: ${id}`);
    return value as T;
  };
  const panel = get<HTMLElement>('tools-panel');
  const toggle = get<HTMLButtonElement>('tools-toggle');
  const settings = get<HTMLDetailsElement>('controller-settings');
  const touch = get<HTMLElement>('touch-controls');
  const touchEnabled = get<HTMLInputElement>('touch-enabled');
  const tabs = [get<HTMLButtonElement>('options-tab'), get<HTMLButtonElement>('debug-tab')];
  const sections = [get<HTMLElement>('options-panel'), get<HTMLElement>('debug-panel')];
  const coarse = window.matchMedia('(pointer: coarse)');
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };
  let tab: ToolTab = 'options';
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

  function select(next: ToolTab, focus = true): void {
    onInputBoundary();
    tab = next;
    get('tools-title').textContent = next === 'options' ? 'Settings' : 'Debug';
    if (next !== 'options') settings.open = false;
    tabs.forEach((button, i) => {
      const selected = i === (next === 'options' ? 0 : 1);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      sections[i]!.hidden = !selected;
    });
    if (focus) tabs[next === 'options' ? 0 : 1]!.focus({ preventScroll: true });
    onChange();
  }
  function open(next: ToolTab): void {
    if (!canOpen() || document.querySelector('dialog[open]')) return;
    panel.hidden = false;
    document.body.classList.add('tools-open');
    toggle.setAttribute('aria-expanded', 'true');
    select(next);
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
  toggle.addEventListener('click', () => open('options'), options);
  get('tools-close').addEventListener('click', close, options);
  get('tools-resume').addEventListener('click', close, options);
  tabs.forEach((button, i) => {
    button.addEventListener('click', () => select(i === 0 ? 'options' : 'debug'), options);
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      select(event.key === 'Home' ? 'options' : event.key === 'End' ? 'debug' : i === 0 ? 'debug' : 'options');
    }, options);
  });
  // Entering the panel releases gameplay immediately, including between two frame polls.
  panel.addEventListener('focusin', onInputBoundary, options);
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
    } else if (panel.hidden) open('options'); else close();
  }, { ...options, capture: true });
  return {
    get debugVisible() { return !panel.hidden && tab === 'debug'; },
    get ownsInput() { return !panel.hidden && panel.contains(document.activeElement); },
    close,
    dispose(): void {
      if (disposed) return;
      disposed = true; lifetime.abort();
      panel.hidden = true; settings.open = false;
      document.body.classList.remove('tools-open');
      toggle.setAttribute('aria-expanded', 'false');
    },
  };
}
