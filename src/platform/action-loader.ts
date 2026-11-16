import { readActions } from '../content/validation.mjs';
import type { GameManifest } from '../content/generated/game';
import { actionMap } from '../domain/actions';
import type { BattleAction } from '../domain/actions';
import { fetchContent } from './map-loader';

/** The game's action catalog (decision 0018), by ID; empty for a game without one. */
export async function loadActions(base: URL, game: GameManifest, signal: AbortSignal): Promise<ReadonlyMap<string, BattleAction>> {
  if (!game.actionsFile) return new Map();
  const catalog = readActions(await fetchContent(new URL(`generated/content/${game.actionsFile}`, base), signal), game.actionsFile);
  signal.throwIfAborted();
  return actionMap(catalog);
}
