/**
 * Shared menu blocks (decision 0016 U2.0). Every menu screen is built from these, so it gets the W1 skin, the ▶ cursor,
 * keyboard and controller movement (MenuNavigation moves focus between rows), touch (whole rows are buttons) and
 * screen-reader names and descriptions without extra work. Blocks only draw and report choices; screens decide what a
 * choice does.
 *
 * Coordinates are logical menu pixels in the 640 × 360 menu surface.
 */
export interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export interface MenuWindow { readonly element: HTMLElement; readonly body: HTMLElement }

/** A W1 skin window placed at `box`. Untitled windows (party cards, info) paint as a frame with no title gap. */
export function menuWindow({ title, box, className = '', surface = 'inventory' }: { title?: string; box: Box; className?: string; surface?: string }): MenuWindow {
  const element = document.createElement('section');
  element.className = `menu-window ${className}`.trim();
  element.dataset.windowSkin = 'frame';
  element.dataset.skinSurface = surface;
  Object.assign(element.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
  if (title) {
    const heading = document.createElement('header');
    heading.className = 'menu-window-heading';
    const h2 = document.createElement('h2');
    h2.dataset.skinTitle = '';
    h2.textContent = title;
    heading.append(h2);
    element.append(heading);
    element.setAttribute('aria-label', title);
  } else element.setAttribute('data-skin-untitled', '');
  const body = document.createElement('div');
  body.className = 'menu-window-body';
  element.append(body);
  return { element, body };
}

export interface ListEntry {
  readonly id: string;
  readonly label: string;
  /** Right-aligned detail such as a count or a cost. */
  readonly detail?: string;
  readonly enabled?: boolean;
  /** Shown in the help line while the row is highlighted, and read by screen readers. */
  readonly help?: string;
  /** An On/Off setting: the row becomes a switch, flipped by choosing it or by Left/Right. */
  readonly checked?: boolean;
}
export interface MenuList {
  readonly element: HTMLElement;
  setEntries(entries: readonly ListEntry[]): void;
  /** Focus a row by id or index (the first enabled row when absent). */
  focus(which?: string | number): void;
  readonly focusedId: string | null;
}

/** A vertical list of choices. Disabled rows can still be highlighted, so the help line can say why. */
export function createList({ label, entries, onChoose, onFocus }: {
  label: string; entries: readonly ListEntry[]; onChoose: (id: string) => void; onFocus?: (id: string) => void;
}): MenuList {
  const element = document.createElement('div');
  element.className = 'menu-list';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', label);
  let current: readonly ListEntry[] = [];
  const rows = (): HTMLButtonElement[] => [...element.querySelectorAll<HTMLButtonElement>('.menu-row')];
  element.addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLButtonElement>('.menu-row');
    if (!row || row.getAttribute('aria-disabled') === 'true') return;
    onChoose(row.dataset.id!);
  });
  element.addEventListener('focusin', event => {
    const row = (event.target as HTMLElement).closest<HTMLButtonElement>('.menu-row');
    if (!row) return;
    // Controller and arrow movement focus without scrolling; keep the highlighted row visible in a long list.
    row.scrollIntoView({ block: 'nearest' });
    onFocus?.(row.dataset.id!);
  });
  function setEntries(next: readonly ListEntry[]): void {
    const focused = handle.focusedId;
    current = next;
    element.replaceChildren(...next.map(entry => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'menu-row';
      row.dataset.id = entry.id;
      if (entry.help) { row.dataset.help = entry.help; row.setAttribute('aria-description', entry.help); }
      if (entry.checked !== undefined) { row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(entry.checked)); }
      if (entry.enabled === false) { row.setAttribute('aria-disabled', 'true'); row.setAttribute('data-focusable-disabled', ''); }
      const name = document.createElement('span'); name.className = 'menu-row-label'; name.textContent = entry.label;
      row.append(name);
      if (entry.detail !== undefined) { const detail = document.createElement('span'); detail.className = 'menu-row-detail'; detail.textContent = entry.detail; row.append(detail); }
      return row;
    }));
    // A redrawn list keeps the focused row (focusedId is set only while focus is inside the list).
    if (focused) handle.focus(focused);
  }
  const handle: MenuList = {
    element,
    setEntries,
    focus(which) {
      const all = rows();
      const row = typeof which === 'string' ? all.find(r => r.dataset.id === which)
        : typeof which === 'number' ? all[Math.max(0, Math.min(all.length - 1, which))]
          : all.find(r => r.getAttribute('aria-disabled') !== 'true') ?? all[0];
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest' });
    },
    get focusedId() {
      const active = document.activeElement;
      return active instanceof HTMLElement && element.contains(active) ? active.dataset.id ?? null : null;
    },
  };
  setEntries(entries);
  void current;
  return handle;
}

