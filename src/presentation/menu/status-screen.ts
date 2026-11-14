/**
 * The Status screen (decision 0014 M5.4d-2, Ariel's answer: one member per page). The party list on the left picks the
 * page; Q/E or the shoulder buttons step through it. The page shows the portrait, HP and battle stats, reach in words,
 * and where the member stands. Level, experience and equipment arrive with M5.6 and M5.9–M5.10.
 */
import { createDetail, createHelpLine, createList, menuWindow } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';
import { exposureLines } from './formation-screen';
import { cellName } from '../../domain/party';
import type { PartyState } from '../../domain/party';

export const STATUS_SCREEN = 'builtin:status';

export interface StatusMember {
  readonly id: string; readonly name: string;
  readonly hp: number; readonly attack: number; readonly defense: number; readonly speed: number;
  readonly reach: 'melee' | 'reach' | 'ranged';
}
export interface StatusOptions {
  readonly members: readonly StatusMember[];
  readonly party: () => PartyState;
  readonly portrait: (id: string) => HTMLElement | null;
}

export const REACH_WORDS = {
  melee: 'Melee: front-facing enemies only.',
  reach: 'Reach: front-facing enemies, or the one directly behind them.',
  ranged: 'Ranged: any enemy.',
} as const;

export function statusScreen(_context: ScreenContext, options: StatusOptions): MenuScreen {
  const party = options.party();
  const members = party.active.map(id => options.members.find(m => m.id === id)).filter((m): m is StatusMember => !!m);
  const element = document.createElement('div');
  element.className = 'menu-status';
  const help = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help' });
  const listWindow = menuWindow({ title: 'Party', box: { x: 0, y: 50, w: 200, h: 310 } });
  const pageWindow = menuWindow({ box: { x: 200, y: 50, w: 440, h: 310 }, className: 'menu-status-page' });
  const line = createHelpLine(element, 'Q/E: next member.');
  help.body.append(line.element);
  const detail = createDetail();
  pageWindow.body.append(detail.element);
  const show = (id: string) => {
    const m = members.find(member => member.id === id);
    if (!m) return;
    const cell = party.cells[m.id]!;
    detail.set({
      picture: options.portrait(m.id), heading: m.name,
      lines: [`HP ${m.hp} / ${m.hp}`, `Attack ${m.attack} · Defense ${m.defense} · Speed ${m.speed}`, REACH_WORDS[m.reach],
        `Stands in the ${cellName(cell)}.`, ...exposureLines(party, m.id)],
    });
  };
  const list = createList({
    label: 'Party',
    entries: members.map(m => ({ id: m.id, label: m.name, detail: `HP ${m.hp}`, help: `${m.name}'s status. Q/E: next member.` })),
    onChoose: () => undefined,
    onFocus: show,
  });
  listWindow.body.append(list.element);
  element.append(help.element, listWindow.element, pageWindow.element);
  return {
    element,
    focusFirst: () => list.focus(),
    step: delta => {
      const index = Math.max(0, members.findIndex(m => m.id === list.focusedId));
      list.focus(members[(index + delta + members.length) % members.length]!.id);
    },
    dispose: () => element.remove(),
  };
}
