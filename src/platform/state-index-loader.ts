import { fetchContent } from './map-loader';
import type { GameManifest } from '../content/generated/game';
import type { StateIndex } from '../domain/save';
import { validateStateIndex } from '../domain/save';
export async function loadStateIndex(base:URL,game:GameManifest,signal:AbortSignal):Promise<StateIndex>{
  if(!game.stateIndexFile)throw new Error('This game does not provide a save state index');
  const index=validateStateIndex(await fetchContent(new URL(`generated/content/${game.stateIndexFile}`,base),signal));
  if(index.gameId!==game.id||index.saveCompatibilityVersion!==(game.saveCompatibilityVersion??1))throw new Error('Save state index does not match the game manifest');return index;
}
