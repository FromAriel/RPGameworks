import type { AreaShape, BattleCommand, BattlePhase, Cell, CombatantSnapshot, Opening, RejectReason } from './battle';
import { GRID, alliesAhead } from './battle-grid.mjs';
import { describeAction } from './actions';
import type { BattleAction } from './actions';
import { affinityOf } from './hit';

/**
 * Classic battle command menu (decision 0009), independent of Phaser and the DOM. It only builds a command: nothing
 * reaches the battle kernel until the final confirm, so Cancel at any depth is free. Availability always comes from
 * the kernel's own validate(), so the menu can never offer a command the rules would reject.
 */
export interface MenuItemInfo { readonly id: string; readonly name: string; readonly count: number; readonly help: string }
export interface MenuContext {
  readonly phase: BattlePhase;
  readonly active: string | null;
  readonly combatants: readonly CombatantSnapshot[];
  readonly items: readonly MenuItemInfo[];
  readonly validate: (command: BattleCommand) => RejectReason | null;
  /** How the battle opened; a back attack measures shields from the party's rear. Default normal. */
  readonly opening?: Opening;
  /** The battle's action catalog, for the active member's skills under Special (decision 0018 M5.5b). */
  readonly actions?: ReadonlyMap<string, BattleAction>;
  /** The tags the bestiary knows an enemy kind is weak to, from earlier battles (decision 0017 M5.5d). */
  readonly knownWeak?: (kind: string) => readonly string[];
}
export type MenuLevel = 'root' | 'item' | 'skill' | 'target' | 'move' | 'end';
export interface MenuEntry {
  readonly id: string;
  /** Text drawn in the window. */
  readonly label: string;
  /** Name for assistive technology and tests, when it differs from the drawn label. */
  readonly name: string;
  /** Right-aligned detail such as an item count. */
  readonly detail?: string;
  readonly enabled: boolean;
  readonly help: string;
}
export interface MenuState {
  readonly level: MenuLevel;
  readonly entries: readonly MenuEntry[];
  readonly cursor: number;
  readonly help: string;
  /** The combatant under the target cursor, in target selection. */
  readonly target: string | null;
  /** The grid cell under the cursor while choosing where to Move (decision 0014 M5.4c). */
  readonly cell: Cell | null;
  /** While aiming an area skill: its shape, centred on `target`, so the stage can light the cells it would hit. */
  readonly area: AreaShape | null;
}
export type EndChoice = 'finish' | 'retry' | 'leave';
export type MenuOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'command'; readonly command: BattleCommand }
  | { readonly kind: 'end'; readonly choice: EndChoice };

type Pending = { readonly type: 'attack' } | { readonly type: 'item'; readonly itemId: string } | { readonly type: 'skill'; readonly action: string };
interface Memory { root?: string; item?: string; skill?: string; attackTarget?: string; itemTarget?: string; skillTarget?: string }

const ROOT_HELP: Record<string, string> = {
  attack: 'Strike one enemy.',
  special: 'Skills, magic and combo techs.',
  item: 'Use an item.',
  guard: 'Halve damage taken until your next turn.',
  move: 'Step to another cell, or swap places with an ally. A light action: your next turn comes sooner.',
  run: 'Escape from this battle.',
};
const NONE: MenuOutcome = { kind: 'none' };

export class BattleMenu {
  private context: MenuContext | null = null;
  private level: MenuLevel = 'root';
  private cursor = 0;
  private pending: Pending | null = null;
  private readonly memory = new Map<string, Memory>();

  /** Start choosing for the context's active combatant (or the end-of-battle choices), restoring its cursor memory. */
  begin(context: MenuContext): void {
    this.context = context;
    this.pending = null;
    if (context.phase !== 'command' || !context.active) { this.level = 'end'; this.cursor = 0; return; }
    this.level = 'root';
    const remembered = this.memo().root;
    const entries = this.entries();
    const index = entries.findIndex(entry => entry.id === remembered && entry.enabled);
    this.cursor = index >= 0 ? index : Math.max(0, entries.findIndex(entry => entry.enabled));
  }

