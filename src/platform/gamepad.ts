import { chooseGamepad, collectGamepads } from './gamepad-reader';
import type { PadEnumeration, PadIdentity } from './gamepad-reader';
import { CONTROLLER_KEY, NO_PAD_INPUT, PadLatch, axisValue, buttonPressed, defaultControllerConfig, parseControllerConfig } from './gamepad-model';
import type { ControllerConfig, PadInput, PadState } from './gamepad-model';

export interface GamepadSource {
  poll(active: boolean): Readonly<PadInput>;
  reset(): void;
}

/** One app-owned native sampler, independent of Phaser/map readiness.
 * RAF reads devices only; the existing scene still owns all gameplay consumption.
 */
export class GamepadController implements GamepadSource {
  private readonly lifetime = new AbortController();
  private readonly latch = new PadLatch();
  private config = defaultControllerConfig();
  private selection: PadIdentity | null = null;
  private automatic: PadIdentity | null = null;
  private frame: number | null = null;
  private frameSamples = 0;
  private connectionEvents = 0;
  private disconnectionEvents = 0;
  private readonly enumeration: PadEnumeration = { rawSlotCount: 0, nonNullCount: 0, connectedCount: 0 };
  private disposed = false;
  private problem = '';
  private storageMessage = '';
  private readonly pads: PadState[] = [];
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
    window.addEventListener('gamepaddisconnected', () => {
      this.disconnectionEvents += 1;
      this.reset(); this.scan();
    }, options);
    window.addEventListener('gamepadconnected', (event) => {
      this.connectionEvents += 1;
      // Follow the newly connected pad in automatic mode, as MouseJoy does.
      if (!this.selection) this.automatic = { index: event.gamepad.index, id: event.gamepad.id };
      this.reset(); this.scan();
    }, options);
    this.scan();
    this.frame = requestAnimationFrame(this.sampleFrame);
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
    if (!this.gameplayRequested) return prefix + 'Detected; gameplay paused. Close settings or finish editing a form control to resume.';
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
      collectGamepads(navigator.getGamepads(), this.pads, this.enumeration);
      this.problem = '';
    } catch (cause) {
      this.pads.length = 0; this.chosen = null; this.automatic = null; this.reset();
      this.enumeration.rawSlotCount = 0; this.enumeration.nonNullCount = 0; this.enumeration.connectedCount = 0;
      const detail = cause instanceof Error ? `${cause.name}: ${cause.message}`.slice(0, 200) : 'No readable API result';
      this.problem = `Controller API unavailable or blocked. Use localhost or HTTPS; keyboard and touch still work. ${detail}`;
      return;
    }
    this.chosen = chooseGamepad(this.pads, this.selection, this.automatic);
    this.automatic = this.chosen ? { index: this.chosen.index, id: this.chosen.id } : null;
  }

  private readonly sampleFrame = (): void => {
    this.frame = null;
    if (this.disposed) return;
    this.scan();
    this.frameSamples += 1;
    this.frame = requestAnimationFrame(this.sampleFrame);
  };

  /** Telemetry may refresh stalled detection, but never arms or consumes input. */
  refreshDetection(): void {
    if (performance.now() - this.lastScan >= 200) this.scan();
  }

  rescan(): void { this.reset(); this.scan(); }

  poll(active: boolean): Readonly<PadInput> {
    if (this.disposed) return NO_PAD_INPUT;
    this.refreshDetection();
    this.lastPoll = performance.now();
    this.gameplayRequested = active;
    return this.latch.sample(this.chosen, this.config, active && !document.hidden && document.hasFocus());
  }

  /** Bounded copies for a user-requested report, never a mutable Gamepad reference. */
  diagnostics(): object {
    return {
      inputReader: 'mousejoy-frame-v1',
      sampling: { ...this.enumeration, frameSamples: this.frameSamples,
        framePending: this.frame !== null, connectionEvents: this.connectionEvents,
        disconnectionEvents: this.disconnectionEvents,
        lastScanAgeMs: Number.isFinite(this.lastScan) ? Math.round(performance.now() - this.lastScan) : null },
      secureContext: window.isSecureContext,
      apiAvailable: typeof navigator.getGamepads === 'function',
      documentFocused: document.hasFocus(), documentHidden: document.hidden,
      selectedIndex: this.selectedIndex, detectedCount: this.pads.length,
      chosenIndex: this.chosen?.index ?? null, gameplayRequested: this.gameplayRequested,
      waitingForNeutral: this.latch.waitingForNeutral,
      lastGameplayPollAgeMs: this.lastPoll === null ? null : Math.round(performance.now() - this.lastPoll),
      status: this.status, persistence: this.storageMessage, settings: this.settings,
      omittedDeviceDetails: Math.max(0, this.pads.length - 16),
      devices: this.pads.slice(0, 16).map((pad) => ({
        id: pad.id.slice(0, 200), index: pad.index, mapping: pad.mapping, connected: pad.connected,
        axisCount: pad.axes.length, buttonCount: pad.buttons.length,
        axes: pad.axes.slice(0, 16).map((_, i) => axisValue(pad, i)),
        pressedButtons: pad.buttons.slice(0, 64).flatMap((_, i) => buttonPressed(pad, i) ? [i] : []),
      })),
    };
  }

  reset(): void { this.latch.reset(); this.gameplayRequested = false; }
  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.lifetime.abort(); this.reset(); this.pads.length = 0; this.chosen = null; this.automatic = null;
  }
}
