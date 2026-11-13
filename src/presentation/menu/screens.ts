import './menu.css';
import { MenuNavigation } from '../ui/menu-navigation';
import type { PadInput } from '../../platform/gamepad-model';
import type { WindowskinHandle } from '../ui/windowskin';
import type { Condition } from '../../domain/session';

/**
 * Menu screens (decision 0016 U2.0): a pixel-scaled full-screen layer, a registry of screens by ID, and a controller
 * that keeps a stack of open screens and routes input to the top one.
 *
 * A screen is a small module: it builds its windows from the shared blocks inside the element it is given, focuses its
 * first control, and may react to tab switching and Cancel. Built-in screens use the `builtin:` namespace; a game
 * registers its own (`mygame:crafting`) in its own code, and `menu.json` lists them like any other entry.
 */

/** What screens may ask of the game. Grows as screens need it (items, party, quests…), never raw session access. */
export interface MenuServices {
  /** Whether a content condition holds now (unlock conditions in menu.json). */
  holds(condition: Condition): boolean;
}

export interface ScreenContext {
  readonly services: MenuServices;
  /** Open another screen on top of this one. */
  open(screenId: string, params?: unknown): void;
  /** Close this screen and return to the one below (or close the menu at the bottom). */
  back(): void;
  /** Close the whole menu and return to the game. */
  close(): void;
}

export interface MenuScreen {
  /** The screen's root, filled with its windows; the controller places and shows it. */
  readonly element: HTMLElement;
  /** Focus the first control (called when the screen opens or comes back to the top). */
  focusFirst(): void;
  /** Q/E or the shoulder buttons: step through tabs or party members. */
  step?(delta: -1 | 1): void;
  /** Cancel: return true when the screen handled it itself (for example closing a picker); otherwise the menu goes back. */
  cancel?(): boolean;
  /** Release everything the screen owns. */
  dispose(): void;
}
export type ScreenFactory = (context: ScreenContext, params: unknown) => MenuScreen;

/** Screen IDs: a namespace and a name, like content IDs (`builtin:items`, `mygame:crafting`). */
export const SCREEN_ID = /^[a-z][a-z0-9-]{0,31}:[a-z][a-z0-9.-]{0,63}$/;

export class ScreenRegistry {
  private readonly factories = new Map<string, ScreenFactory>();
  register(id: string, factory: ScreenFactory): void {
    if (!SCREEN_ID.test(id)) throw new Error(`Invalid menu screen ID "${id}"`);
    if (this.factories.has(id)) throw new Error(`Menu screen "${id}" is already registered`);
    this.factories.set(id, factory);
  }
  has(id: string): boolean { return this.factories.has(id); }
  get ids(): string[] { return [...this.factories.keys()].sort(); }
  create(id: string, context: ScreenContext, params: unknown): MenuScreen {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Unknown menu screen "${id}"`);
    return factory(context, params);
  }
}

export interface MenuLayer {
  readonly element: HTMLElement;
  /** The 640 × 360 logical surface, enlarged in whole steps with the game (--game-scale). */
  readonly surface: HTMLElement;
}

/** The full-screen menu layer: hidden until a menu opens. */
export function createMenuLayer(host: HTMLElement = document.body, label = 'Game menu'): MenuLayer {
  const element = document.createElement('section');
  element.className = 'menu-layer';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-label', label);
  const surface = document.createElement('div');
  surface.className = 'menu-surface';
  element.append(surface);
  host.append(element);
  return { element, surface };
}

/**
 * Runs the menu: opens screens from the registry onto a stack, shows only the top one, and routes keyboard,
 * controller and pointer input to it. Cancel goes back one screen; at the bottom it closes the menu.
 */
export class MenuController {
  private readonly stack: { id: string; screen: MenuScreen; wrapper: HTMLElement }[] = [];
  private readonly navigation: MenuNavigation;
  private readonly lifetime = new AbortController();
  private disposed = false;

  constructor(
    readonly layer: MenuLayer,
    private readonly registry: ScreenRegistry,
    private readonly services: MenuServices,
    private readonly windowskin: WindowskinHandle | null,
    private readonly onClose: () => void = () => undefined,
  ) {
    this.navigation = new MenuNavigation(layer.surface, () => this.cancel());
    layer.surface.addEventListener('keydown', event => {
      if (event.repeat || (event.code !== 'KeyQ' && event.code !== 'KeyE')) return;
      if ((event.target as HTMLElement).closest('input,select,textarea')) return;
      // E confirms the focused button (MenuNavigation); it steps tabs only from a tab itself.
      if (event.code === 'KeyE' && !(event.target as HTMLElement).closest('[role="tab"]')) return;
      event.preventDefault();
      this.top?.screen.step?.(event.code === 'KeyQ' ? -1 : 1);
    }, { signal: this.lifetime.signal });
  }

  get open(): boolean { return this.stack.length > 0; }
  get topId(): string | null { return this.top?.id ?? null; }
  private get top() { return this.stack.at(-1); }

  /** Open a screen; the first one opens the menu layer. */
  push(screenId: string, params?: unknown): void {
    if (this.disposed) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'menu-screen';
    wrapper.dataset.screen = screenId;
    const context: ScreenContext = {
      services: this.services,
      open: (id, p) => this.push(id, p),
      back: () => this.pop(),
      close: () => this.close(),
    };
    const screen = this.registry.create(screenId, context, params);
    wrapper.append(screen.element);
    for (const below of this.stack) below.wrapper.hidden = true;
    this.layer.surface.append(wrapper);
    this.stack.push({ id: screenId, screen, wrapper });
    this.layer.element.hidden = false;
    this.windowskin?.adopt(this.layer.surface);
    screen.focusFirst();
  }

  /** Close the top screen; closing the last one closes the menu. */
  pop(): void {
    const entry = this.stack.pop();
    if (!entry) return;
    entry.screen.dispose();
    entry.wrapper.remove();
    const next = this.top;
    if (!next) { this.finish(); return; }
    next.wrapper.hidden = false;
    this.windowskin?.adopt(this.layer.surface);
    next.screen.focusFirst();
  }

  /** Close every screen and the menu. */
  close(): void {
    while (this.stack.length) { const entry = this.stack.pop()!; entry.screen.dispose(); entry.wrapper.remove(); }
    this.finish();
  }

  /** Controller input: movement and confirm through MenuNavigation, the shoulder buttons step tabs. */
  sample(pad: Readonly<PadInput>, deltaMs: number): void {
    if (!this.open) return;
    if (pad.tab) this.top?.screen.step?.(pad.tab);
    this.navigation.sample(pad, deltaMs);
  }

  private cancel(): void {
    if (this.top?.screen.cancel?.()) return;
    this.pop();
  }

  private finish(): void {
    this.layer.element.hidden = true;
    this.navigation.reset();
    this.windowskin?.adopt(this.layer.surface);
    this.onClose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
    this.navigation.dispose();
    this.lifetime.abort();
    this.layer.element.remove();
  }
}
