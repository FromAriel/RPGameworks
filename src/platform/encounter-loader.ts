import { readEncounters } from '../content/validation.mjs';
import type { GameManifest } from '../content/generated/game';
import { fetchContent } from './map-loader';

export async function loadEncounter(base: URL, game: GameManifest, id: string, signal: AbortSignal) {
  if (!game.encountersFile) throw new Error('This game has no encounter catalog.');
  const url = new URL(`generated/content/${game.encountersFile}`, base);
  const catalog = readEncounters(await fetchContent(url, signal), game.encountersFile);
  const encounter = catalog.encounters.find(candidate => candidate.id === id);
  if (!encounter) throw new Error(`Encounter ${id} is missing from ${game.encountersFile}.`);
  signal.throwIfAborted();
  return encounter;
}
