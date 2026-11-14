/**
 * The Formation screen (decision 0014 M5.4d-2). The party list on the left, the 3 × 3 grid on the right (front column
 * on the left, facing the enemies as in battle) and the highlighted member's detail below.
 *
 * Ariel's answers: choose a member, then a cell; an occupied cell swaps the two. Changes are a draft: Done saves the
 * whole layout as one session transaction, and leaving with changes asks before discarding them. Q/E (or the shoulder
 * buttons) flip the preview between an ordinary fight and a back attack; the grid shows shield pips for that view and
 * the detail says both in words.
 */
import { createConfirm, createDetail, createGrid, createHelpLine, createList, menuWindow } from './blocks';
import type { GridCellView, ListEntry } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';
import { DEPTH_NAMES, cellName, moveMember, shieldWords, shieldsAt } from '../../domain/party';
import type { GridCell, PartyState } from '../../domain/party';

export const FORMATION_SCREEN = 'builtin:formation';

export interface FormationMember { readonly id: string; readonly name: string; readonly reach: 'melee' | 'reach' | 'ranged' }
export interface FormationOptions {
  readonly members: readonly FormationMember[];
  readonly party: () => PartyState;
  /** A picture of the member for its grid cell, or null. */
  readonly picture: (id: string) => HTMLElement | null;
  /** Save the formation as one transaction; false when the session refused it. */
  readonly commit: (cells: Readonly<Record<string, GridCell>>) => boolean;
}

const DONE = 'done';
const VIEW_TITLES = { front: 'Formation · ordinary fight', rear: 'Formation · back attack' } as const;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const same = (a: PartyState, b: PartyState) => a.active.every(id => a.cells[id]!.lane === b.cells[id]!.lane && a.cells[id]!.depth === b.cells[id]!.depth);

/** Both views of a member's cell in words, shared with the Status screen. */
export function exposureLines(party: PartyState, id: string): string[] {
  return [`In an ordinary fight: ${shieldWords(shieldsAt(party, id, 'front'))}.`, `In a back attack: ${shieldWords(shieldsAt(party, id, 'rear'))}.`];
}