  state(): MenuState {
    const entries = this.entries();
    const entry = entries[this.cursor];
    const target = this.level === 'target' ? entry?.id.slice('target:'.length) ?? null : null;
    const cell = this.level === 'move' && entry ? parseCell(entry.id) : null;
    const aimed = this.level === 'target' && this.pending?.type === 'skill' ? this.context?.actions?.get(this.pending.action) : undefined;
    const area = aimed?.targeting === 'area' ? aimed.shape ?? null : null;
    return { level: this.level, entries, cursor: this.cursor, help: entry?.help ?? '', target, cell, area };
  }

  /**
   * The command column: the top-level (or end-of-battle) entries. While a sub-list or targeting is open, the cursor
   * stays on the parent entry and is marked inactive.
   */
  column(): { readonly entries: readonly MenuEntry[]; readonly cursor: number; readonly inactive: boolean } {
    if (this.level === 'root' || this.level === 'end') return { entries: this.entries(), cursor: this.cursor, inactive: false };
    const entries = this.entriesFor('root');
    const parent = this.level === 'move' ? 'move' : this.level === 'item' || this.pending?.type === 'item' ? 'item'
      : this.level === 'skill' || this.pending?.type === 'skill' ? 'special' : 'attack';
    return { entries, cursor: Math.max(0, entries.findIndex(entry => entry.id === parent)), inactive: true };
  }

  /** Point the cursor at an entry (keyboard focus or pointer hover); disabled entries can be highlighted to read why. */
  focus(index: number): void {
    const count = this.entries().length;
    if (count > 0) this.cursor = Math.max(0, Math.min(count - 1, index));
  }

  /** Move the cursor, wrapping around the list. */
  move(delta: number): void {
    const count = this.entries().length;
    if (count > 0) this.cursor = ((this.cursor + delta) % count + count) % count;
  }

  /** Select the entry with this id and confirm it, as a tap or click does. */
  choose(id: string): MenuOutcome {
    const index = this.entries().findIndex(entry => entry.id === id);
    if (index < 0) return NONE;
    this.cursor = index;
    return this.confirm();
  }

  confirm(): MenuOutcome {
    const context = this.context;
    const entry = this.entries()[this.cursor];
    if (!context || !entry || !entry.enabled) return NONE;
    if (this.level === 'end') return { kind: 'end', choice: entry.id as EndChoice };
    if (this.level === 'root') {
      this.memo().root = entry.id;
      if (entry.id === 'guard') return { kind: 'command', command: { type: 'guard' } };
      if (entry.id === 'run') return { kind: 'command', command: { type: 'escape' } };
      if (entry.id === 'attack') { this.enterTarget({ type: 'attack' }); return NONE; }
      if (entry.id === 'item') { this.enterItems(); return NONE; }
      if (entry.id === 'special') { this.enterSkills(); return NONE; }
      if (entry.id === 'move') { this.level = 'move'; this.pending = null; this.cursor = Math.max(0, this.entries().findIndex(e => e.enabled)); return NONE; }
      return NONE;
    }
    if (this.level === 'move') return { kind: 'command', command: { type: 'move', to: parseCell(entry.id) } };
    if (this.level === 'item') {
      const itemId = entry.id.slice('item:'.length);
      this.memo().item = itemId;
      this.enterTarget({ type: 'item', itemId });
      return NONE;
    }
    if (this.level === 'skill') {
      const action = entry.id.slice('skill:'.length);
      this.memo().skill = action;
      this.enterTarget({ type: 'skill', action });
      return NONE;
    }
    const target = entry.id.slice('target:'.length);
    const pending = this.pending!;
    if (pending.type === 'attack') { this.memo().attackTarget = target; return { kind: 'command', command: { type: 'attack', target } }; }
    if (pending.type === 'skill') { this.memo().skillTarget = target; return { kind: 'command', command: { type: 'skill', action: pending.action, target } }; }
    this.memo().itemTarget = target;
    return { kind: 'command', command: { type: 'item', itemId: pending.itemId, target } };
  }

