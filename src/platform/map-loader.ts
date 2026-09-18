import { readGame, readMap } from '../content/validation.mjs';
import { createCollision } from '../domain/map.mjs';
import type { GameManifest } from '../content/generated/game';
import type { MapDefinition } from '../content/generated/map';

const MAX_CONTENT_BYTES = 256 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
export interface LoadedMap {
  game: GameManifest;
  map: MapDefinition;
  spawn: MapDefinition['spawns'][number];
  collision: ReturnType<typeof createCollision>;
}

/** Bound both the declared and actual response size, and cancel stalled/abandoned loads. */
export async function fetchContent(url: URL, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const request = new AbortController();
  const cancel = (): void => request.abort(signal.reason);
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => request.abort(new Error(`Content request timed out: ${url.pathname}`)), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: request.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_CONTENT_BYTES) {
      await response.body?.cancel();
      throw new Error(`${url.pathname}: content exceeds 256 KiB`);
    }
    if (!response.body) throw new Error(`${url.pathname}: empty content response`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > MAX_CONTENT_BYTES) {
          await reader.cancel();
          throw new Error(`${url.pathname}: content exceeds 256 KiB`);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (request.signal.aborted) throw request.signal.reason;
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as unknown; }
    catch { throw new Error(`${url.pathname}: invalid UTF-8 JSON content`); }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

/** Only the compact manifest and selected map are fetched. Other maps stay inactive. */
export async function loadSelectedMap(base: URL, query: URLSearchParams, signal: AbortSignal): Promise<LoadedMap> {
  const pack = new URL('generated/content/', base);
  const game = readGame(await fetchContent(new URL('game.json', pack), signal));
  const id = query.get('map') ?? game.start.mapId;
  const spawnId = query.get('spawn') ?? (query.has('map') ? undefined : game.start.spawnId);
  return loadMapDestination(base, game, id, spawnId, signal);
}

/** Uses the already validated registry; never reloads or bundles neighbouring maps. */
export async function loadMapDestination(
  base: URL, game: GameManifest, id: string, requestedSpawn: string | undefined, signal: AbortSignal,
): Promise<LoadedMap> {
  const pack = new URL('generated/content/', base);
  const entry = game.maps.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown map ID: ${id}. Choose a map registered in game.json.`);
  const map = readMap(await fetchContent(new URL(entry.file, pack), signal), entry.file);
  if (map.id !== id) throw new Error(`${entry.file}: expected map ${id}, received ${map.id}`);
  // Full target-spawn references are checked at build time, without eagerly fetching neighbours here.
  for (const exit of map.exits) {
    if (!game.maps.some((candidate) => candidate.id === exit.targetMap)) throw new Error(`${map.id}: unregistered exit target ${exit.targetMap}`);
  }
  const spawnId = requestedSpawn ?? map.defaultSpawn;
  const spawn = map.spawns.find((candidate) => candidate.id === spawnId);
  if (!spawn) throw new Error(`${map.id}: unknown spawn ID ${spawnId}`);
  if (signal.aborted) throw signal.reason;
  return { game, map, spawn, collision: createCollision(map) };
}
