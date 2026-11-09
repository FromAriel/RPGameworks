import Phaser from 'phaser';
import type { BattleEvent, BattleSnapshot, CombatantSnapshot } from '../../domain/battle';
import { battlerPosition, hpBefore, stepDuration } from './playback';
import type { PlaybackSpeed } from './playback';

/**
 * Side-view battle stage drawn in screen space over the paused room (M5.3b). It owns every object, tween and timer
 * it creates and releases them in destroy(). It only replays events a BattleSession already resolved.
 */
const DEPTH = { backdrop: 1.5, floor: 1.51, battler: 1.6, ui: 1.7, numbers: 3 } as const;
const BAR_WIDTH = 48;
const FONT = { fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#e6e3c6', stroke: '#080c14', strokeThickness: 3 } as const;
const TIMELINE_ICONS = 8;

interface Battler {
  readonly combatant: CombatantSnapshot;
  readonly sprite: Phaser.GameObjects.Image;
  readonly bar: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly home: { x: number; y: number };
}

export interface BattleViewOptions {
  readonly atlas: string;
  readonly reducedMotion: boolean;
  /** Requests the cosmetic impact cue at a screen position; may do nothing when effects are unavailable. */
  readonly impact: (screen: { x: number; y: number }, seed: number) => void;
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
  private pending: { target: BattleSnapshot; events: readonly BattleEvent[]; index: number; done: () => void } | null = null;
  private disposed = false;
  speed: PlaybackSpeed = 1;

  constructor(private readonly scene: Phaser.Scene, initial: BattleSnapshot, private readonly options: BattleViewOptions) {
    const { width, height } = scene.scale;
    this.own(scene.add.rectangle(0, 0, width, height, 0x0b111b).setOrigin(0).setDepth(DEPTH.backdrop));
    this.own(scene.add.rectangle(0, 112, width, 104, 0x18243a).setOrigin(0).setDepth(DEPTH.floor));
    this.own(scene.add.rectangle(0, 112, width, 2, 0x2e4a66).setOrigin(0).setDepth(DEPTH.floor));
    this.own(scene.add.text(16, 18, 'Next', FONT).setDepth(DEPTH.ui));
    this.timelineMarker = this.own(scene.add.rectangle(0, 0, 36, 36).setStrokeStyle(2, 0x88c2c3).setDepth(DEPTH.ui));
    for (let index = 0; index < TIMELINE_ICONS; index += 1) {
      this.timeline.push(this.own(scene.add.image(64 + index * 40, 26, options.atlas, 'spark').setDepth(DEPTH.ui).setVisible(false)));
    }
    for (const combatant of initial.combatants) {
      const home = battlerPosition(combatant.side, combatant.slot);
      const sprite = this.own(scene.add.image(home.x, home.y, options.atlas, combatant.frame).setScale(2).setDepth(DEPTH.battler + home.y / 10000));
      this.own(scene.add.rectangle(home.x - BAR_WIDTH / 2, home.y + 38, BAR_WIDTH, 5, 0x080c14).setOrigin(0).setDepth(DEPTH.ui));
      const bar = this.own(scene.add.rectangle(home.x - BAR_WIDTH / 2, home.y + 38, BAR_WIDTH, 5, 0x6fbf73).setOrigin(0).setDepth(DEPTH.ui));
      const label = this.own(scene.add.text(home.x, home.y + 46, '', FONT).setOrigin(0.5, 0).setDepth(DEPTH.ui));
      this.battlers.set(combatant.id, { combatant, sprite, bar, label, home });
    }
    for (const object of this.owned) (object as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
    this.render(initial);
  }

  get playing(): boolean { return this.pending !== null; }
  get objectCount(): number { return this.owned.length + this.transient.size; }

  /** Show `snapshot` immediately: HP, defeated state and the upcoming turns. */
  render(snapshot: BattleSnapshot): void {
    if (this.disposed) return;
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
      icon.setFrame(this.battlers.get(turn.actor)?.combatant.frame ?? 'spark').setVisible(true);
    });
    for (let index = snapshot.timeline.length; index < TIMELINE_ICONS; index += 1) this.timeline[index]!.setVisible(false);
    const first = snapshot.timeline.length ? this.timeline[0]! : null;
    this.timelineMarker.setVisible(first !== null);
    if (first) this.timelineMarker.setPosition(first.x, first.y);
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
    this.clearMotion();
    for (const object of this.owned) object.destroy();
    this.owned.length = 0;
    this.battlers.clear();
  }

  private step(): void {
    const pending = this.pending;
    if (!pending || this.disposed) return;
    const event = pending.events[pending.index];
    if (!event) { this.finishPending(); return; }
    pending.index += 1;
    const duration = stepDuration(event, this.speed);
    this.animate(event, duration, pending.target.turn * 8 + pending.index);
    this.after(duration, () => this.step());
  }

  private finishPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.clearMotion();
    this.render(pending.target);
    pending.done();
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
      this.float(actor, 'Guard', '#88c2c3', duration);
      return;
    }
    const target = this.battlers.get(event.target);
    if (!target) return;
    if (event.kind === 'heal') {
      this.hp.set(event.target, (this.hp.get(event.target) ?? 0) + event.amount);
      this.drawHp(event.target);
      this.float(target, `+${event.amount}`, '#8fe08f', duration);
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
      target.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.after(Math.max(40, Math.round(duration * 0.15)), () => target.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      this.float(target, String(event.damage), event.guarded ? '#b7c9d0' : '#ffffff', duration - lead);
      this.options.impact({ x: target.home.x, y: target.home.y }, seed);
      if (event.defeated) this.tween({ targets: target.sprite, alpha: 0.25, delay: Math.round((duration - lead) * 0.4), duration: Math.round((duration - lead) * 0.5) });
    });
  }

  private float(battler: Battler, text: string, color: string, duration: number): void {
    const label = this.scene.add.text(battler.home.x, battler.home.y - 30, text, { ...FONT, fontSize: '14px', color })
      .setOrigin(0.5).setDepth(DEPTH.numbers).setScrollFactor(0);
    this.transient.add(label);
    this.tween({ targets: label, y: label.y - (this.options.reducedMotion ? 0 : 16), alpha: { from: 1, to: 0 }, duration, ease: 'Quad.easeIn',
      onComplete: () => { this.transient.delete(label); label.destroy(); } });
  }

  private drawHp(id: string): void {
    const battler = this.battlers.get(id);
    if (!battler) return;
    const hp = this.hp.get(id) ?? 0, max = battler.combatant.maxHp;
    battler.bar.setSize(Math.max(0, Math.round(BAR_WIDTH * hp / max)), 5);
    battler.bar.setFillStyle(hp * 4 <= max ? 0xd9705f : 0x6fbf73);
    battler.label.setText(`${battler.combatant.name} ${hp}/${max}`);
  }

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): void {
    const tween = this.scene.tweens.add({ ...config, onComplete: (...args) => { this.tweens.delete(tween); (config.onComplete as ((...a: unknown[]) => void) | undefined)?.(...args); } });
    this.tweens.add(tween);
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