  /** Back out one level without committing anything. At the top level the cursor moves to Run instead. */
  cancel(): void {
    if (this.level === 'target' && this.pending?.type === 'item') { this.enterItems(); return; }
    if (this.level === 'target' && this.pending?.type === 'skill') { this.enterSkills(); return; }
    if (this.level === 'target' || this.level === 'item' || this.level === 'skill' || this.level === 'move') {
      const back = this.level === 'item' ? 'item' : this.level === 'skill' ? 'special' : this.level === 'move' ? 'move' : 'attack';
      this.level = 'root'; this.pending = null;
      this.cursor = Math.max(0, this.entries().findIndex(entry => entry.id === back));
      return;
    }
    if (this.level === 'root') this.cursor = Math.max(0, this.entries().findIndex(entry => entry.id === 'run'));
  }

  private memo(): Memory {
    const active = this.context?.active ?? '';
    let memo = this.memory.get(active);
    if (!memo) { memo = {}; this.memory.set(active, memo); }
    return memo;
  }

  private enterItems(): void {
    this.level = 'item'; this.pending = null;
    const entries = this.entries();
    const index = entries.findIndex(entry => entry.id === `item:${this.memo().item}` && entry.enabled);
    this.cursor = index >= 0 ? index : Math.max(0, entries.findIndex(entry => entry.enabled));
  }

  private enterSkills(): void {
    this.level = 'skill'; this.pending = null;
    const entries = this.entries();
    const index = entries.findIndex(entry => entry.id === `skill:${this.memo().skill}` && entry.enabled);
    this.cursor = index >= 0 ? index : Math.max(0, entries.findIndex(entry => entry.enabled));
  }

  private enterTarget(pending: Pending): void {
    this.level = 'target'; this.pending = pending;
    const candidates = this.targets(pending);
    const remembered = pending.type === 'attack' ? this.memo().attackTarget : pending.type === 'skill' ? this.memo().skillTarget : this.memo().itemTarget;
    let index = candidates.findIndex(candidate => candidate.id === remembered);
    if (index < 0 && pending.type === 'item') {
      // Healing starts on the most injured candidate; ties keep the listed order.
      let best = -1;
      candidates.forEach((candidate, at) => {
        if (best < 0 || candidate.hp * candidates[best]!.maxHp < candidates[best]!.hp * candidate.maxHp) best = at;
      });
      index = best;
    }
    this.cursor = Math.max(0, index);
  }

  /** Living combatants the kernel accepts for `pending`: enemies first, each side in slot order. */
  private targets(pending: Pending): CombatantSnapshot[] {
    const context = this.context!;
    const order = [...context.combatants].sort((a, b) => (a.side === b.side ? a.slot - b.slot : a.side === 'enemy' ? -1 : 1));
    return order.filter(candidate => candidate.hp > 0 && context.validate(commandFor(pending, candidate.id)) === null);
  }

  /**
   * What the party knows about an enemy target (decision 0017, Ariel's M5.5c answers): the weaknesses revealed this
   * battle, "Weak!" when this hit would land on one of them, and "Broken" while it is. An affinity the party has not
   * revealed is never hinted at: "Weak!" needs both the real outcome and a revealed tag behind it.
   */
  private weaknessNote(target: CombatantSnapshot, pending: Pending): string {
    if (target.side !== 'enemy') return '';
    const context = this.context!;
    // Found this battle, or remembered from earlier ones (decision 0017 M5.5d), and weak in the enemy's current phase.
    const remembered = target.kind ? context.knownWeak?.(target.kind) ?? [] : [];
    const known = [...new Set([...target.revealed, ...remembered])].filter(tag => target.affinities[tag] === 'weak');
    const actor = context.combatants.find(c => c.id === context.active);
    const tags = pending.type === 'attack' ? actor?.weapon?.tags ?? [] : pending.type === 'skill' ? context.actions?.get(pending.action)?.tags ?? [] : [];
    const weakHit = affinityOf(target.affinities, tags) === 'weak' && tags.some(tag => known.includes(tag));
    return `${known.length ? `  Weak: ${known.join(', ')}` : ''}${weakHit ? '  Weak!' : ''}${target.broken ? '  Broken' : ''}`;
  }

