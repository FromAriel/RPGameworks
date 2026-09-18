import type { Direction } from '../domain/movement';
import type { GamepadSource } from './gamepad';

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

/** Focus once at readiness, without stealing focus from a control used during loading. */
export function focusGameWhenIdle(stage: HTMLElement): void {
  const focused = document.activeElement;
  if (!document.hidden && (!focused || focused === document.body || focused === document.documentElement)) {
    stage.focus({ preventScroll: true });
  }
}

/** A controller belongs to the active game page, not a focusable canvas div.
 * Preserve form editing and modal ownership; keyboard listeners remain scoped.
 */
export function gamepadFocusAllowed(): boolean {
  if (document.querySelector('dialog[open], [aria-modal="true"]')) return false;
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return true;
  return !focused.isContentEditable && !focused.closest(
    'input, select, textarea, [role="textbox"], [role="combobox"], [role="slider"]',
  );
}

/** One scene input owner. Controller and keyboard share movement, not a second simulation. */
export class InputController {
  private readonly lifetime = new AbortController();
  private readonly held = new Map<string, Direction>();
  private burstQueued = false;

  constructor(
    stage: HTMLElement,
    controls: HTMLElement,
    burstButton: HTMLButtonElement,
    private readonly gamepad: GamepadSource | null = null,
    private readonly canPlay: () => boolean = () => true,
  ) {
    const options = { signal: this.lifetime.signal };
    stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }), options);
    stage.addEventListener('keydown', (event) => {
      if (!this.canPlay()) return;
      const direction = directionKeys[event.code];
      if (direction) {
        event.preventDefault();
        if (!event.repeat) this.held.set(event.code, direction);
      } else if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.burstQueued = true;
      }
    }, options);
    window.addEventListener('keyup', (event) => this.held.delete(event.code), options);
    stage.addEventListener('focusout', () => this.clearLocal(), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    burstButton.addEventListener('click', () => { if (this.canPlay()) this.burstQueued = true; }, options);

    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
      const direction = button.dataset.direction as Direction;
      button.addEventListener('pointerdown', (event) => {
        if (!this.canPlay()) return;
        event.preventDefault();
        stage.focus({ preventScroll: true });
        button.setPointerCapture(event.pointerId);
        this.held.set(`pointer:${event.pointerId}`, direction);
      }, options);
      const release = (event: PointerEvent): void => { this.held.delete(`pointer:${event.pointerId}`); };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      button.addEventListener('keydown', (event) => {
        if (!this.canPlay()) return;
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          this.held.set(`button:${event.code}`, direction);
        }
      }, options);
      button.addEventListener('keyup', (event) => this.held.delete(`button:${event.code}`), options);
      button.addEventListener('blur', () => this.clearLocal(), options);
    }
  }

  direction(): Direction | null {
    const active = !document.hidden && document.hasFocus() && this.canPlay();
    const pad = this.gamepad?.poll(active && gamepadFocusAllowed());
    if (!active) { this.clear(); return null; }
    if (pad?.burst) this.burstQueued = true;
    let result: Direction | null = null;
    for (const direction of this.held.values()) result = direction;
    // Explicit keyboard/pointer movement takes precedence over a held stick.
    return result ?? pad?.direction ?? null;
  }

  consumeBurst(): boolean {
    const result = this.burstQueued;
    this.burstQueued = false;
    return result;
  }

  // Element focus changes release keyboard/pointer state, not a page-owned pad.
  private clearLocal(): void { this.held.clear(); this.burstQueued = false; }
  clear(): void { this.clearLocal(); this.gamepad?.reset(); }
  dispose(): void { this.clear(); this.lifetime.abort(); }
}
