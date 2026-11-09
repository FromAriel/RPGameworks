import Phaser from 'phaser';
import type { MenuLevel, MenuEntry } from '../../domain/battle-menu';

/**
 * Final Fantasy-style battle windows drawn on the stage (decision 0009): a help/action line at the top, and enemy
 * names, party status and the command column across the bottom band. Pure layout helpers are exported so the hidden
 * DOM mirror can place its transparent buttons exactly over the drawn entries.
 */
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

export const WINDOW = {
  help: { x: 0, y: 0, w: 640, h: 24 },
  enemies: { x: 0, y: 224, w: 168, h: 136 },
  party: { x: 168, y: 224, w: 336, h: 136 },
  commands: { x: 504, y: 224, w: 136, h: 136 },
  /** Sub-lists (Item, later Special) open over the enemy and party windows, as in FF6. */
  list: { x: 0, y: 224, w: 504, h: 136 },
} as const satisfies Record<string, Rect>;
const PAD = 10;
const ROW = 20;
const CURSOR_W = 12;

/** FF-style blue panel: authored colours, tuned in play review. The fill steps in bands like a 16-bit gradient. */
export const PANEL_STYLE = {
  top: 0x3050b8, bottom: 0x0c1854, bandHeight: 4,
  outline: 0x05070e, border: 0xe8ecf6, bevel: 0x8fa2d8,
  text: 0xffffff, disabled: 0x8a93b0, muted: 0xc2cbe6, danger: 0xff9c8a, cursor: 0xffffff,
} as const;

/** Where entry `index` of a menu at `level` is drawn, for the cursor and for the mirror's button. */
export function entryRect(level: MenuLevel, index: number): Rect {
  const box = level === 'item' ? WINDOW.list : WINDOW.commands;
  return { x: box.x + 4, y: box.y + PAD - 2 + index * ROW, w: box.w - 8, h: ROW };
}

