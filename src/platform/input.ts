import type { Direction } from '../domain/movement';

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

/** One input owner per scene lifetime, disposed with an AbortController. */
export class InputController {
  private readonly lifetime = new AbortController();
  private readonly held = new Map<string, Direction>();
  private burstQueued = false;

  constructor(stage: HTMLElement, controls: HTMLElement, burstButton: HTMLButtonElement) {
    const options = { signal: this.lifetime.signal };
    stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }), options);
    stage.addEventListener('keydown', (event) => {
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
    stage.addEventListener('focusout', () => this.clearKeyboard(), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    burstButton.addEventListener('click', () => { this.burstQueued = true; }, options);

    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
      const direction = button.dataset.direction as Direction;
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.held.set(`pointer:${event.pointerId}`, direction);
      }, options);
      const release = (event: PointerEvent): void => { this.held.delete(`pointer:${event.pointerId}`); };
      button.addEventListener('pointerup', release, options);
      button.addEventListener('pointercancel', release, options);
      button.addEventListener('lostpointercapture', release, options);
      // Keyboard activation of the semantic buttons requests one bounded step.
      button.addEventListener('keydown', (event) => {
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          this.held.set(`button:${event.code}`, direction);
        }
      }, options);
      button.addEventListener('keyup', (event) => this.held.delete(`button:${event.code}`), options);
      button.addEventListener('blur', () => this.clearKeyboard(), options);
    }
  }

  direction(): Direction | null {
    let result: Direction | null = null;
    for (const direction of this.held.values()) result = direction;
    return result;
  }

  consumeBurst(): boolean {
    const result = this.burstQueued;
    this.burstQueued = false;
    return result;
  }

  clear(): void { this.held.clear(); this.burstQueued = false; }

  private clearKeyboard(): void {
    for (const key of this.held.keys()) if (!key.startsWith('pointer:')) this.held.delete(key);
  }

  dispose(): void { this.clear(); this.lifetime.abort(); }
}
