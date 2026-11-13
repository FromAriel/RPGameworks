import type { EncounterCatalog } from '../content/generated/encounters';
import type { PartyRoster } from '../content/generated/party';
import { GRID } from './battle-grid.mjs';
import type { Encounter } from './battle';

/**
 * The party outside battle (decision 0014 M5.4d). The roster is authored content; which members are in the party and
 * where each stands is session state, kept in saves (version 3). A battle's party is the active members at their
 * cells plus the encounter's guests; an encounter that authors its own party keeps it. No Phaser, DOM or storage.
 */
export type { PartyRoster };
export type AuthoredEncounter = EncounterCatalog['encounters'][number];
export type Combatant = AuthoredEncounter['enemies'][number];
/** A grid cell as content and saves write it: lane 1 (top) to 3, depth 1 (front) to 3. */
export interface GridCell { readonly lane: number; readonly depth: number }
export interface PartyState {
  /** Members in the party, in party order (one to four). */
  readonly active: readonly string[];
  /** Each active member's cell. */
  readonly cells: Readonly<Record<string, GridCell>>;
}
export const MAX_ACTIVE = 4;

export function defaultParty(roster: PartyRoster): PartyState {
  const cells: Record<string, GridCell> = {};
  for (const id of roster.active) { const cell = roster.members.find(m => m.id === id)!.cell; cells[id] = { lane: cell.lane, depth: cell.depth }; }
  return { active: [...roster.active], cells };
}

const key = (cell: GridCell): string => `${cell.lane},${cell.depth}`;
const inGrid = (cell: unknown): cell is GridCell => {
  const c = cell as Partial<GridCell> | null;
  return !!c && typeof c === 'object' && Object.keys(c).length === 2 && [c.lane, c.depth].every(n => Number.isSafeInteger(n) && (n as number) >= 1 && (n as number) <= GRID);
};

/** Why a party state is not valid for this roster, or null. Saves and formation changes both use it. */
export function partyProblem(state: unknown, memberIds: ReadonlySet<string>): string | null {
  const s = state as Partial<PartyState> | null;
  if (!s || typeof s !== 'object' || Object.keys(s).length !== 2 || !Array.isArray(s.active) || !s.cells || typeof s.cells !== 'object' || Array.isArray(s.cells)) return 'party has an invalid shape';
  if (s.active.length < 1 || s.active.length > MAX_ACTIVE) return `party needs 1-${MAX_ACTIVE} members`;
  if (new Set(s.active).size !== s.active.length) return 'a member is in the party twice';
  for (const id of s.active) if (typeof id !== 'string' || !memberIds.has(id)) return `unknown party member ${String(id)}`;
  const cells = s.cells as Record<string, unknown>;
  if (Object.keys(cells).length !== s.active.length || !s.active.every(id => Object.hasOwn(cells, id))) return 'every party member needs exactly one cell';
  const taken = new Set<string>();
  for (const id of s.active) {
    const cell = cells[id];
    if (!inGrid(cell)) return `cell of ${id} is outside the grid`;
    if (taken.has(key(cell))) return `two members share lane ${cell.lane}, depth ${cell.depth}`;
    taken.add(key(cell));
  }
  return null;
}

/** Free cells in the auto-placement order: the front column top to bottom, then the middle, then the back. */
function freeCells(taken: ReadonlySet<string>): GridCell[] {
  const free: GridCell[] = [];
  for (let depth = 1; depth <= GRID; depth += 1) for (let lane = 1; lane <= GRID; lane += 1) if (!taken.has(`${lane},${depth}`)) free.push({ lane, depth });
  return free;
}

/**
 * The encounter as the battle kernel plays it: the active members at their cells, then the guests, each at its own
 * cell if free or the first free cell otherwise. An encounter with its own party is returned as authored.
 */
export function battleEncounter(encounter: AuthoredEncounter, roster: PartyRoster | null, party: PartyState | null): Encounter {
  const { guests = [], ...rest } = encounter;
  if (encounter.party) return { ...rest, party: encounter.party };
  if (!roster || !party) throw new Error(`Encounter ${encounter.id} needs the party roster`);
  const members: Combatant[] = party.active.map(id => {
    const member = roster.members.find(m => m.id === id);
    if (!member) throw new Error(`Unknown party member ${id}`);
    return { ...member, cell: { ...party.cells[id]! } };
  });
  const taken = new Set(members.map(m => key(m.cell!)));
  const joined = guests.map(guest => {
    const cell = guest.cell && !taken.has(key(guest.cell)) ? guest.cell : freeCells(taken)[0];
    if (!cell) throw new Error(`Encounter ${encounter.id}: no free cell for guest ${guest.id}`);
    taken.add(key(cell));
    return { ...guest, cell: { lane: cell.lane, depth: cell.depth } };
  });
  return { ...rest, party: [...members, ...joined] };
}