/** Name text fits its window: 8 px per character in UNSCII 16. */
export function fit(text: string, width: number): string {
  const max = Math.floor(width / 8);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}.`;
}

export interface WindowsView {
  readonly help: string;
  /** Short hint on the right of the help line, such as playback controls. */
  readonly hint: string;
  readonly enemies: readonly { readonly id: string; readonly name: string; readonly defeated: boolean }[];
  readonly party: readonly { readonly id: string; readonly name: string; readonly hp: number; readonly maxHp: number; readonly active: boolean }[];
  /** The combatant being targeted; its name gets the pointer too, as in FF. */
  readonly target: string | null;
  /** The command column's entries (root or end choices), with the cursor or the parent entry of an open sub-level. */
  readonly commands: readonly MenuEntry[];
  readonly commandCursor: number;
  /** True while a sub-level (item list or targeting) is open, so the column cursor is shown as inactive. */
  readonly commandInactive: boolean;
  readonly list: { readonly entries: readonly MenuEntry[]; readonly cursor: number } | null;
  readonly showCommands: boolean;
}

type Label = Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text;
export type LabelFactory = (x: number, y: number, text: string, color: number) => Label;

export class BattleWindows {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  constructor(private readonly scene: Phaser.Scene, private readonly label: LabelFactory, private readonly depth: number) {}

  get objectCount(): number { return this.objects.length; }

  render(view: WindowsView): void {
    this.clear();
    this.panel(WINDOW.help);
    this.text(WINDOW.help.x + 8, WINDOW.help.y + 4, fit(view.help, WINDOW.help.w - 24 - view.hint.length * 8), PANEL_STYLE.text);
    if (view.hint) this.text(WINDOW.help.x + WINDOW.help.w - 8 - view.hint.length * 8, WINDOW.help.y + 4, view.hint, PANEL_STYLE.muted);

    this.panel(WINDOW.enemies);
    view.enemies.forEach((enemy, index) => {
      const y = WINDOW.enemies.y + PAD + index * ROW;
      if (enemy.id === view.target) this.cursor(WINDOW.enemies.x + 6, y, false);
      this.text(WINDOW.enemies.x + PAD + CURSOR_W, y, fit(enemy.name, WINDOW.enemies.w - 2 * PAD - CURSOR_W), enemy.defeated ? PANEL_STYLE.disabled : PANEL_STYLE.text);
    });

    this.panel(WINDOW.party);
    view.party.forEach((member, index) => {
      const y = WINDOW.party.y + PAD + index * ROW;
      if (member.active || member.id === view.target) this.cursor(WINDOW.party.x + 6, y, member.id !== view.target && view.target !== null);
      const low = member.hp * 4 <= member.maxHp;
      const color = member.hp <= 0 ? PANEL_STYLE.disabled : low ? PANEL_STYLE.danger : PANEL_STYLE.text;
      this.text(WINDOW.party.x + PAD + CURSOR_W, y, fit(member.name, 120), color);
      const hp = `${String(member.hp).padStart(3)}/${String(member.maxHp).padStart(3)}`;
      this.text(WINDOW.party.x + WINDOW.party.w - PAD - hp.length * 8, y, hp, color);
    });

    // The command window stays as an empty panel while actions play, so the band never shows a hole.
    this.panel(WINDOW.commands);
    if (view.showCommands) {
      view.commands.forEach((entry, index) => {
        const rect = entryRect('root', index);
        this.text(rect.x + 4 + CURSOR_W, rect.y + 2, fit(entry.label, rect.w - CURSOR_W - 8), entry.enabled ? PANEL_STYLE.text : PANEL_STYLE.disabled);
      });
      const at = entryRect('root', view.commandCursor);
      if (view.commands.length) this.cursor(at.x + 2, at.y + 2, view.commandInactive);
    }

    if (view.list) {
      this.panel(WINDOW.list);
      view.list.entries.forEach((entry, index) => {
        const rect = entryRect('item', index);
        const color = entry.enabled ? PANEL_STYLE.text : PANEL_STYLE.disabled;
        const detail = entry.detail ?? '';
        this.text(rect.x + 4 + CURSOR_W, rect.y + 2, fit(entry.label, rect.w - CURSOR_W - 16 - detail.length * 8), color);
        if (detail) this.text(rect.x + rect.w - 6 - detail.length * 8, rect.y + 2, detail, color);
      });
      if (view.list.entries.length) { const at = entryRect('item', view.list.cursor); this.cursor(at.x + 2, at.y + 2, false); }
    }
  }

  destroy(): void { this.clear(); }

  private clear(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }

  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    (object as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    (object as unknown as Phaser.GameObjects.Components.Depth).setDepth(this.depth);
    this.objects.push(object);
    return object;
  }

  private text(x: number, y: number, text: string, color: number): void {
    this.add(this.label(Math.round(x), Math.round(y), text, color));
  }

  /** A blue panel: dark outline, light border, inner bevel line and a banded vertical gradient. */
  private panel(rect: Rect): void {
    const g = this.add(this.scene.add.graphics());
    const { x, y, w, h } = rect;
    const bands = Math.ceil((h - 6) / PANEL_STYLE.bandHeight);
    for (let band = 0; band < bands; band += 1) {
      const t = bands > 1 ? band / (bands - 1) : 0;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(PANEL_STYLE.top), Phaser.Display.Color.ValueToColor(PANEL_STYLE.bottom), 100, Math.round(t * 100));
      const top = y + 3 + band * PANEL_STYLE.bandHeight;
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1)
        .fillRect(x + 3, top, w - 6, Math.min(PANEL_STYLE.bandHeight, y + h - 3 - top));
    }
    g.fillStyle(PANEL_STYLE.outline, 1).fillRect(x, y, w, 1).fillRect(x, y + h - 1, w, 1).fillRect(x, y, 1, h).fillRect(x + w - 1, y, 1, h);
    g.fillStyle(PANEL_STYLE.border, 1).fillRect(x + 1, y + 1, w - 2, 1).fillRect(x + 1, y + h - 2, w - 2, 1)
      .fillRect(x + 1, y + 1, 1, h - 2).fillRect(x + w - 2, y + 1, 1, h - 2);
    g.fillStyle(PANEL_STYLE.bevel, 1).fillRect(x + 2, y + 2, w - 4, 1).fillRect(x + 2, y + 2, 1, h - 4);
  }

  /** The ▶ pointer, drawn in whole pixels (7 × 11). An inactive cursor marks the parent entry of an open sub-menu. */
  private cursor(x: number, y: number, inactive: boolean): void {
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(PANEL_STYLE.outline, 1);
    for (let row = 0; row < 11; row += 1) {
      const width = 6 - Math.abs(5 - row);
      g.fillRect(x + 1, y + 3 + row, width + 1, 1);
    }
    g.fillStyle(inactive ? PANEL_STYLE.disabled : PANEL_STYLE.cursor, 1);
    for (let row = 0; row < 11; row += 1) {
      const width = 6 - Math.abs(5 - row);
      if (width > 0) g.fillRect(x, y + 2 + row, width, 1);
    }
  }
}
