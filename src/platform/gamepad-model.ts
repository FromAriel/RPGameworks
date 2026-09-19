import type { Direction } from '../domain/movement';

export const LEGACY_CONTROLLER_KEY = 'rpgameworks.controller.v1';
export const PREVIOUS_CONTROLLER_KEY = 'rpgameworks.controller.v2';
export const CONTROLLER_KEY = 'rpgameworks.controller.v3';
export const ACTIONS = ['up', 'down', 'left', 'right', 'burst', 'interact', 'cancel', 'menu'] as const;
export type PadAction = typeof ACTIONS[number];
export interface ControllerConfig {
  version: 3;
  enabled: boolean;
  allowUnmapped: boolean;
  deadzone: number;
  axisX: number;
  axisY: number;
  invertX: boolean;
  invertY: boolean;
  buttons: Record<PadAction, number>;
}
export interface PadState {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly (number | { readonly pressed: boolean; readonly value: number })[];
}
export interface PadInput { direction: Direction | null; burst: boolean; interact: boolean; cancel: boolean; menu: boolean }
export const NO_PAD_INPUT: Readonly<PadInput> = Object.freeze({ direction: null, burst: false, interact: false, cancel: false, menu: false });

export function defaultControllerConfig(): ControllerConfig {
  return { version: 3, enabled: true, allowUnmapped: false, deadzone: 0.25,
    axisX: 0, axisY: 1, invertX: false, invertY: false,
    buttons: { up: 12, down: 13, left: 14, right: 15, burst: 0, interact: 2, cancel: 1, menu: 9 } };
}

/** Stored preferences are untrusted; never coerce invalid values into live bindings. */
export function parseControllerConfig(value: unknown): ControllerConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = ['version', 'enabled', 'allowUnmapped', 'deadzone', 'axisX', 'axisY', 'invertX', 'invertY', 'buttons'];
  if (Object.keys(v).some((key) => !keys.includes(key)) || (v.version !== 1 && v.version !== 2 && v.version !== 3)) return null;
  for (const key of ['enabled', 'allowUnmapped', 'invertX', 'invertY']) if (typeof v[key] !== 'boolean') return null;
  if (typeof v.deadzone !== 'number' || !Number.isFinite(v.deadzone) || v.deadzone < 0.05 || v.deadzone > 0.9) return null;
  const index = (n: unknown, max: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= -1 && n <= max;
  if (!index(v.axisX, 15) || !index(v.axisY, 15) || (v.axisX !== -1 && v.axisX === v.axisY)) return null;
  if (!v.buttons || typeof v.buttons !== 'object' || Array.isArray(v.buttons)) return null;
  const bindings = v.buttons as Record<string, unknown>;
  const actions = v.version === 1 ? ACTIONS.slice(0, 5) : v.version === 2 ? ACTIONS.slice(0, 7) : ACTIONS;
  if (Object.keys(bindings).length !== actions.length || actions.some((a) => !index(bindings[a], 63))) return null;
  const assigned = actions.map((a) => bindings[a]).filter((n) => n !== -1);
  if (new Set(assigned).size !== assigned.length) return null;
  const migrated = { ...bindings } as Record<PadAction, number>;
  if (v.version !== 3) {
    const used = new Set(assigned);
    for (const [action, preferred] of (v.version === 1 ? [['interact', 2], ['cancel', 1], ['menu', 9]] : [['menu', 9]]) as [PadAction, number][]) {
      const free = [preferred, ...Array.from({ length: 64 }, (_, i) => i)].find((button) => !used.has(button));
      migrated[action] = free ?? -1;
      if (free !== undefined) used.add(free);
    }
  }
  return { version: 3, enabled: v.enabled as boolean, allowUnmapped: v.allowUnmapped as boolean,
    deadzone: v.deadzone, axisX: v.axisX as number, axisY: v.axisY as number,
    invertX: v.invertX as boolean, invertY: v.invertY as boolean,
    buttons: migrated };
}

