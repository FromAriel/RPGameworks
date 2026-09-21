import { readFacts } from '../content/validation.mjs';
import type { FactCatalog } from '../content/generated/facts';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

export async function loadFactCatalog(base:URL,content:LoadedMap,signal:AbortSignal):Promise<FactCatalog>{
  const catalog=readFacts(content.game.factsFile?await fetchContent(new URL(`generated/content/${content.game.factsFile}`,base),signal):{schemaVersion:1,facts:[]});
  signal.throwIfAborted();return catalog;
}