export interface DetailContent { readonly heading?: string; readonly lines?: readonly string[]; readonly picture?: HTMLElement | null }
/** Read-only detail for the highlighted entry; announced politely to screen readers. */
export function createDetail(): { readonly element: HTMLElement; set(content: DetailContent | null): void } {
  const element = document.createElement('div');
  element.className = 'menu-detail';
  element.setAttribute('aria-live', 'polite');
  return {
    element,
    set(content) {
      const parts: HTMLElement[] = [];
      if (content?.picture) parts.push(content.picture);
      if (content?.heading) { const h = document.createElement('h3'); h.textContent = content.heading; parts.push(h); }
      for (const line of content?.lines ?? []) { const p = document.createElement('p'); p.textContent = line; parts.push(p); }
      element.replaceChildren(...parts);
    },
  };
}

/**
 * The help line along the top of a screen. It follows the highlighted control's `data-help` within `scope`, and
 * falls back to the screen's own text.
 */
export function createHelpLine(scope: HTMLElement, fallback = ''): { readonly element: HTMLElement; set(text: string): void } {
  const element = document.createElement('p');
  element.className = 'menu-help-text';
  element.textContent = fallback;
  scope.addEventListener('focusin', event => {
    const help = (event.target as HTMLElement).closest<HTMLElement>('[data-help]')?.dataset.help;
    element.textContent = help ?? fallback;
  });
  return { element, set(text) { element.textContent = text; } };
}

export interface Tab { readonly id: string; readonly label: string }
export interface MenuTabs { readonly element: HTMLElement; readonly selected: string; select(id: string): void; step(delta: -1 | 1): void }
/** Categories along the top of a list. Q and E (or the shoulder buttons) step through them; clicking picks one. */
export function createTabs({ label, tabs, onChange, initial }: { label: string; tabs: readonly Tab[]; onChange: (id: string) => void; initial?: string }): MenuTabs {
  const element = document.createElement('div');
  element.className = 'menu-tabs';
  element.setAttribute('role', 'tablist');
  element.setAttribute('aria-label', label);
  let selected = initial && tabs.some(t => t.id === initial) ? initial : tabs[0]?.id ?? '';
  const buttons = tabs.map(tab => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'menu-tab'; button.setAttribute('role', 'tab');
    button.dataset.id = tab.id; button.textContent = tab.label; button.tabIndex = -1;
    button.addEventListener('click', () => handle.select(tab.id));
    return button;
  });
  element.append(...buttons);
  const paint = () => { for (const b of buttons) b.setAttribute('aria-selected', String(b.dataset.id === selected)); };
  const handle: MenuTabs = {
    element,
    get selected() { return selected; },
    select(id) { if (id === selected || !tabs.some(t => t.id === id)) return; selected = id; paint(); onChange(id); },
    step(delta) {
      if (!tabs.length) return;
      const index = tabs.findIndex(t => t.id === selected);
      handle.select(tabs[(index + delta + tabs.length) % tabs.length]!.id);
    },
  };
  paint();
  return handle;
}

