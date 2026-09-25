import type { Direction } from '../domain/movement';
import type { GamepadSource } from './gamepad';

const directionKeys: Record<string, Direction> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
export type InputMode = 'exploration' | 'message' | 'dialogue' | 'transition' | 'transition-error' | 'inventory' | 'save';
type Action = 'burst' | 'interact' | 'cancel' | 'menu';

/** Focus once at readiness, without stealing focus from a control used during loading. */
export function focusGameWhenIdle(stage: HTMLElement): void {
  const focused = document.activeElement;
  if (!document.hidden && (!focused || focused === document.body || focused === document.documentElement)) {
    stage.focus({ preventScroll: true });
  }
}

/** Only our currently owned modal may receive gamepad actions through a modal gate.
 *  A pending confirmation supersedes the gate solely for the modal that owns it (the
 *  owner is declared on the confirmation dialog); an unrelated open confirmation never
 *  unlocks polling. Behind-modal menus stay inert and separately gated in their sampling. */
export function gamepadFocusAllowed(ownedModal?: HTMLElement): boolean {
  const confirmation = document.querySelector<HTMLDialogElement>('dialog[open].ui-confirmation');
  if (confirmation && ownedModal && confirmation.dataset.ownerModal === ownedModal.id) return true;
  for (const modal of document.querySelectorAll('dialog[open], [aria-modal="true"]')) {
    if (modal !== ownedModal) return false;
  }
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return true;
  return !focused.isContentEditable && !focused.closest(
    'input, select, textarea, [role="textbox"], [role="combobox"], [role="slider"]',
  );
}

/** One scene input owner; commands are consumed once in exactly one context. */
export class InputController {
  private readonly lifetime = new AbortController();
  private readonly held = new Map<string, Direction>();
  private readonly queued = { burst: false, interact: false, cancel: false, menu: false };
  private mode: InputMode = 'exploration';

  constructor(
    private readonly stage: HTMLElement,
    controls: HTMLElement,
    burstButton: HTMLButtonElement,
    private readonly gamepad: GamepadSource | null = null,
    private readonly canPlay: () => boolean = () => true,
    private readonly modal?: HTMLDialogElement,
    private readonly inventoryModal?: HTMLDialogElement,
    private readonly saveModal?: HTMLDialogElement,
  ) {
    const options = { signal: this.lifetime.signal };
    const keyboard = (event: KeyboardEvent): void => {
      if (!this.canPlay()) return;
      if(this.mode==='dialogue'&&(event.target as HTMLElement).closest('[data-dialogue-choice]'))return;
      const direction = directionKeys[event.code];
      const action: Action | null = event.code === 'KeyI' ? 'menu' : event.code === 'Escape' ? 'cancel' :
        event.code === 'KeyE' || event.code === 'Enter' ? 'interact' :
        event.code === 'Space' ? (this.mode === 'exploration' ? 'burst' : 'interact') : null;
      if (direction || action) event.preventDefault();
      if (event.repeat) return;
      if (direction && this.mode === 'exploration') this.held.set(event.code, direction);
      if (action) this.queue(action);
    };
    stage.addEventListener('pointerdown', () => stage.focus({ preventScroll: true }), options);
    stage.addEventListener('keydown', keyboard, options);
    modal?.addEventListener('keydown', keyboard, options);
    modal?.addEventListener('cancel', (event) => { event.preventDefault(); this.queue('cancel'); }, options);
    saveModal?.addEventListener('keydown', keyboard, options);
    window.addEventListener('keyup', (event) => this.held.delete(event.code), options);
    stage.addEventListener('focusout', () => this.clearLocal(), options);
    window.addEventListener('blur', () => this.clear(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); }, options);
    burstButton.addEventListener('click', () => this.queue('burst'), options);
    for (const root of [controls, modal]) {
      for (const button of root?.querySelectorAll<HTMLButtonElement>('[data-action]') ?? []) {
        button.addEventListener('click', () => this.queue(button.dataset.action as Action), options);
      }
    }
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
      const direction = button.dataset.direction as Direction;
      button.addEventListener('pointerdown', (event) => {
        if (!this.canPlay() || this.mode !== 'exploration') return;
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
        if (!this.canPlay() || this.mode !== 'exploration') return;
        if (event.code === 'Space' || event.code === 'Enter') {
          event.preventDefault();
          if (!event.repeat) this.held.set(`button:${event.code}`, direction);
        }
      }, options);
      button.addEventListener('keyup', (event) => this.held.delete(`button:${event.code}`), options);
      button.addEventListener('blur', () => this.clearLocal(), options);
    }
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.clear(); // Opening/closing a modal cannot replay a held action in a new context.
  }

  private queue(action: Action): void {
    if (!this.canPlay()) return;
    if (action === 'burst' && this.mode !== 'exploration') return;
    if (action === 'interact' && this.mode === 'transition') return;
    this.queued[action] = true;
  }

  direction(): Direction | null {
    const active = !document.hidden && document.hasFocus() && this.canPlay();
    const owned=this.mode==='inventory'?this.inventoryModal:this.mode==='save'?this.saveModal:this.mode==='exploration'?undefined:this.modal;
    const pad = this.gamepad?.poll(active && gamepadFocusAllowed(owned), this.mode === 'inventory'||this.mode==='save'||this.mode==='dialogue' ? 'menu' : 'gameplay');
    if (!active) { this.clear(); return null; }
    if (pad?.burst) this.queue('burst');
    if (pad?.interact) this.queue('interact');
    if (pad?.cancel) this.queue('cancel');
    if (pad?.menu) this.queue('menu');
    if (this.mode === 'inventory'||this.mode==='save'||this.mode==='dialogue') return pad?.direction ?? null;
    if (this.mode !== 'exploration') return null;
    let result: Direction | null = null;
    for (const direction of this.held.values()) result = direction;
    return result ?? pad?.direction ?? null;
  }

  private consume(action: Action): boolean { const value = this.queued[action]; this.queued[action] = false; return value; }
  consumeBurst(): boolean { return this.consume('burst'); }
  consumeInteract(): boolean { return this.consume('interact'); }
  consumeCancel(): boolean { return this.consume('cancel'); }
  consumeMenu(): boolean { return this.consume('menu'); }
  focus(): void { this.stage.focus({ preventScroll: true }); }
  private clearLocal(): void {
    this.held.clear(); this.queued.burst = false; this.queued.interact = false; this.queued.cancel = false; this.queued.menu = false;
  }
  clear(): void { this.clearLocal(); this.gamepad?.reset(); }
  dispose(): void { this.clear(); this.lifetime.abort(); }
}
