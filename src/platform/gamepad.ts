import { CONTROLLER_KEY, NO_PAD_INPUT, PadLatch, defaultControllerConfig, parseControllerConfig } from './gamepad-model';
import type { ControllerConfig, PadInput, PadState } from './gamepad-model';

export interface GamepadSource {
  poll(active: boolean): Readonly<PadInput>;
  reset(): void;
}

/** One app-owned service; sampled by the existing scene update, not another RAF loop. */
export class GamepadController implements GamepadSource {
  private readonly lifetime = new AbortController();
  private readonly latch = new PadLatch();
  private config = defaultControllerConfig();
  private selection: { index: number; id: string } | null = null;
  private disposed = false;
  private problem = '';
  private storageMessage = '';
  private pads: readonly PadState[] = [];
  private chosen: PadState | null = null;

  constructor() {
    try {
      const text = localStorage.getItem(CONTROLLER_KEY);
      if (text !== null) {
        const parsed = text.length <= 4096 ? parseControllerConfig(JSON.parse(text)) : null;
        if (parsed) this.config = parsed;
        else this.storageMessage = 'Invalid saved settings ignored; defaults are active.';
      }
    } catch { this.storageMessage = 'Saved settings unavailable; using defaults for this session.'; }
    const options = { signal: this.lifetime.signal };
    window.addEventListener('blur', () => this.reset(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); }, options);
    window.addEventListener('gamepaddisconnected', () => this.reset(), options);
    window.addEventListener('gamepadconnected', () => this.reset(), options);
  }

  get settings(): ControllerConfig { return { ...this.config, buttons: { ...this.config.buttons } }; }
  get devices(): readonly PadState[] { return this.pads; }
  get selectedIndex(): number | null { return this.selection?.index ?? null; }
  get current(): PadState | null { return this.chosen; }
  get persistenceStatus(): string { return this.storageMessage; }

  get status(): string {
    if (this.problem) return this.problem;
    if (!this.config.enabled) return 'Controller input is disabled.';
    if (!this.chosen) return this.selection ? 'Selected controller disconnected. Reconnect it or choose Automatic.' :
      'Press a controller button once to let the browser detect it, then release the controls.';
    const name = this.chosen.id.slice(0, 160);
    if (this.chosen.mapping !== 'standard' && !this.config.allowUnmapped) return `${name}: non-standard mapping. Configure bindings and enable custom mapping.`;
    return `${name} · ${this.chosen.mapping || 'custom'} · ${this.latch.waitingForNeutral ? 'Return to the game and release controls to resume.' : 'Ready'}`;
  }

  select(index: number | null): void {
    const pad = this.pads.find((item) => item.index === index);
    this.selection = pad ? { index: pad.index, id: pad.id } : null;
    this.reset();
  }

  configure(value: unknown): boolean {
    const parsed = parseControllerConfig(value);
    if (!parsed) return false;
    this.config = parsed;
    this.reset();
    try {
      localStorage.setItem(CONTROLLER_KEY, JSON.stringify(parsed));
      this.storageMessage = 'Settings saved in this browser.';
    } catch { this.storageMessage = 'Storage unavailable: settings work for this session only.'; }
    return true;
  }

  poll(active: boolean): Readonly<PadInput> {
    if (this.disposed) return NO_PAD_INPUT;
    try {
      if (typeof navigator.getGamepads !== 'function') throw new Error('unavailable');
      this.pads = Array.from(navigator.getGamepads()).slice(0, 16)
        .filter((pad): pad is Gamepad => !!pad?.connected);
      this.problem = '';
    } catch {
      this.pads = []; this.chosen = null; this.reset();
      this.problem = 'Controller API unavailable or blocked. Use localhost or HTTPS; keyboard and touch still work.';
      return NO_PAD_INPUT;
    }
    this.chosen = this.selection ? this.pads.find((pad) => pad.index === this.selection!.index && pad.id === this.selection!.id) ?? null :
      this.pads.find((pad) => pad.mapping === 'standard') ?? this.pads[0] ?? null;
    return this.latch.sample(this.chosen, this.config, active && !document.hidden && document.hasFocus());
  }

  reset(): void { this.latch.reset(); }
  dispose(): void {
    this.disposed = true; this.lifetime.abort(); this.reset(); this.pads = []; this.chosen = null;
  }
}