export function axisValue(pad: PadState, index: number): number {
  const value = pad.axes[index];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}
export function buttonPressed(pad: PadState, index: number): boolean {
  const button = pad.buttons[index];
  // The supplied working demo accepts numeric legacy/polyfill buttons as well.
  if (typeof button === 'number') return Number.isFinite(button) && button > 0.5;
  return !!button && (button.pressed === true || (Number.isFinite(button.value) && button.value >= 0.5));
}

function cardinal(x: number, y: number, previous: Direction | null): Direction | null {
  if (x === 0 && y === 0) return null;
  // Keep the previous axis near a diagonal, avoiding rapid horizontal/vertical jitter.
  if (Math.abs(Math.abs(x) - Math.abs(y)) < 0.1 && previous) {
    if ((previous === 'left' || previous === 'right') && x !== 0) return x < 0 ? 'left' : 'right';
    if ((previous === 'up' || previous === 'down') && y !== 0) return y < 0 ? 'up' : 'down';
  }
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

export function padDirection(pad: PadState, config: ControllerConfig, previous: Direction | null = null): Direction | null {
  const b = config.buttons;
  const left = buttonPressed(pad, b.left), right = buttonPressed(pad, b.right);
  const up = buttonPressed(pad, b.up), down = buttonPressed(pad, b.down);
  if (left || right || up || down) return cardinal(Number(right) - Number(left), Number(down) - Number(up), previous);
  const x = axisValue(pad, config.axisX) * (config.invertX ? -1 : 1);
  const y = axisValue(pad, config.axisY) * (config.invertY ? -1 : 1);
  return cardinal(Math.abs(x) > config.deadzone ? x : 0, Math.abs(y) > config.deadzone ? y : 0, previous);
}

/** Pure input latch. No DOM, Phaser, persistence, clocks, or gameplay mutation. */
export class PadLatch {
  private identity = '';
  private armed = false;
  private wasBurst = false;
  private wasInteract = false;
  private wasCancel = false;
  private wasMenu = false;
  private previous: Direction | null = null;
  private readonly result: PadInput = { direction: null, burst: false, interact: false, cancel: false, menu: false };

  get waitingForNeutral(): boolean { return !this.armed; }
  reset(): void { this.identity = ''; this.armed = false; this.wasBurst = false; this.wasInteract = false; this.wasCancel = false; this.wasMenu = false; this.previous = null; }

  sample(pad: PadState | null, config: ControllerConfig, active: boolean): Readonly<PadInput> {
    if (!active || !config.enabled || !pad?.connected || (pad.mapping !== 'standard' && !config.allowUnmapped)) {
      this.reset(); return NO_PAD_INPUT;
    }
    const identity = `${pad.index}:${pad.id}:${pad.mapping}`;
    if (identity !== this.identity) { this.reset(); this.identity = identity; }
    const burst = buttonPressed(pad, config.buttons.burst);
    const interact = buttonPressed(pad, config.buttons.interact);
    const cancel = buttonPressed(pad, config.buttons.cancel);
    const menu = buttonPressed(pad, config.buttons.menu);
    if (!this.armed) {
      const neutral = Math.abs(axisValue(pad, config.axisX)) <= config.deadzone &&
        Math.abs(axisValue(pad, config.axisY)) <= config.deadzone &&
        ACTIONS.every((action) => !buttonPressed(pad, config.buttons[action]));
      if (neutral) this.armed = true;
      this.wasBurst = burst; this.wasInteract = interact; this.wasCancel = cancel; this.wasMenu = menu;
      return NO_PAD_INPUT;
    }
    this.previous = padDirection(pad, config, this.previous);
    this.result.direction = this.previous;
    this.result.burst = burst && !this.wasBurst;
    this.result.interact = interact && !this.wasInteract;
    this.result.cancel = cancel && !this.wasCancel;
    this.result.menu = menu && !this.wasMenu;
    this.wasBurst = burst; this.wasInteract = interact; this.wasCancel = cancel; this.wasMenu = menu;
    return this.result;
  }
}
