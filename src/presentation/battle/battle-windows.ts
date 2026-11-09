import Phaser from 'phaser';
import type { MenuLevel, MenuEntry } from '../../domain/battle-menu';
import type { BattleColors, BattleSkin } from './battle-frames';

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
  /** Window frames and text colours come from the skin, which reads the game's UI theme (decision 0010). */
  constructor(private readonly scene: Phaser.Scene, private readonly skin: BattleSkin, private readonly label: LabelFactory, private readonly depth: number) {}

  private get c(): BattleColors { return this.skin.colors; }

  get objectCount(): number { return this.objects.length; }

  render(view: WindowsView): void {
    this.clear();
    this.panel(WINDOW.help);
    this.text(WINDOW.help.x + 8, WINDOW.help.y + 4, fit(view.help, WINDOW.help.w - 24 - view.hint.length * 8), this.c.text);
    if (view.hint) this.text(WINDOW.help.x + WINDOW.help.w - 8 - view.hint.length * 8, WINDOW.help.y + 4, view.hint, this.c.muted);

    this.panel(WINDOW.enemies);
    view.enemies.forEach((enemy, index) => {
      const y = WINDOW.enemies.y + PAD + index * ROW;
      if (enemy.id === view.target) this.cursor(WINDOW.enemies.x + 6, y, false);
      this.text(WINDOW.enemies.x + PAD + CURSOR_W, y, fit(enemy.name, WINDOW.enemies.w - 2 * PAD - CURSOR_W), enemy.defeated ? this.c.disabled : this.c.text);
    });

    this.panel(WINDOW.party);
    view.party.forEach((member, index) => {
      const y = WINDOW.party.y + PAD + index * ROW;
      if (member.active || member.id === view.target) this.cursor(WINDOW.party.x + 6, y, member.id !== view.target && view.target !== null);
      const low = member.hp * 4 <= member.maxHp;
      const color = member.hp <= 0 ? this.c.disabled : low ? this.c.danger : this.c.text;
      this.text(WINDOW.party.x + PAD + CURSOR_W, y, fit(member.name, 120), color);
      const hp = `${String(member.hp).padStart(3)}/${String(member.maxHp).padStart(3)}`;
      this.text(WINDOW.party.x + WINDOW.party.w - PAD - hp.length * 8, y, hp, color);
    });

    // The command window stays as an empty panel while actions play, so the band never shows a hole.
    this.panel(WINDOW.commands);
    if (view.showCommands) {
      view.commands.forEach((entry, index) => {
        const rect = entryRect('root', index);
        this.text(rect.x + 4 + CURSOR_W, rect.y + 2, fit(entry.label, rect.w - CURSOR_W - 8), entry.enabled ? this.c.text : this.c.disabled);
      });
      const at = entryRect('root', view.commandCursor);
      if (view.commands.length) this.cursor(at.x + 2, at.y + 2, view.commandInactive);
    }

    if (view.list) {
      this.panel(WINDOW.list);
      view.list.entries.forEach((entry, index) => {
        const rect = entryRect('item', index);
        const color = entry.enabled ? this.c.text : this.c.disabled;
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

  /** One window from the skin's baked frame and fill. */
  private panel(rect: Rect): void {
    for (const object of this.skin.panel(rect)) this.add(object);
  }

  /** The ▶ pointer, drawn in whole pixels (7 × 11). An inactive cursor marks the parent entry of an open sub-menu. */
  private cursor(x: number, y: number, inactive: boolean): void {
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(this.c.outline, 1);
    for (let row = 0; row < 11; row += 1) {
      const width = 6 - Math.abs(5 - row);
      g.fillRect(x + 1, y + 3 + row, width + 1, 1);
    }
    g.fillStyle(inactive ? this.c.disabled : this.c.cursor, 1);
    for (let row = 0; row < 11; row += 1) {
      const width = 6 - Math.abs(5 - row);
      if (width > 0) g.fillRect(x, y + 2 + row, width, 1);
    }
  }
}
