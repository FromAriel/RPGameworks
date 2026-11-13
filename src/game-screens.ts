import type { ScreenRegistry } from './presentation/menu/screens';

/**
 * A game's own menu screens (decision 0016 U2.4). Register each one under the game's namespace (`mygame:crafting`),
 * then list it in `menu.json` like any built-in entry. A menu entry whose screen is not registered stays greyed, with
 * "Arrives later." The walkthrough, with a worked example, is docs/guides/menu-screens.md.
 *
 * The demo has no screens of its own.
 */
export function registerGameScreens(registry: ScreenRegistry): void {
  void registry;
}
