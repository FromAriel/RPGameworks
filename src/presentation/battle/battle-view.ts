import Phaser from 'phaser';
import type { BattleEvent, BattleSnapshot, CombatantSnapshot } from '../../domain/battle';
import type { MenuEntry } from '../../domain/battle-menu';
import { battlerPosition, hpBefore, stepDuration } from './playback';
import type { PlaybackSpeed } from './playback';
import { BattleWindows, PANEL_STYLE } from './battle-windows';
import type { BattleLayout, Rect } from './battle-windows';
import type { SkinPainter } from '../skin/paint';
import { PIXEL_FONT_BITMAP_SIZE, addPixelFont, releasePixelFont } from '../pixel-font';
import type { CreatureArt } from '../../platform/creature-loader';
import type { CreatureFrames } from '../../content/creature-atlas.mjs';
import { creatureKey } from '../../content/creature-atlas.mjs';

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
const TIMELINE_ICONS = 8;
/** Idle loops advance on this tick; each creature keeps its own loop time and a phase offset by slot (decision 0015). */
const IDLE_TICK_MS = 50;
const PHASE_STAGGER_MS = 97;

interface Battler {
  readonly combatant: CombatantSnapshot;
  readonly sprite: Phaser.GameObjects.Image;
  /** Enemy HP bar; party HP is shown in the party window. */
  readonly bar: Phaser.GameObjects.Rectangle | null;
  readonly home: { x: number; y: number };
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

