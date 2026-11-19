import Phaser from 'phaser';
import type { AreaShape, BattleEvent, BattleSnapshot, Cell, CombatantSnapshot, Opening } from '../../domain/battle';
import type { MenuEntry } from '../../domain/battle-menu';
import { STAGE_GRID, areaPercentAt, battlerPosition, gridSpacing, hpBefore, stepDuration } from './playback';
import type { StageFloor } from './playback';
import type { PlaybackSpeed } from './playback';
import { BattleWindows, PANEL_STYLE } from './battle-windows';
import type { BattleLayout, Rect } from './battle-windows';
import type { SkinPainter } from '../skin/paint';
import { PIXEL_FONT_BITMAP_SIZE, addPixelFont, releasePixelFont } from '../pixel-font';
import type { CreatureArt } from '../../platform/creature-loader';
import type { CreatureFrames } from '../../content/creature-atlas.mjs';
import { creatureKey } from '../../content/creature-atlas.mjs';
import { alliesAhead } from '../../domain/battle-grid.mjs';

/** Pixel labels use the UNSCII bitmap font; ordinary canvas text is only the fallback when that font is missing. */
type Label = Phaser.GameObjects.BitmapText | Phaser.GameObjects.Text;
const TEXT_COLOR = 0xe6e3c6;
const SHADOW_COLOR = 0x080c14;
const FALLBACK_TEXT = { fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#e6e3c6', stroke: '#080c14', strokeThickness: 3 } as const;

/**
 * Side-view battle stage drawn in screen space over the paused room (M5.3b), with the classic battle windows
 * (M5.3c, decision 0009). It owns every object, tween and timer it creates and releases them in destroy(). It only
 * replays events a BattleSession already resolved, and only draws the menu state it is given.
 */
const DEPTH = { backdrop: 1.5, floor: 1.51, battler: 1.6, ui: 1.7, windows: 1.8, numbers: 3 } as const;
const BAR_WIDTH = 48;
/** Hit text colours by affinity (decision 0018): weak gold, resist grey-blue, immune grey, absorb green. */
export const AFFINITY_COLOR = { weak: 0xffd25e, resist: 0x9fb4d8, immune: 0xb7c9d0, absorb: 0x8fe08f } as const;
const TIMELINE_ICONS = 8;
/** Idle loops advance on this tick; each creature keeps its own loop time and a phase offset by slot (decision 0015). */
const IDLE_TICK_MS = 50;
const PHASE_STAGGER_MS = 97;

interface Battler {
  /** The latest snapshot of this fighter; its cell changes when it moves (decision 0014 M5.4c). */
  combatant: CombatantSnapshot;
  readonly sprite: Phaser.GameObjects.Image;
  /**
   * Enemy HP bar on the stage, and its dark track. Shown only while the enemy is targeted and for a moment after it is
   * hit, so it does not cover the art; the enemy window's underline gauge always shows HP (Ariel, after M5.4).
   */
  readonly bar: Phaser.GameObjects.Rectangle | null;
  readonly barBack: Phaser.GameObjects.Rectangle | null;
  /** True for a moment after a hit. */
  barHold: boolean;
  home: { x: number; y: number; scale: number };
  readonly barWidth: number;
  /** Shield pips: how many living allies stand ahead of this battler in its lane (decision 0014). */
  readonly shields: Phaser.GameObjects.Graphics;
  shieldCount: number;
  /** Stone Soup creature frames when this battler is drawn as a creature (decision 0015 C3). */
  readonly creature: CreatureFrames | null;
  flashing: boolean;
}

/** What the command windows should show; built by the scene from the battle-menu model. */
export interface StageMenu {
  readonly help: string;
  readonly commands: readonly MenuEntry[];
  readonly commandCursor: number;
  readonly commandInactive: boolean;
  readonly list: { readonly entries: readonly MenuEntry[]; readonly cursor: number } | null;
  /** The combatant under the on-stage target cursor. */
  readonly target: string | null;
  /** While choosing where to Move: the party grid is shown and this cell is highlighted (decision 0014 M5.4c). */
  readonly cell?: Cell | null;
  /** While aiming an area skill (M5.5b-2, Ariel: light the cells): its shape, centred on `target`. */
  readonly area?: AreaShape | null;
}

export interface BattleViewOptions {
  readonly atlas: string;
  readonly reducedMotion: boolean;
  /** Requests the cosmetic impact cue at a screen position; may do nothing when effects are unavailable. */
  readonly impact: (screen: { x: number; y: number }, seed: number) => void;
  /** Display name for an item id, for the action line during playback. */
  readonly itemName: (itemId: string) => string;
  /** The theme's battle skin (decision 0011 W3.5), or null for the fallback panels. */
  readonly skin?: SkinPainter | null;
  /** Baked Stone Soup creature art (decision 0015 C3), or null to draw every battler from its frame. */
  readonly creatures?: CreatureArt | null;
}

export class BattleView {
  private readonly owned: Phaser.GameObjects.GameObject[] = [];
  private readonly transient = new Set<Phaser.GameObjects.GameObject>();
  private readonly tweens = new Set<Phaser.Tweens.Tween>();
  private readonly timers = new Set<Phaser.Time.TimerEvent>();
  private readonly battlers = new Map<string, Battler>();
  private readonly hp = new Map<string, number>();
  /** How the fight opened (decision 0014 M5.4e): it decides where each side stands. */
  private readonly opening: Opening;
  /** Pincer only: the flank each party member last fought, which it faces (it starts toward the front flank). */
  private readonly facing = new Map<string, 'front' | 'rear'>();
  private readonly timeline: Phaser.GameObjects.Image[] = [];
  private readonly timelineMarker: Phaser.GameObjects.Rectangle;
  private readonly windows: BattleWindows;
  private readonly targetCursor: Phaser.GameObjects.Graphics;
  private readonly blink: Phaser.Tweens.Tween;
  private pending: { target: BattleSnapshot; events: readonly BattleEvent[]; index: number; done: () => void } | null = null;
  private disposed = false;
  private readonly font: string | null;
  private menu: StageMenu | null = null;
  private active: string | null = null;
  private banner = '';
  private currentSpeed: PlaybackSpeed = 1;
  private idleLoop: Phaser.Time.TimerEvent | null = null;
  /** The floor band the lanes fit into, from below the timeline to the bottom windows. */
  private readonly floor: StageFloor;
  /** The party's nine cells, drawn while choosing where to Move. */
  private readonly cellGrid: Phaser.GameObjects.Graphics;
  /** The cells an area skill would hit while it is being aimed. */
  private readonly aimCells: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, initial: BattleSnapshot, private readonly options: BattleViewOptions) {
    const { width, height } = scene.scale;
    this.opening = initial.opening;
    this.font = addPixelFont(scene);
    // The windows come first: the skin decides the help window's height, and the timeline sits just below it.
    this.windows = new BattleWindows(scene, (x, y, text, color) => this.label(x, y, text, color), DEPTH.windows, options.skin ?? null);
    const TIMELINE_Y = this.windows.layout.timelineY;
    this.own(scene.add.rectangle(0, 0, width, height, 0x0b111b).setOrigin(0).setDepth(DEPTH.backdrop));
    // The floor runs from just below the turn timeline down to the bottom windows (thinner strip, M5.4b).
    const floorTop = TIMELINE_Y + 16, floorBottom = this.windows.layout.enemies.y;
    this.floor = { top: floorTop, bottom: floorBottom };
    this.own(scene.add.rectangle(0, floorTop, width, floorBottom - floorTop, 0x18243a).setOrigin(0).setDepth(DEPTH.floor));
    this.own(scene.add.rectangle(0, floorTop, width, 2, 0x2e4a66).setOrigin(0).setDepth(DEPTH.floor));
    this.own(this.label(8, TIMELINE_Y - 8, 'Next', TEXT_COLOR).setDepth(DEPTH.ui));
    this.timelineMarker = this.own(scene.add.rectangle(0, 0, 28, 28).setStrokeStyle(2, 0x88c2c3).setDepth(DEPTH.ui));
    for (let index = 0; index < TIMELINE_ICONS; index += 1) {
      this.timeline.push(this.own(scene.add.image(56 + index * 30, TIMELINE_Y, options.atlas, 'spark').setDepth(DEPTH.ui).setVisible(false)));
    }
    // A back attack or a pincer is named at the right end of the timeline strip for the whole fight.
    if (this.opening !== 'normal') this.own(this.label(width - 8, TIMELINE_Y - 8, this.opening === 'pincer' ? 'Pincer' : 'Back attack', 0xe6c27a).setOrigin(1, 0).setDepth(DEPTH.ui));
    for (const combatant of initial.combatants) {
      const home = battlerPosition(combatant.side, combatant, this.floor, this.opening);
      const creature = this.creatureOf(combatant);
      const sprite = this.own(creature
        ? scene.add.image(home.x, home.y, options.creatures!.texture, creature.still).setFlipX(creature.faces === 'left')
        : scene.add.image(home.x, home.y, options.atlas, combatant.frame)).setScale(home.scale).setDepth(DEPTH.battler + home.y / 10000);
      let bar: Phaser.GameObjects.Rectangle | null = null, barBack: Phaser.GameObjects.Rectangle | null = null;
      const barWidth = Math.round(BAR_WIDTH * home.scale / 2), barY = home.y + 19 * home.scale;
      if (combatant.side === 'enemy') {
        barBack = this.own(scene.add.rectangle(home.x - barWidth / 2, barY, barWidth, 5, 0x080c14).setOrigin(0).setDepth(DEPTH.ui));
        bar = this.own(scene.add.rectangle(home.x - barWidth / 2, barY, barWidth, 5, 0x6fbf73).setOrigin(0).setDepth(DEPTH.ui));
      }
      const shields = this.own(scene.add.graphics().setDepth(DEPTH.ui));
      this.battlers.set(combatant.id, { combatant, sprite, bar, barBack, barHold: false, barWidth, home, shields, shieldCount: 0, creature, flashing: false });
      this.face(this.battlers.get(combatant.id)!);
    }
    // Creatures breathe on their own idle loops; reduced motion keeps each one still (decision 0015 C3).
    if (!options.reducedMotion && [...this.battlers.values()].some(b => b.creature)) {
      this.idleLoop = scene.time.addEvent({ delay: IDLE_TICK_MS, loop: true, callback: () => this.idle() });
    }
    this.targetCursor = this.own(this.downPointer()).setDepth(DEPTH.windows).setVisible(false);
    this.cellGrid = this.own(scene.add.graphics().setDepth(DEPTH.floor + 0.001));
    this.aimCells = this.own(scene.add.graphics().setDepth(DEPTH.battler + 0.09));
    for (const object of this.owned) (object as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    this.blink = scene.tweens.add({ targets: this.targetCursor, alpha: { from: 1, to: 0.55 }, duration: 360, yoyo: true, repeat: -1 });
    this.render(initial);
  }

  get playing(): boolean { return this.pending !== null; }
  /** Where the battle windows and their entries are, for the input layer's buttons. */
  get layout(): BattleLayout { return this.windows.layout; }
  /** Whether the windows come from the battle skin or are the fallback panels. */
  get windowSource(): 'skin' | 'fallback' { return this.windows.source; }
  get objectCount(): number { return this.owned.length + this.transient.size + this.windows.objectCount; }
  get speed(): PlaybackSpeed { return this.currentSpeed; }
  set speed(value: PlaybackSpeed) { this.currentSpeed = value; this.refreshWindows(); }

  /** Show `snapshot` immediately: HP, defeated state and the upcoming turns. */
  render(snapshot: BattleSnapshot): void {
    if (this.disposed) return;
    this.active = snapshot.active;
    for (const combatant of snapshot.combatants) {
      this.hp.set(combatant.id, combatant.hp);
      const battler = this.battlers.get(combatant.id);
      if (!battler) continue;
      battler.combatant = combatant;
      battler.home = battlerPosition(combatant.side, combatant, this.floor, this.opening);
      battler.sprite.setPosition(battler.home.x, battler.home.y).setDepth(DEPTH.battler + battler.home.y / 10000).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      battler.sprite.setAlpha(combatant.hp > 0 ? 1 : 0.25);
      this.drawHp(combatant.id);
    }
    for (const event of snapshot.events) this.noteFacing(event);
    for (const battler of this.battlers.values()) this.face(battler);
    this.drawShields(snapshot);
    this.showBars();
    if (snapshot.phase === 'escaped') for (const battler of this.battlers.values()) if (battler.combatant.side === 'party') battler.sprite.setAlpha(0);
    snapshot.timeline.slice(0, TIMELINE_ICONS).forEach((turn, index) => {
      const icon = this.timeline[index]!;
      const battler = this.battlers.get(turn.actor);
      if (battler?.creature) icon.setTexture(this.options.creatures!.texture, battler.creature.still).setScale(0.6);
      else icon.setTexture(this.options.atlas, battler?.combatant.frame ?? 'spark').setScale(0.75);
      icon.setVisible(true);
    });
    for (let index = snapshot.timeline.length; index < TIMELINE_ICONS; index += 1) this.timeline[index]!.setVisible(false);
    const first = snapshot.timeline.length ? this.timeline[0]! : null;
    this.timelineMarker.setVisible(first !== null);
    if (first) this.timelineMarker.setPosition(first.x, first.y);
    this.refreshWindows();
  }

  /** Show the command windows for the current menu state, or hide them (null) while nothing is being chosen. */
  setMenu(menu: StageMenu | null): void {
    if (this.disposed) return;
    this.menu = menu;
    const target = menu?.target ? this.battlers.get(menu.target) : undefined;
    const cell = menu?.cell ?? null;
    this.drawCellGrid(cell);
    this.aimCells.clear();
    if (target && menu?.area) this.drawArea(this.aimCells, menu.area, target.combatant);
    this.targetCursor.setVisible(!!target || !!cell);
    this.showBars();
    if (target) this.targetCursor.setPosition(target.home.x, target.home.y - 26 * target.home.scale);
    else if (cell) { const at = this.cellCentre(cell); this.targetCursor.setPosition(at.x, at.y - 26); }
    this.refreshWindows();
  }

  /** How each battler is drawn and its current frame, for tests and the runtime snapshot. */
  artState(): Record<string, { source: 'creature' | 'frame'; frame: string; shields: number; x: number; y: number; faces: 'left' | 'right'; bar: boolean }> {
    return Object.fromEntries([...this.battlers].map(([id, b]) => [id, { source: b.creature ? 'creature' : 'frame', frame: b.sprite.frame.name, shields: b.shieldCount, x: Math.round(b.sprite.x), y: Math.round(b.sprite.y), faces: this.facesRight(b) ? 'right' : 'left', bar: !!b.bar?.visible }]));
  }

  /** Whether a battler should face right: enemies face the party, and in a pincer a member faces the flank it last fought. */
  private facesRight(b: Battler): boolean {
    const c = b.combatant;
    if (c.side === 'party') return this.opening === 'pincer' && this.facing.get(c.id) === 'rear';
    return !(this.opening === 'pincer' && c.flank === 'rear'); // The rear flank stands to the party's right and faces left.
  }
  /** Turn the sprite: party frames and creature stills are drawn facing left (a creature's own facing is baked in). */
  private face(b: Battler): void {
    const right = this.facesRight(b);
    b.sprite.setFlipX(b.creature ? right === (b.creature.faces === 'left') : right);
  }
  /** Pincer: remember which flank each party member last fought (hit, or was hit by). */
  private noteFacing(event: BattleEvent): void {
    if (this.opening !== 'pincer' || event.kind !== 'attack') return;
    const actor = this.battlers.get(event.actor)?.combatant, target = this.battlers.get(event.target)?.combatant;
    if (!actor || !target) return;
    if (actor.side === 'party' && target.flank) this.facing.set(actor.id, target.flank);
    if (target.side === 'party' && actor.flank) this.facing.set(target.id, actor.flank);
  }

  /** Where a one-cell party fighter would stand in this cell. */
  private cellCentre(cell: Cell): { x: number; y: number } {
    const p = battlerPosition('party', { ...cell, lanes: 1, depths: 1 }, this.floor, this.opening);
    return { x: p.x, y: p.y };
  }

  /** The tap area of a party grid cell while choosing where to Move: one lane band by one depth column. */
  cellRect(cell: Cell): Rect {
    const at = this.cellCentre(cell), w = gridSpacing(this.opening).depthStep, h = STAGE_GRID.laneStep;
    return { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2 + 4), w, h };
  }

  /** The party's nine cells as floor outlines, the chosen one bright; cleared when not choosing a cell. */
  private drawCellGrid(selected: Cell | null): void {
    const g = this.cellGrid.clear();
    if (!selected) return;
    for (let lane = 0; lane < 3; lane++) {
      for (let depth = 0; depth < 3; depth++) {
        const r = this.cellRect({ lane, depth }), on = lane === selected.lane && depth === selected.depth;
        g.lineStyle(on ? 2 : 1, on ? 0xe6e3c6 : 0x2e4a66, 1).strokeRect(r.x + 3, r.y + r.h - 12, r.w - 6, 10);
      }
    }
  }

  /** The logical rectangle a tap on this combatant should cover. */
  targetRect(id: string): Rect | null {
    const battler = this.battlers.get(id);
    if (!battler) return null;
    // One lane band tall and one depth column wide per cell, so neighbouring battlers never share a tap area even
    // though their sprites overlap a little (decision 0014 M5.4b).
    const c = battler.combatant, w = gridSpacing(this.opening, c.side).depthStep * c.depths, h = STAGE_GRID.laneStep * c.lanes;
    return { x: Math.round(battler.home.x - w / 2), y: Math.round(battler.home.y - h / 2 + 4), w, h };
  }

  /** Replay `target.events` one at a time from the state before them, then show `target` and call `done`. */
  play(target: BattleSnapshot, done: () => void): void {
    if (this.disposed) return;
    this.finishPending();
    const events = target.events;
    for (const [id, value] of hpBefore(target, events)) { this.hp.set(id, value); this.drawHp(id); }
    for (const battler of this.battlers.values()) battler.sprite.setAlpha((this.hp.get(battler.combatant.id) ?? 0) > 0 ? 1 : 0.25);
    this.pending = { target, events, index: 0, done };
    this.step();
  }

  /** Jump to the end of the current playback. The outcome is already decided, so nothing else changes. */
  skip(): void { this.finishPending(); }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    this.idleLoop?.remove(false);
    this.idleLoop = null;
    this.clearMotion();
    this.blink.remove();
    this.windows.destroy();
    for (const object of this.owned) object.destroy();
    this.owned.length = 0;
    this.battlers.clear();
    // The creature texture belongs to this battle (decision 0015 C3); the next battle adds it again from the cache.
    const creatures = this.options.creatures;
    if (creatures && this.scene.textures.exists(creatures.texture)) this.scene.textures.remove(creatures.texture);
    if (this.font) releasePixelFont(this.scene);
  }

  private step(): void {
    const pending = this.pending;
    if (!pending || this.disposed) return;
    const event = pending.events[pending.index];
    if (!event) { this.finishPending(); return; }
    pending.index += 1;
    const duration = stepDuration(event, this.currentSpeed);
    this.active = event.actor;
    this.banner = this.actionLine(event);
    this.refreshWindows();
    this.animate(event, duration, pending.target.turn * 8 + pending.index);
    this.after(duration, () => this.step());
  }

  private finishPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.banner = '';
    this.clearMotion();
    this.render(pending.target);
    pending.done();
  }

  /** FF-style action line: who acts and with what. */
  private actionLine(event: BattleEvent): string {
    const actor = this.battlers.get(event.actor)?.combatant.name ?? '';
    const action = event.kind === 'attack' ? 'Attack' : event.kind === 'guard' ? 'Guard' : event.kind === 'escape' ? 'Run'
      : event.kind === 'move' ? 'Move' : event.kind === 'area' ? event.name : this.options.itemName(event.itemId);
    return `${actor}: ${action}`;
  }

  private refreshWindows(): void {
    if (this.disposed) return;
    const playing = this.playing, menu = this.menu;
    const all = [...this.battlers.values()].sort((a, b) => a.combatant.slot - b.combatant.slot);
    this.windows.render({
      help: playing ? this.banner : menu?.help ?? '',
      hint: playing ? `Speed ${this.currentSpeed}x` : '',
      target: playing ? null : menu?.target ?? null,
      enemies: all.filter(b => b.combatant.side === 'enemy').map(b => ({ id: b.combatant.id, name: b.combatant.name, defeated: (this.hp.get(b.combatant.id) ?? 0) <= 0, hp: this.hp.get(b.combatant.id) ?? 0, maxHp: b.combatant.maxHp })),
      party: all.filter(b => b.combatant.side === 'party').map(b => ({ id: b.combatant.id, name: b.combatant.name, hp: this.hp.get(b.combatant.id) ?? 0,
        maxHp: b.combatant.maxHp, mp: b.combatant.mp, maxMp: b.combatant.maxMp, active: b.combatant.id === this.active })),
      commands: menu?.commands ?? [],
      commandCursor: menu?.commandCursor ?? 0,
      commandInactive: menu?.commandInactive ?? false,
      list: playing ? null : menu?.list ?? null,
      showCommands: !playing && menu !== null,
    });
  }

  private animate(event: BattleEvent, duration: number, seed: number): void {
    const actor = this.battlers.get(event.actor);
    if (!actor) return;
    if (event.kind === 'escape') {
      for (const battler of this.battlers.values()) if (battler.combatant.side === 'party')
        this.tween({ targets: battler.sprite, x: battler.home.x + 96, alpha: 0, duration: duration * 0.8 });
      return;
    }
    if (event.kind === 'guard') {
      this.float(actor, 'Guard', 0x88c2c3, duration);
      return;
    }
    if (event.kind === 'move') {
      // The fighter slides to its new cell; a swapped ally slides into the cell it left (decision 0014 M5.4c).
      const slide = (battler: Battler, to: Cell): void => {
        const at = this.cellCentre(to);
        if (this.options.reducedMotion) battler.sprite.setPosition(at.x, at.y);
        else this.tween({ targets: battler.sprite, x: at.x, y: at.y, duration: Math.round(duration * 0.8), ease: 'Quad.easeInOut' });
        battler.sprite.setDepth(DEPTH.battler + at.y / 10000);
      };
      slide(actor, event.to);
      const other = event.swapped ? this.battlers.get(event.swapped) : undefined;
      if (other) slide(other, event.from);
      return;
    }
    if (event.kind === 'area') { this.animateArea(actor, event, duration); return; }
    const target = this.battlers.get(event.target);
    if (!target) return;
    if (event.kind === 'heal') {
      this.hp.set(event.target, (this.hp.get(event.target) ?? 0) + event.amount);
      this.drawHp(event.target);
      this.refreshWindows();
      this.float(target, `+${event.amount}`, 0x8fe08f, duration);
      return;
    }
    const lead = Math.round(duration * 0.3);
    if (this.opening === 'pincer') { this.noteFacing(event); this.face(actor); this.face(target); }
    if (!this.options.reducedMotion) {
      const direction = target.home.x > actor.home.x ? 1 : -1;
      this.tween({ targets: actor.sprite, x: actor.home.x + direction * 18, duration: lead, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.after(lead, () => {
      this.hp.set(event.target, this.afterHit(event.target, event.damage, event.affinity));
      this.drawHp(event.target);
      this.holdBar(event.target, duration - lead + 700);
      this.refreshWindows();
      const flashMs = Math.max(40, Math.round(duration * 0.15));
      if (target.creature) {
        // The baked flash lights the body only; the shadow stays on the floor.
        target.flashing = true;
        target.sprite.setFrame(target.creature.flash);
        this.after(flashMs, () => { target.flashing = false; target.sprite.setFrame(this.restFrame(target)); });
      } else {
        target.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.after(flashMs, () => target.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      }
      this.floatHit(target, event.damage, event.guarded, event.affinity, duration - lead);
      this.options.impact({ x: target.home.x, y: target.home.y }, seed);
      if (event.defeated) this.tween({ targets: target.sprite, alpha: 0.25, delay: Math.round((duration - lead) * 0.4), duration: Math.round((duration - lead) * 0.5) });
    });
  }

  /**
   * An area attack (decision 0014 M5.4f, Ariel: lit cells, then numbers together): the party cells it covers light up on
   * the floor, brightest at the centre and dimmer by falloff; then every member hit takes its number at once.
   */
  private animateArea(actor: Battler, event: Extract<BattleEvent, { kind: 'area' }>, duration: number): void {
    const lead = Math.round(duration * 0.45);
    // Transient, like the damage numbers: released when it fades, or by clearMotion when playback is skipped or ends.
    // Drawn over the battlers (translucent, under the numbers), so lanes in front never hide a lit cell.
    const cells = this.scene.add.graphics().setDepth(DEPTH.battler + 0.09).setScrollFactor(0);
    this.transient.add(cells);
    // The grid that was struck: the party's for an enemy ability, the enemies' (one flank in a pincer) for a party skill.
    const struck = this.battlers.get(event.hits[0]?.target ?? '')?.combatant;
    this.drawArea(cells, event.shape, event.centre, struck?.side ?? (actor.combatant.side === 'party' ? 'enemy' : 'party'), struck?.flank ?? null);
    this.tween({ targets: cells, alpha: { from: 1, to: 0 }, delay: lead, duration: duration - lead, onComplete: () => { this.transient.delete(cells); cells.destroy(); } });
    if (!this.options.reducedMotion) this.tween({ targets: actor.sprite, y: actor.home.y - 10, duration: Math.round(lead / 2), yoyo: true, ease: 'Quad.easeOut' });
    this.after(lead, () => {
      for (const hit of event.hits) {
        const target = this.battlers.get(hit.target);
        if (!target) continue;
        this.hp.set(hit.target, this.afterHit(hit.target, hit.damage, hit.affinity));
        this.floatHit(target, hit.damage, hit.guarded, hit.affinity, duration - lead);
        if (hit.defeated) this.tween({ targets: target.sprite, alpha: 0.25, delay: Math.round((duration - lead) * 0.4), duration: Math.round((duration - lead) * 0.5) });
      }
      this.refreshWindows();
    });
  }

  /**
   * Light an area's cells on one grid: a strip under each cell's feet (2× sprites reach 32 pixels below their centre),
   * brighter toward full damage, and the centre outlined, so the falloff reads at a glance without covering anyone's
   * body. Given a combatant, the area is centred on it, on its own grid.
   */
  private drawArea(g: Phaser.GameObjects.Graphics, shape: AreaShape, centre: Cell | CombatantSnapshot, side?: 'party' | 'enemy', flank?: 'front' | 'rear' | null): void {
    const on = 'side' in centre ? { side: centre.side, flank: centre.flank } : { side: side ?? 'party', flank: flank ?? null };
    const w = gridSpacing(this.opening, on.side).depthStep - 8;
    for (let lane = 0; lane < 3; lane++) for (let depth = 0; depth < 3; depth++) {
      const percent = areaPercentAt(shape, centre, { lane, depth });
      if (!percent) continue;
      const at = battlerPosition(on.side, { lane, depth, lanes: 1, depths: 1, flank: on.flank }, this.floor, this.opening);
      const x = Math.round(at.x - w / 2), y = at.y + 26;
      g.fillStyle(0xe6c27a, 0.3 + 0.5 * percent / 100).fillRect(x, y, w, 8);
      if (lane === centre.lane && depth === centre.depth) g.lineStyle(2, 0xfff1c4, 1).strokeRect(x - 1, y - 1, w + 2, 10);
    }
  }

  /** HP after a hit: down by its damage, or up when the target absorbed it (decision 0018). */
  private afterHit(id: string, damage: number, affinity?: string): number {
    const hp = this.hp.get(id) ?? 0;
    return affinity === 'absorb' ? hp + damage : Math.max(0, hp - damage);
  }
  /**
   * A hit's number: green with + when absorbed, "Immune" when it did nothing, grey when guarded. A weak hit is gold with
   * "Weak!" above it, a resisted one grey-blue with "Resist" (Ariel, M5.5b-2: word plus colour).
   */
  private floatHit(target: Battler, damage: number, guarded: boolean, affinity: string | undefined, duration: number): void {
    if (affinity === 'immune') this.float(target, 'Immune', AFFINITY_COLOR.immune, duration);
    else if (affinity === 'absorb') this.float(target, `+${damage}`, AFFINITY_COLOR.absorb, duration);
    else if (affinity === 'weak' || affinity === 'resist') {
      // The word sits a line above the number. On the top lane there is no room above, so the pair starts lower and
      // rises less, staying on the stage floor instead of crossing the turn timeline.
      const top = target.home.y - 56, shift = Math.max(0, this.floor.top - top), lift = Math.max(0, Math.min(16, top + shift - this.floor.top));
      this.float(target, affinity === 'weak' ? 'Weak!' : 'Resist', AFFINITY_COLOR[affinity], duration, shift - 16, lift);
      this.float(target, String(damage), AFFINITY_COLOR[affinity], duration, shift, lift);
    } else this.float(target, String(damage), guarded ? 0xb7c9d0 : 0xffffff, duration);
  }

  /** A label that rises `lift` pixels and fades; `offset` moves its start from 40 pixels above the battler's centre. */
  private float(battler: Battler, text: string, color: number, duration: number, offset = 0, lift = 16): void {
    const label = this.label(battler.home.x, battler.home.y - 40 + offset, text, color)
      .setOrigin(0.5, 0).setDepth(DEPTH.numbers).setScrollFactor(0);
    this.transient.add(label);
    this.tween({ targets: label, y: label.y - (this.options.reducedMotion ? 0 : lift), alpha: { from: 1, to: 0 }, duration, ease: 'Quad.easeIn',
      onComplete: () => { this.transient.delete(label); label.destroy(); } });
  }

  /** A crisp 1:1 bitmap label with a hard one-pixel shadow, or plain canvas text when the font is unavailable. */
  private label(x: number, y: number, text: string, color: number): Label {
    if (!this.font) return this.scene.add.text(x, y, text, { ...FALLBACK_TEXT, color: `#${color.toString(16).padStart(6, '0')}` });
    return this.scene.add.bitmapText(x, y, this.font, text, PIXEL_FONT_BITMAP_SIZE).setTint(color).setTintMode(Phaser.TintModes.FILL).setDropShadow(1, 1, SHADOW_COLOR, 1);
  }

  /** The on-stage target pointer: a ▼ drawn in 2 × 2 blocks (one battler pixel), outlined, centred on its position. */
  private downPointer(): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    for (let row = 0; row < 6; row += 1) {
      const half = 5 - row;
      g.fillStyle(PANEL_STYLE.outline, 1).fillRect((-half - 1) * 2, (row - 1) * 2, (half * 2 + 3) * 2, 4);
    }
    for (let row = 0; row < 6; row += 1) {
      const half = 5 - row;
      g.fillStyle(PANEL_STYLE.cursor, 1).fillRect(-half * 2, row * 2, (half * 2 + 1) * 2, 2);
    }
    return g;
  }

  /** Which stage HP bars show: a living enemy's, while it is targeted or just after a hit. */
  private showBars(): void {
    for (const b of this.battlers.values()) {
      if (!b.bar) continue;
      const on = (this.hp.get(b.combatant.id) ?? 0) > 0 && (b.barHold || this.menu?.target === b.combatant.id);
      b.bar.setVisible(on); b.barBack?.setVisible(on);
    }
  }
  /** Show an enemy's stage bar for a moment after it is hit. */
  private holdBar(id: string, ms: number): void {
    const b = this.battlers.get(id);
    if (!b?.bar) return;
    b.barHold = true; this.showBars();
    this.after(ms, () => { b.barHold = false; this.showBars(); });
  }

  private drawHp(id: string): void {
    const battler = this.battlers.get(id);
    if (!battler?.bar) return;
    const hp = this.hp.get(id) ?? 0, max = battler.combatant.maxHp;
    battler.bar.setSize(Math.max(0, Math.round(battler.barWidth * hp / max)), 5);
    battler.bar.setFillStyle(hp * 4 <= max ? 0xd9705f : 0x6fbf73);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): void {
    const tween = this.scene.tweens.add({ ...config, onComplete: (...args) => { this.tweens.delete(tween); (config.onComplete as ((...a: unknown[]) => void) | undefined)?.(...args); } });
    this.tweens.add(tween);
  }

  /**
   * One small pip per living ally standing between a battler and its attackers (decision 0014): one pip takes 20% off,
   * two take 35%. Measured from the side the opposing group attacks from; a back attack turns the party around.
   */
  private drawShields(snapshot: BattleSnapshot): void {
    const living = snapshot.combatants.filter(c => c.hp > 0);
    for (const battler of this.battlers.values()) {
      const c = snapshot.combatants.find(other => other.id === battler.combatant.id);
      const g = battler.shields.clear();
      battler.shieldCount = 0;
      if (!c || c.hp <= 0 || snapshot.phase === 'escaped') continue;
      const allies = living.filter(o => o.id !== c.id && o.side === c.side && o.flank === c.flank);
      // The party measures from where the enemy attacks: behind in a back attack, the faced flank in a pincer.
      const from = c.side !== 'party' ? 'front' : snapshot.opening === 'back-attack' ? 'rear' : snapshot.opening === 'pincer' ? this.facing.get(c.id) ?? 'front' : 'front';
      const count = Math.min(2, alliesAhead(c, allies, from));
      battler.shieldCount = count;
      const s = battler.home.scale, x = battler.home.x - 16 * s, y = battler.home.y - 20 * s;
      for (let i = 0; i < count; i++) {
        g.fillStyle(SHADOW_COLOR, 1).fillRect(x + i * 7 - 1, y - 1, 7, 8);
        g.fillStyle(0x88c2c3, 1).fillRect(x + i * 7, y, 5, 6).fillStyle(0x0b111b, 1).fillRect(x + i * 7 + 2, y + 2, 1, 3);
      }
    }
  }

  private creatureOf(combatant: CombatantSnapshot): CreatureFrames | null {
    const art = this.options.creatures;
    if (!art || !combatant.creature) return null;
    return art.creatures.get(creatureKey(combatant.creature, combatant.faces)) ?? null;
  }

  /** The frame a creature shows when nothing else is happening: its idle loop, or its still pose with reduced motion. */
  private restFrame(battler: Battler): string {
    const c = battler.creature!;
    if (this.options.reducedMotion) return c.still;
    const step = Math.floor((this.scene.time.now + battler.combatant.slot * PHASE_STAGGER_MS) / c.idleMs);
    return c.idle[step % c.idle.length]!;
  }

  private idle(): void {
    if (this.disposed) return;
    for (const battler of this.battlers.values()) {
      if (!battler.creature || battler.flashing) continue;
      const frame = this.restFrame(battler);
      if (battler.sprite.frame.name !== frame) battler.sprite.setFrame(frame);
    }
  }

  private after(delay: number, callback: () => void): void {
    const timer = this.scene.time.delayedCall(delay, () => { this.timers.delete(timer); callback(); });
    this.timers.add(timer);
  }

  private clearMotion(): void {
    for (const b of this.battlers.values()) b.barHold = false;
    for (const timer of this.timers) timer.remove(false);
    this.timers.clear();
    for (const tween of this.tweens) tween.remove();
    this.tweens.clear();
    for (const object of this.transient) object.destroy();
    this.transient.clear();
  }

  private own<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.owned.push(object);
    return object;
  }
}