export interface PartyMember {
  readonly id: string; readonly name: string; readonly level?: number;
  /** HP and MP are optional: outside battle the party has no lasting stats until the roster (M5.4d). */
  readonly hp?: number; readonly maxHp?: number; readonly mp?: number; readonly maxMp?: number;
  /** A portrait element (an image or canvas), or null for an empty frame. */
  readonly portrait?: HTMLElement | null;
  readonly enabled?: boolean; readonly help?: string;
}
/** Party cards: portrait, name, level, HP and MP. As a picker (`onChoose`), each card is a button. */
export function createPartyCards({ members, onChoose, label = 'Party' }: { members: readonly PartyMember[]; onChoose?: (id: string) => void; label?: string }): { readonly element: HTMLElement; focus(id?: string): void } {
  const element = document.createElement('div');
  element.className = 'menu-party';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', label);
  for (const m of members) {
    const card = document.createElement(onChoose ? 'button' : 'div');
    card.className = 'menu-card';
    card.dataset.id = m.id;
    if (card instanceof HTMLButtonElement) {
      card.type = 'button';
      if (m.enabled === false) { card.setAttribute('aria-disabled', 'true'); card.setAttribute('data-focusable-disabled', ''); }
      card.addEventListener('click', () => { if (m.enabled !== false) onChoose!(m.id); });
    }
    if (m.help) { card.dataset.help = m.help; card.setAttribute('aria-description', m.help); }
    const portrait = document.createElement('div');
    portrait.className = 'menu-card-portrait';
    portrait.setAttribute('aria-hidden', 'true');
    if (m.portrait) portrait.append(m.portrait);
    const lines = document.createElement('div');
    lines.className = 'menu-card-lines';
    const name = document.createElement('span'); name.className = 'menu-card-name'; name.textContent = m.name;
    const level = document.createElement('span'); level.textContent = m.level === undefined ? '' : `Lv ${m.level}`;
    lines.append(name, level);
    if (m.maxHp !== undefined) lines.append(stat('HP', m.hp ?? 0, m.maxHp, 'life'));
    if (m.maxMp !== undefined) lines.append(stat('MP', m.mp ?? 0, m.maxMp, 'magic'));
    card.setAttribute('aria-label', `${m.name}${m.level === undefined ? '' : `, level ${m.level}`}${m.maxHp === undefined ? '' : `, HP ${m.hp ?? 0} of ${m.maxHp}`}${m.maxMp === undefined ? '' : `, MP ${m.mp ?? 0} of ${m.maxMp}`}`);
    card.append(portrait, lines);
    element.append(card);
  }
  return {
    element,
    focus(id) {
      const cards = [...element.querySelectorAll<HTMLElement>('button.menu-card')];
      (cards.find(c => c.dataset.id === id) ?? cards[0])?.focus({ preventScroll: true });
    },
  };
}

function stat(key: string, value: number, maximum: number, tone: 'life' | 'magic'): HTMLElement {
  const row = document.createElement('span');
  row.className = 'menu-card-stat';
  const k = document.createElement('span'); k.className = 'menu-card-key'; k.textContent = key;
  const meter = document.createElement('span'); meter.className = 'menu-meter'; meter.dataset.tone = tone;
  if (tone === 'life' && value * 4 <= maximum) meter.dataset.low = '';
  const fill = document.createElement('span'); fill.style.width = `${maximum > 0 ? Math.round((Math.max(0, value) / maximum) * 100) : 0}%`;
  meter.append(fill);
  const n = document.createElement('span'); n.textContent = `${value}/${maximum}`;
  row.append(k, n, meter);
  return row;
}

/** A small label and value, such as the location or play time on the hub. */
export function createInfo(label: string, value: string): { readonly element: HTMLElement; set(value: string): void } {
  const element = document.createElement('p');
  const l = document.createElement('span'); l.className = 'menu-info-label'; l.textContent = label;
  const v = document.createElement('span'); v.textContent = value;
  element.append(l, document.createTextNode(' '), v);
  return { element, set(next) { v.textContent = next; } };
}

/** A yes/no question as a short list (decision 0016): the answer is reported once. */
export function createConfirm({ question, yes = 'Yes', no = 'No', onAnswer }: { question: string; yes?: string; no?: string; onAnswer: (yes: boolean) => void }): { readonly element: HTMLElement; focus(): void } {
  const element = document.createElement('div');
  const text = document.createElement('p'); text.textContent = question;
  let answered = false;
  const answer = (value: boolean) => { if (!answered) { answered = true; onAnswer(value); } };
  const list = createList({ label: question, entries: [{ id: 'yes', label: yes }, { id: 'no', label: no }], onChoose: id => answer(id === 'yes') });
  element.append(text, list.element);
  return { element, focus() { list.focus('no'); } };
}

/** A number between `min` and `max`; left and right change it (keyboard, controller), confirm reports it. */
export function createNumberPicker({ label, min, max, value, onConfirm }: { label: string; min: number; max: number; value: number; onConfirm: (value: number) => void }): { readonly element: HTMLElement; readonly value: number; focus(): void } {
  const element = document.createElement('div');
  element.className = 'menu-number';
  const name = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max); input.step = '1'; input.value = String(value);
  input.setAttribute('aria-label', label);
  const out = document.createElement('output'); out.textContent = String(value);
  input.addEventListener('input', () => { out.textContent = input.value; });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.code === 'KeyE') { event.preventDefault(); onConfirm(Number(input.value)); } });
  name.textContent = label;
  const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'menu-row'; ok.textContent = 'OK';
  ok.addEventListener('click', () => onConfirm(Number(input.value)));
  element.append(name, input, out, ok);
  return { element, get value() { return Number(input.value); }, focus() { input.focus({ preventScroll: true }); } };
}
