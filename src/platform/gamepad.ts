import { CONTROLLER_KEY, NO_PAD_INPUT, PadLatch, axisValue, buttonPressed, defaultControllerConfig, parseControllerConfig } from './gamepad-model';
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
  private lastScan = -Infinity;
  private lastPoll: number | null = null;
  private gameplayRequested = false;

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
    const prefix = `${name} · ${this.chosen.mapping || 'custom'} · `;
    if (document.hidden) return prefix + 'Paused: browser tab is hidden.';
    if (!document.hasFocus()) return prefix + 'Paused: focus the game tab, not DevTools or another window.';
    if (!this.gameplayRequested) return prefix + 'Detected; gameplay paused. Close settings and activate the game viewport.';
    return prefix + (this.latch.waitingForNeutral ? 'Waiting for neutral: center the selected stick and release mapped buttons.' : 'Ready');
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

  /** Detection is independent of gameplay permission and works before a scene is ready. */
  private scan(): void {
    if (this.disposed) return;
    this.lastScan = performance.now();
    try {
      if (typeof navigator.getGamepads !== 'function') throw new Error('unavailable');
      this.pads = Array.from(navigator.getGamepads()).slice(0, 16)
        .filter((pad): pad is Gamepad => !!pad?.connected);
      this.problem = '';
    } catch (cause) {
      this.pads = []; this.chosen = null; this.reset();
      const detail = cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 200) : 'No readable API result';
      this.problem = `Controller API unavailable or blocked. Use localhost or HTTPS; keyboard and touch still work. ${detail}`;
      return;
    }
    this.chosen = this.selection ? this.pads.find((pad) => pad.index === this.selection!.index && pad.id === this.selection!.id) ?? null :
      this.pads.find((pad) => pad.mapping === 'standard') ?? this.pads[0] ?? null;
  }

  /** Reuse the 4 Hz UI timer when gameplay has not scanned recently; never arm input here. */
  refreshDetection(): void {
    if (performance.now() - this.lastScan >= 200) this.scan();
  }

  rescan(): void { this.reset(); this.scan(); }

  poll(active: boolean): Readonly<PadInput> {
    if (this.disposed) return NO_PAD_INPUT;
    this.scan();
    this.lastPoll = performance.now();
    this.gameplayRequested = active;
    return this.latch.sample(this.chosen, this.config, active && !document.hidden && document.hasFocus());
  }

  /** Bounded copies for a user-requested report, never a mutable Gamepad reference. */
  diagnostics(): object {
    return {
      secureContext: window.isSecureContext,
      apiAvailable: typeof navigator.getGamepads === 'function',
      documentFocused: document.hasFocus(), documentHidden: document.hidden,
      selectedIndex: this.selectedIndex, detectedCount: this.pads.length,
      chosenIndex: this.chosen?.index ?? null, gameplayRequested: this.gameplayRequested,
      waitingForNeutral: this.latch.waitingForNeutral,
      lastGameplayPollAgeMs: this.lastPoll === null ? null : Math.round(performance.now() - this.lastPoll),
      status: this.status, persistence: this.storageMessage, settings: this.settings,
      devices: this.pads.map((pad) => ({
        id: pad.id.slice(0, 200), index: pad.index, mapping: pad.mapping, connected: pad.connected,
        axisCount: pad.axes.length, buttonCount: pad.buttons.length,
        axes: pad.axes.slice(0, 16).map((_, i) => axisValue(pad, i)),
        pressedButtons: pad.buttons.slice(0, 64).flatMap((_, i) => buttonPressed(pad, i) ? [i] : []),
      })),
    };
  }

  reset(): void { this.latch.reset(); this.gameplayRequested = false; }
  dispose(): void {
    this.disposed = true; this.lifetime.abort(); this.reset(); this.pads = []; this.chosen = null;
  }
}