  constructor(private readonly scene: Phaser.Scene, initial: BattleSnapshot, private readonly options: BattleViewOptions) {
    const { width, height } = scene.scale;
    this.font = addPixelFont(scene);
    // The windows come first: the skin decides the help window's height, and the timeline sits just below it.
    this.windows = new BattleWindows(scene, (x, y, text, color) => this.label(x, y, text, color), DEPTH.windows, options.skin ?? null);
    const TIMELINE_Y = this.windows.layout.timelineY;
    this.own(scene.add.rectangle(0, 0, width, height, 0x0b111b).setOrigin(0).setDepth(DEPTH.backdrop));
    this.own(scene.add.rectangle(0, 112, width, 104, 0x18243a).setOrigin(0).setDepth(DEPTH.floor));
    this.own(scene.add.rectangle(0, 112, width, 2, 0x2e4a66).setOrigin(0).setDepth(DEPTH.floor));
    this.own(this.label(8, TIMELINE_Y - 8, 'Next', TEXT_COLOR).setDepth(DEPTH.ui));
    this.timelineMarker = this.own(scene.add.rectangle(0, 0, 36, 36).setStrokeStyle(2, 0x88c2c3).setDepth(DEPTH.ui));
    for (let index = 0; index < TIMELINE_ICONS; index += 1) {
      this.timeline.push(this.own(scene.add.image(64 + index * 40, TIMELINE_Y, options.atlas, 'spark').setDepth(DEPTH.ui).setVisible(false)));
    }
    for (const combatant of initial.combatants) {
      const home = battlerPosition(combatant.side, combatant.slot);
      const creature = this.creatureOf(combatant);
      const sprite = this.own(creature
        ? scene.add.image(home.x, home.y, options.creatures!.texture, creature.still).setFlipX(creature.faces === 'left')
        : scene.add.image(home.x, home.y, options.atlas, combatant.frame)).setScale(2).setDepth(DEPTH.battler + home.y / 10000);
      let bar: Phaser.GameObjects.Rectangle | null = null;
      if (combatant.side === 'enemy') {
        this.own(scene.add.rectangle(home.x - BAR_WIDTH / 2, home.y + 38, BAR_WIDTH, 5, 0x080c14).setOrigin(0).setDepth(DEPTH.ui));
        bar = this.own(scene.add.rectangle(home.x - BAR_WIDTH / 2, home.y + 38, BAR_WIDTH, 5, 0x6fbf73).setOrigin(0).setDepth(DEPTH.ui));
      }
      this.battlers.set(combatant.id, { combatant, sprite, bar, home, creature, flashing: false });
    }
    // Creatures breathe on their own idle loops; reduced motion keeps each one still (decision 0015 C3).
    if (!options.reducedMotion && [...this.battlers.values()].some(b => b.creature)) {
      this.idleLoop = scene.time.addEvent({ delay: IDLE_TICK_MS, loop: true, callback: () => this.idle() });
    }
    this.targetCursor = this.own(this.downPointer()).setDepth(DEPTH.windows).setVisible(false);
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
      battler.sprite.setPosition(battler.home.x, battler.home.y).clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      battler.sprite.setAlpha(combatant.hp > 0 ? 1 : 0.25);
      this.drawHp(combatant.id);
    }
    if (snapshot.phase === 'escaped') for (const battler of this.battlers.values()) if (battler.combatant.side === 'party') battler.sprite.setAlpha(0);
    snapshot.timeline.slice(0, TIMELINE_ICONS).forEach((turn, index) => {
      const icon = this.timeline[index]!;
      const battler = this.battlers.get(turn.actor);
      if (battler?.creature) icon.setTexture(this.options.creatures!.texture, battler.creature.still).setScale(0.8);
      else icon.setTexture(this.options.atlas, battler?.combatant.frame ?? 'spark').setScale(1);
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
    this.targetCursor.setVisible(!!target);
    if (target) this.targetCursor.setPosition(target.home.x, target.home.y - 52);
    this.refreshWindows();
  }

  /** How each battler is drawn and its current frame, for tests and the runtime snapshot. */
  artState(): Record<string, { source: 'creature' | 'frame'; frame: string }> {
    return Object.fromEntries([...this.battlers].map(([id, b]) => [id, { source: b.creature ? 'creature' : 'frame', frame: b.sprite.frame.name }]));
  }

  /** The logical rectangle a tap on this combatant should cover. */
  targetRect(id: string): Rect | null {
    const battler = this.battlers.get(id);
    return battler ? { x: battler.home.x - 32, y: battler.home.y - 40, w: 64, h: 84 } : null;
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
      : event.kind === 'move' ? 'Move' : this.options.itemName(event.itemId);
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
      enemies: all.filter(b => b.combatant.side === 'enemy').map(b => ({ id: b.combatant.id, name: b.combatant.name, defeated: (this.hp.get(b.combatant.id) ?? 0) <= 0 })),
      party: all.filter(b => b.combatant.side === 'party').map(b => ({ id: b.combatant.id, name: b.combatant.name, hp: this.hp.get(b.combatant.id) ?? 0,
        maxHp: b.combatant.maxHp, active: b.combatant.id === this.active })),
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
    if (event.kind === 'move') return; // The battle screen draws grid positions and movement in M5.4b–c (decision 0014).
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
    if (!this.options.reducedMotion) {
      const direction = target.home.x > actor.home.x ? 1 : -1;
      this.tween({ targets: actor.sprite, x: actor.home.x + direction * 18, duration: lead, yoyo: true, ease: 'Quad.easeOut' });
    }
    this.after(lead, () => {
      this.hp.set(event.target, Math.max(0, (this.hp.get(event.target) ?? 0) - event.damage));
      this.drawHp(event.target);
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
      this.float(target, String(event.damage), event.guarded ? 0xb7c9d0 : 0xffffff, duration - lead);
      this.options.impact({ x: target.home.x, y: target.home.y }, seed);
      if (event.defeated) this.tween({ targets: target.sprite, alpha: 0.25, delay: Math.round((duration - lead) * 0.4), duration: Math.round((duration - lead) * 0.5) });
    });
  }

  private float(battler: Battler, text: string, color: number, duration: number): void {
    const label = this.label(battler.home.x, battler.home.y - 40, text, color)
      .setOrigin(0.5, 0).setDepth(DEPTH.numbers).setScrollFactor(0);
    this.transient.add(label);
    this.tween({ targets: label, y: label.y - (this.options.reducedMotion ? 0 : 16), alpha: { from: 1, to: 0 }, duration, ease: 'Quad.easeIn',
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

  private drawHp(id: string): void {
    const battler = this.battlers.get(id);
    if (!battler?.bar) return;
    const hp = this.hp.get(id) ?? 0, max = battler.combatant.maxHp;
    battler.bar.setSize(Math.max(0, Math.round(BAR_WIDTH * hp / max)), 5);
    battler.bar.setFillStyle(hp * 4 <= max ? 0xd9705f : 0x6fbf73);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): void {
    const tween = this.scene.tweens.add({ ...config, onComplete: (...args) => { this.tweens.delete(tween); (config.onComplete as ((...a: unknown[]) => void) | undefined)?.(...args); } });
    this.tweens.add(tween);
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
