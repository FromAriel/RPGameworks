/**
 * Pure battle window layout (decision 0009, decision 0011 W3.5): where each battle window sits and where its text and
 * entries go, for a battle skin's content insets or for M5.3c's fallback panels. No Phaser or DOM, so it is unit-tested
 * in Node and shared by the stage and the hidden DOM input layer.
 */
import type { MenuLevel } from '../../domain/battle-menu';

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
interface Sides { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }

const STAGE = { w: 640, h: 360 } as const;
export const ROW = 20;
const ROWS = 5; // Attack, Special, Item, Guard, Run must always fit.
export const CURSOR_W = 12;
const LINE = 16; // One UNSCII 16 text line.

/** Where every battle window sits and where its text starts. */
export interface BattleLayout {
  readonly help: Rect; readonly enemies: Rect; readonly party: Rect; readonly commands: Rect;
  /** Sub-lists (Item, later Special) open over the enemy and party windows, as in FF6. */
  readonly list: Rect;
  /** Text inset inside the bottom windows; the cursor sits at `left - 4`, as in M5.3c. */
  readonly inset: Sides;
  /** The help line's text: left and top inside the window, and the gap kept at its right end. */
  readonly helpText: { readonly x: number; readonly y: number; readonly right: number };
  /** The vertical centre of the turn timeline strip, just below the help window. */
  readonly timelineY: number;
}

/**
 * The layout for a battle skin with these content insets, or M5.3c's original layout without a skin.
 * Ariel's choices (W3.5): the help window grows to fit one line inside the skin; the bottom band keeps 136 px unless a
 * skin needs more room for five rows, and then grows upward.
 */
export function battleLayout(insets: Sides | null): BattleLayout {
  const helpH = insets ? Math.max(24, insets.top + LINE + insets.bottom) : 24;
  const inset: Sides = insets ? { left: insets.left + 4, top: insets.top, right: insets.right, bottom: insets.bottom } : { left: 10, top: 10, right: 10, bottom: 10 };
  const band = Math.max(136, inset.top + ROWS * ROW + inset.bottom);
  const y = STAGE.h - band;
  return {
    help: { x: 0, y: 0, w: STAGE.w, h: helpH },
    enemies: { x: 0, y, w: 168, h: band },
    party: { x: 168, y, w: 336, h: band },
    commands: { x: 504, y, w: 136, h: band },
    list: { x: 0, y, w: 504, h: band },
    inset,
    helpText: insets ? { x: insets.left + 2, y: insets.top, right: insets.right + 2 } : { x: 8, y: 4, right: 8 },
    timelineY: helpH + 16, // A 24-pixel icon strip just below the help window (thinner since M5.4b, Ariel).
  };
}

/** M5.3c's layout, used when no battle skin is available. */
export const FALLBACK_LAYOUT = battleLayout(null);

/** Where entry `index` of a menu at `level` is drawn, for the cursor and for the mirror's button. */
export function entryRect(layout: BattleLayout, level: MenuLevel, index: number): Rect {
  const box = level === 'item' ? layout.list : layout.commands, i = layout.inset;
  return { x: box.x + i.left - 6, y: box.y + i.top - 2 + index * ROW, w: box.w - (i.left - 6) - (i.right - 6), h: ROW };
}

/** Name text fits its window: 8 px per character in UNSCII 16. */
export function fit(text: string, width: number): string {
  const max = Math.floor(width / 8);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}.`;
}