  /** The active member's skills, in their listed order, with their catalog actions. */
  private skills(): { readonly id: string; readonly action: BattleAction }[] {
    const context = this.context!;
    const actor = context.combatants.find(c => c.id === context.active);
    return (actor?.skills ?? []).flatMap(id => { const action = context.actions?.get(id); return action ? [{ id, action }] : []; });
  }

  /** Why a skill cannot be used now, or null: MP first, then reach. */
  private skillReason(id: string): string | null {
    const context = this.context!;
    const living = context.combatants.filter(c => c.side === 'enemy' && c.hp > 0);
    const reasons = living.map(c => context.validate({ type: 'skill', action: id, target: c.id }));
    if (reasons.some(reason => reason === null)) return null;
    return reasons.includes('not-enough-mp') ? 'Not enough MP.' : 'No enemy can be reached.';
  }

  private entries(): MenuEntry[] { return this.entriesFor(this.level); }

  private entriesFor(level: MenuLevel): MenuEntry[] {
    const context = this.context;
    if (!context) return [];
    if (level === 'end') return endEntries(context.phase);
    if (level === 'target') {
      // Decision 0014: an enemy the active fighter cannot reach is not offered; the help line says who and why.
      const pending = this.pending!;
      const unreachable = pending.type !== 'item'
        ? context.combatants.filter(c => c.side === 'enemy' && c.hp > 0 && context.validate(commandFor(pending, c.id)) === 'out-of-reach').map(c => c.name)
        : [];
      const note = unreachable.length ? `  Out of reach: ${unreachable.join(', ')}.` : '';
      return this.targets(pending).map(candidate => ({
        id: `target:${candidate.id}`, label: candidate.name, name: candidate.name, enabled: true,
        help: `${candidate.name}  ${candidate.hp}/${candidate.maxHp} HP${this.weaknessNote(candidate, pending)}${note}`,
      }));
    }
    if (level === 'move') return this.moveEntries();
    if (level === 'skill') {
      // Every skill is listed with its MP cost; one the member cannot use now is shown disabled, and says why.
      return this.skills().map(({ id, action }) => {
        const reason = this.skillReason(id), mp = action.cost?.mp ?? 0;
        return { id: `skill:${id}`, label: action.name, name: mp ? `${action.name} (${mp} MP)` : action.name, detail: mp ? String(mp) : '',
          enabled: reason === null, help: reason === null ? describeAction(action) : `${reason} ${describeAction(action)}` };
      });
    }
    const items = context.items.filter(item => item.count > 0);
    if (level === 'item') {
      return items.map(item => {
        const usable = this.targets({ type: 'item', itemId: item.id }).length > 0;
        return { id: `item:${item.id}`, label: item.name, name: `${item.name} (${item.count})`, detail: String(item.count),
          enabled: usable, help: usable ? item.help : this.itemReason(item.id) };
      });
    }
    const attack = this.targets({ type: 'attack' }).length > 0;
    const usableItem = items.some(item => this.targets({ type: 'item', itemId: item.id }).length > 0);
    const run = context.validate({ type: 'escape' }) === null;
    const skills = this.skills(), skillReasons = skills.map(skill => this.skillReason(skill.id));
    const special = skillReasons.some(reason => reason === null);
    // When no skill can be used, one shared reason ("Not enough MP.") or a general one if the reasons differ.
    const specialReason = !skills.length ? 'No specials yet.' : new Set(skillReasons).size === 1 ? skillReasons[0]! : 'No special can be used now.';
    const entry = (id: string, label: string, enabled: boolean, reason: string): MenuEntry =>
      ({ id, label, name: label, enabled, help: enabled ? ROOT_HELP[id]! : reason });
    return [
      entry('attack', 'Attack', attack, 'No enemy can be reached.'),
      entry('special', 'Special', special, specialReason),
      entry('item', 'Item', usableItem, items.length ? this.itemReason(items[0]!.id) : 'No usable items.'),
      entry('guard', 'Guard', context.validate({ type: 'guard' }) === null, 'Cannot guard now.'),
      entry('move', 'Move', this.moveEntries().some(e => e.enabled), 'There is nowhere to move.'),
      entry('run', 'Run', run, 'There is no escape from this battle.'),
    ];
  }

