import Phaser from 'phaser';
import type { MenuEntry } from '../../domain/battle-menu';
import type { SkinPainter } from '../skin/paint';

/**
 * Final Fantasy-style battle windows drawn on the stage (decision 0009): a help/action line at the top, and enemy
 * names, party status and the command column across the bottom band. Since W3.5 (decision 0011) the windows are
 * composed by the W1 window skin (the theme's `battle` skin) and their text sits inside the skin's content insets;
 * if that skin cannot load, M5.3c's blue panels are drawn instead, with M5.3c's exact layout. Pure layout helpers are
 * exported so the hidden DOM mirror can place its transparent buttons exactly over the drawn entries.
 */
export { battleLayout, entryRect, fit, FALLBACK_LAYOUT } from './battle-layout';
export type { BattleLayout, Rect } from './battle-layout';
import { entryRect, fit, FALLBACK_LAYOUT, battleLayout, ROW, CURSOR_W } from './battle-layout';
import type { BattleLayout, Rect } from './battle-layout';

/** Fallback blue panel: authored colours, tuned in play review. Text and cursor colours are used with every skin. */
export const PANEL_STYLE = {
  top: 0x3050b8, bottom: 0x0c1854, bandHeight: 4,
  outline: 0x05070e, border: 0xe8ecf6, bevel: 0x8fa2d8,
  text: 0xffffff, disabled: 0x8a93b0, muted: 0xc2cbe6, danger: 0xff9c8a, cursor: 0xffffff,
} as const;

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

let instances = 0;

export class BattleWindows {
  readonly layout: BattleLayout;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  /** One composed texture per distinct window size, kept for the battle and removed by destroy(). */
  private readonly textures = new Map<string, string>();
  private readonly prefix = `battle-window-${++instances}`;
  constructor(private readonly scene: Phaser.Scene, private readonly label: LabelFactory, private readonly depth: number,
    private readonly skin: SkinPainter | null = null) {
    this.layout = skin ? battleLayout(skin.insets) : FALLBACK_LAYOUT;
  }

  get objectCount(): number { return this.objects.length; }
  /** Whether the windows come from the battle skin or are the fallback panels. */
  get source(): 'skin' | 'fallback' { return this.skin ? 'skin' : 'fallback'; }

  render(view: WindowsView): void {
    this.clear();
    const L = this.layout, i = L.inset;
    this.panel(L.help);
    const ht = L.helpText;
    this.text(L.help.x + ht.x, L.help.y + ht.y, fit(view.help, L.help.w - ht.x - ht.right - 8 - view.hint.length * 8), PANEL_STYLE.text);
    if (view.hint) this.text(L.help.x + L.help.w - ht.right - view.hint.length * 8, L.help.y + ht.y, view.hint, PANEL_STYLE.muted);

    this.panel(L.enemies);
    view.enemies.forEach((enemy, index) => {
      const y = L.enemies.y + i.top + index * ROW;
      if (enemy.id === view.target) this.cursor(L.enemies.x + i.left - 4, y, false);
      this.text(L.enemies.x + i.left + CURSOR_W, y, fit(enemy.name, L.enemies.w - i.left - i.right - CURSOR_W), enemy.defeated ? PANEL_STYLE.disabled : PANEL_STYLE.text);
    });

    this.panel(L.party);
    view.party.forEach((member, index) => {
      const y = L.party.y + i.top + index * ROW;
      if (member.active || member.id === view.target) this.cursor(L.party.x + i.left - 4, y, member.id !== view.target && view.target !== null);
      const low = member.hp * 4 <= member.maxHp;
      const color = member.hp <= 0 ? PANEL_STYLE.disabled : low ? PANEL_STYLE.danger : PANEL_STYLE.text;
      this.text(L.party.x + i.left + CURSOR_W, y, fit(member.name, 120), color);
      const hp = `${String(member.hp).padStart(3)}/${String(member.maxHp).padStart(3)}`;
      this.text(L.party.x + L.party.w - i.right - hp.length * 8, y, hp, color);
    });

    // The command window stays as an empty panel while actions play, so the band never shows a hole.
    this.panel(L.commands);
    if (view.showCommands) {
      view.commands.forEach((entry, index) => {
        const rect = entryRect(L, 'root', index);
        this.text(rect.x + 4 + CURSOR_W, rect.y + 2, fit(entry.label, rect.w - CURSOR_W - 8), entry.enabled ? PANEL_STYLE.text : PANEL_STYLE.disabled);
      });
      const at = entryRect(L, 'root', view.commandCursor);
      if (view.commands.length) this.cursor(at.x + 2, at.y + 2, view.commandInactive);
    }

    if (view.list) {
      this.panel(L.list);
      view.list.entries.forEach((entry, index) => {
        const rect = entryRect(L, 'item', index);
        const color = entry.enabled ? PANEL_STYLE.text : PANEL_STYLE.disabled;
        const detail = entry.detail ?? '';
        this.text(rect.x + 4 + CURSOR_W, rect.y + 2, fit(entry.label, rect.w - CURSOR_W - 16 - detail.length * 8), color);
        if (detail) this.text(rect.x + rect.w - 6 - detail.length * 8, rect.y + 2, detail, color);
      });
      if (view.list.entries.length) { const at = entryRect(L, 'item', view.list.cursor); this.cursor(at.x + 2, at.y + 2, false); }
    }
  }

  destroy(): void {
    this.clear();
    for (const key of this.textures.values()) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.textures.clear();
  }

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

  private panel(rect: Rect): void {
    if (this.skin) this.add(this.scene.add.image(rect.x, rect.y, this.frameTexture(rect.w, rect.h)).setOrigin(0));
    else this.fallbackPanel(rect);
  }

  /** The skin's frame for this size, composed once by the shared W1 painter and copied into a battle-owned texture. */
  private frameTexture(w: number, h: number): string {
    const size = `${w}x${h}`;
    const existing = this.textures.get(size);
    if (existing) return existing;
    const painter = this.skin as SkinPainter;
    painter.frame(w, h); // Battle windows show frames only, no titles (decision 0011 D7).
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable for battle windows');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(painter.canvas, 0, 0);
    const key = `${this.prefix}-${size}`;
    this.scene.textures.addCanvas(key, canvas);
    this.textures.set(size, key);
    return key;
  }

  /** A blue panel: dark outline, light border, inner bevel line and a banded vertical gradient (M5.3c). */
  private fallbackPanel(rect: Rect): void {
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
