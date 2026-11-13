import { readCatalog } from '../content/validation.mjs';
import type { CatalogDefinition } from '../content/generated/catalog';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

/**
 * The game's data-only menu screens (decision 0016 U2.4), by catalog ID. The content build already expanded library
 * credits and checked cross-file references; this checks each file's shape again as it arrives.
 */
export async function loadCatalogs(base: URL, content: LoadedMap, signal: AbortSignal): Promise<ReadonlyMap<string, CatalogDefinition>> {
  const entries = content.game.catalogs ?? [];
  const catalogs = await Promise.all(entries.map(async entry =>
    [entry.id, readCatalog(await fetchContent(new URL(`generated/content/${entry.file}`, base), signal), entry.file)] as const));
  signal.throwIfAborted();
  return new Map(catalogs);
}