  /**
   * Every other cell of the active fighter's grid, top lane first and front to back: an empty cell to step into, or an
   * ally to swap places with. The help line says how exposed the fighter would be there (decision 0014).
   */
  private moveEntries(): MenuEntry[] {
    const context = this.context!;
    const actor = context.combatants.find(c => c.id === context.active);
    if (!actor) return [];
    const from = actor.side === 'party' && context.opening === 'back-attack' ? 'rear' : 'front';
    const entries: MenuEntry[] = [];
    for (let lane = 0; lane < GRID; lane++) {
      for (let depth = 0; depth < GRID; depth++) {
        if (lane === actor.lane && depth === actor.depth) continue;
        const occupant = context.combatants.find(c => c.id !== actor.id && c.side === actor.side && c.flank === actor.flank
          && lane >= c.lane && lane < c.lane + c.lanes && depth >= c.depth && depth < c.depth + c.depths);
        const name = occupant ? `Swap with ${occupant.name}` : `${LANES[lane]} lane, ${DEPTHS[depth]}`;
        const enabled = context.validate({ type: 'move', to: { lane, depth } }) === null;
        // Who would stand ahead of the fighter there: everyone living on its side, with the swapped ally in its old cell.
        const allies = context.combatants.filter(c => c.id !== actor.id && c.side === actor.side && c.flank === actor.flank && c.hp > 0)
          .map(c => (c === occupant ? { ...c, lane: actor.lane, depth: actor.depth } : c));
        const shields = Math.min(2, alliesAhead({ lane, depth, lanes: 1, depths: 1 }, allies, from));
        const exposure = shields === 0 ? 'Front-facing there.' : `Shielded there by ${shields} ${shields === 1 ? 'ally (20%' : 'allies (35%'} less damage).`;
        entries.push({ id: `cell:${lane},${depth}`, label: name, name, enabled,
          help: enabled ? `${occupant ? `Swap places with ${occupant.name}. ` : ''}${exposure}` : 'That cell is taken.' });
      }
    }
    return entries;
  }

  private itemReason(itemId: string): string {
    const context = this.context!;
    const party = context.combatants.filter(candidate => candidate.side === 'party' && candidate.hp > 0);
    return party.some(candidate => context.validate({ type: 'item', itemId, target: candidate.id }) === 'full-hp')
      ? 'HP is already full.' : 'Cannot be used now.';
  }
}

function endEntries(phase: BattlePhase): MenuEntry[] {
  const entry = (id: EndChoice, label: string, help: string): MenuEntry => ({ id, label, name: label, enabled: true, help });
  if (phase === 'victory') return [entry('finish', 'Finish', 'Victory! Return to the room.')];
  if (phase === 'defeat') return [entry('retry', 'Retry', 'Start this battle again from the beginning.'), entry('leave', 'Leave', 'Return to the room.')];
  return [entry('leave', 'Leave', 'Escaped. Return to the room.')];
}

/** The command `pending` would make against `target`. */
function commandFor(pending: Pending, target: string): BattleCommand {
  return pending.type === 'attack' ? { type: 'attack', target }
    : pending.type === 'skill' ? { type: 'skill', action: pending.action, target }
    : { type: 'item', itemId: pending.itemId, target };
}

const LANES = ['Top', 'Middle', 'Bottom'] as const;
const DEPTHS = ['front', 'middle', 'back'] as const;
function parseCell(id: string): Cell {
  const [lane, depth] = id.slice('cell:'.length).split(',').map(Number);
  return { lane: lane!, depth: depth! };
}