export function formationScreen(context: ScreenContext, options: FormationOptions): MenuScreen {
  const saved = options.party();
  let draft: PartyState = saved;
  let view: 'front' | 'rear' = 'front';
  let moving: string | null = null;
  const name = (id: string) => options.members.find(m => m.id === id)?.name ?? id;

  const element = document.createElement('div');
  element.className = 'menu-formation';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const listWindow = menuWindow({ title: 'Party', box: { x: 0, y: 50, w: 200, h: 200 } });
  const gridWindow = menuWindow({ title: VIEW_TITLES.front, box: { x: 200, y: 50, w: 440, h: 200 }, className: 'menu-formation-grid' });
  const detailWindow = menuWindow({ box: { x: 0, y: 250, w: 640, h: 110 }, className: 'menu-formation-detail' });
  const fallback = 'Choose a member to move. Q/E: fight or back attack.';
  const line = createHelpLine(element, fallback);
  help.body.append(line.element);
  const detail = createDetail();
  detailWindow.body.append(detail.element);

  const describe = (id: string | null) => {
    if (!id || !draft.cells[id]) { detail.set({ heading: 'Done', lines: [same(draft, saved) ? 'No changes.' : 'Save this formation. The next battle uses it.'] }); return; }
    detail.set({ heading: name(id), lines: [`${capital(cellName(draft.cells[id]!))}.`, ...exposureLines(draft, id)] });
  };
  const entries = (): ListEntry[] => [
    ...draft.active.map(id => ({ id, label: name(id), detail: capital(DEPTH_NAMES[draft.cells[id]!.depth - 1]!), help: `Move ${name(id)}.` })),
    { id: DONE, label: 'Done', help: same(draft, saved) ? 'Leave the formation unchanged.' : 'Save the formation.' },
  ];
  const cells = (): GridCellView[] => [1, 2, 3].flatMap(lane => [1, 2, 3].map(depth => {
    const id = draft.active.find(m => draft.cells[m]!.lane === lane && draft.cells[m]!.depth === depth) ?? null;
    const where = capital(cellName({ lane, depth }));
    const shields = id ? shieldsAt(draft, id, view) : 0;
    const help = moving ? (id && id !== moving ? `Swap ${name(moving)} with ${name(id)}.` : `Place ${name(moving)} here.`) : id ? `Move ${name(id)}.` : 'Choose a member first.';
    return { lane, depth, occupant: id && name(id), label: id ? `${where}: ${name(id)}, ${shieldWords(shields)}` : `${where}: empty`, picture: id ? options.picture(id) : null, pips: shields, marked: id !== null && id === moving, help };
  }));

  const list = createList({ label: 'Party', entries: entries(), onChoose: id => (id === DONE ? done() : pick(id)), onFocus: id => describe(id === DONE ? null : id) });
  listWindow.body.append(list.element);
  const grid = createGrid({
    label: 'Party grid',
    onChoose: (lane, depth) => {
      if (moving) { place({ lane, depth }); return; }
      const id = draft.active.find(m => draft.cells[m]!.lane === lane && draft.cells[m]!.depth === depth);
      if (id) pick(id); // Pointer and touch: tapping a member starts moving it.
    },
    onFocus: (lane, depth) => describe(draft.active.find(m => draft.cells[m]!.lane === lane && draft.cells[m]!.depth === depth) ?? moving),
  });
  gridWindow.body.append(grid.element);
  element.append(help.element, listWindow.element, gridWindow.element, detailWindow.element);

  // The discard question sits over the screen; while it is open the rest is inert.
  // Its window belongs to the screen from the start, hidden, so the skin painter knows it and paints it when it opens
  // (a window added later would stay plain).
  const questionWindow = menuWindow({ title: 'Discard changes?', box: { x: 170, y: 120, w: 300, h: 120 }, className: 'menu-formation-confirm' });
  questionWindow.element.hidden = true;
  element.append(questionWindow.element);
  let question = false;
  const ask = () => {
    const confirm = createConfirm({ question: 'The formation has changed. Leave without saving?', yes: 'Discard changes', no: 'Keep editing', onAnswer: yes => { close(); if (yes) context.back(); else list.focus(DONE); } });
    questionWindow.body.replaceChildren(confirm.element);
    for (const w of [help, listWindow, gridWindow, detailWindow]) w.element.inert = true;
    questionWindow.element.hidden = false;
    question = true;
    confirm.focus();
  };
  const close = () => {
    questionWindow.element.hidden = true; questionWindow.body.replaceChildren(); question = false;
    for (const w of [help, listWindow, gridWindow, detailWindow]) w.element.inert = false;
  };

  const render = () => { list.setEntries(entries()); grid.setCells(cells()); gridWindow.element.querySelector('h2')!.textContent = VIEW_TITLES[view]; };
  function pick(id: string): void {
    moving = id;
    render();
    line.set(`Choose a cell for ${name(id)}. A member there swaps places.`);
    grid.focus(draft.cells[id]!.lane, draft.cells[id]!.depth);
  }
  function place(cell: GridCell): void {
    const id = moving!;
    draft = moveMember(draft, id, cell);
    moving = null;
    render();
    line.set(fallback);
    list.focus(id);
  }
  function done(): void {
    if (same(draft, saved)) { context.back(); return; }
    if (options.commit(draft.cells)) context.back();
    else line.set('The formation could not be saved. Nothing changed.');
  }
  render();

  return {
    element,
    focusFirst: () => list.focus(),
    step: () => { view = view === 'front' ? 'rear' : 'front'; render(); const focusedId = list.focusedId; if (focusedId) describe(focusedId === DONE ? null : focusedId); },
    cancel: () => {
      if (question) { close(); list.focus(DONE); return true; }
      if (moving) { const id = moving; moving = null; render(); line.set(fallback); list.focus(id); return true; }
      if (!same(draft, saved)) { ask(); return true; }
      return false;
    },
    dispose: () => element.remove(),
  };
}
