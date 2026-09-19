import { readItems, validateMapItems } from '../content/validation.mjs';
import type { ItemCatalog } from '../content/generated/items';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

/** A small independently loadable catalog; old games without it have empty inventory. */
export async function loadItemCatalog(base: URL, content: LoadedMap, signal: AbortSignal): Promise<ItemCatalog> {
  const catalog = readItems(content.game.itemsFile ?
    await fetchContent(new URL(`generated/content/${content.game.itemsFile}`, base), signal) :
    {schemaVersion:1, capacity:32, items:[], strings:{en:{}}});
  signal.throwIfAborted();
  validateMapItems(content.map, catalog, content.map.id);
  return catalog;
}
