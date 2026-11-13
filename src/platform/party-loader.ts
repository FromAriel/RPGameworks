import { readParty } from '../content/validation.mjs';
import type { PartyRoster } from '../domain/party';
import type { StateIndex } from '../domain/save';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

/** The party roster (decision 0014 M5.4d), or null for a game without one. It must match the save state index. */
export async function loadParty(base: URL, content: LoadedMap, index: StateIndex, signal: AbortSignal): Promise<PartyRoster | null> {
  if (!content.game.partyFile) {
    if (index.party) throw new Error('The save state index has a party, but the game has no party roster');
    return null;
  }
  const roster = readParty(await fetchContent(new URL(`generated/content/${content.game.partyFile}`, base), signal), content.game.partyFile);
  if (JSON.stringify(roster.members.map(m => m.id)) !== JSON.stringify(index.party?.memberIds ?? [])) throw new Error('Party roster does not match the save state index');
  return roster;
}
