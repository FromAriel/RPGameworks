import validateMap from './generated/map-validator.mjs';
import validateGame from './generated/game-validator.mjs';
import { createCollision } from '../domain/map.mjs';

/** @typedef {import('./generated/map.js').MapDefinition} MapDefinition */
/** @typedef {import('./generated/game.js').GameManifest} GameManifest */
/** @typedef {{file: string, id: string, path: string, message: string, value: unknown}} ContentIssue */
const MAX_ISSUES = 20;

export class ContentError extends Error {
  /** @param {readonly ContentIssue[]} issues */
  constructor(issues) {
    super(issues.map((issue) => `${issue.file} [${issue.id}] ${issue.path || '/'}: ${issue.message} (value: ${JSON.stringify(issue.value)?.slice(0, 100) ?? 'missing'})`).join('\n'));
    this.name = 'ContentError';
    this.issues = issues;
  }
}

/** Clone/freeze authored definitions; never freeze or retain a caller's mutable object.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function freezeCopy(value) {
  const copy = structuredClone(value);
  /** @param {unknown} item */
  function freeze(item) {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}

/** @param {unknown} value @param {string} path @returns {unknown} */
function atPath(value, path) {
  for (const part of path.split('/').slice(1)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = /** @type {Record<string, unknown>} */ (value)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return value;
}

/** @param {unknown} value @param {string} file
 * @param {readonly {instancePath: string, message?: string, params: Record<string, unknown>}[] | null | undefined} errors
 * @returns {never}
 */
function schemaFailure(value, file, errors) {
  const id = value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : 'unknown';
  throw new ContentError((errors ?? []).slice(0, MAX_ISSUES).map((error) => {
    const property = error.params['additionalProperty'] ?? error.params['missingProperty'];
    const path = `${error.instancePath}${typeof property === 'string' ? '/' + property : ''}`;
    return { file, id, path, message: error.message ?? 'Schema mismatch', value: atPath(value, path) };
  }));
}

/** @param {unknown} value @param {string} file @returns {GameManifest} */
export function readGame(value, file = 'game.json') {
  if (!validateGame(value)) schemaFailure(value, file, validateGame.errors);
  const data = /** @type {GameManifest} */ (value);
  /** @type {ContentIssue[]} */ const issues = [];
  const ids = new Set();
  const files = new Set();
  data.maps.forEach((entry, index) => {
    if (ids.has(entry.id)) issues.push({file, id: data.id, path: `/maps/${index}/id`, message: 'Duplicate map ID', value: entry.id});
    if (files.has(entry.file)) issues.push({file, id: data.id, path: `/maps/${index}/file`, message: 'Duplicate map file', value: entry.file});
    ids.add(entry.id); files.add(entry.file);
  });
  if (!ids.has(data.start.mapId)) issues.push({file, id: data.id, path: '/start/mapId', message: 'Start map is not registered', value: data.start.mapId});
  if (issues.length) throw new ContentError(issues.slice(0, MAX_ISSUES));
  return freezeCopy(data);
}

/** Structural and local semantic validation; shared by build tools and browser.
 * @param {unknown} value @param {string} file @param {readonly string[]=} frames
 * @returns {MapDefinition}
 */
export function readMap(value, file = 'map.json', frames) {
  if (!validateMap(value)) schemaFailure(value, file, validateMap.errors);
  const map = /** @type {MapDefinition} */ (value);
  /** @type {ContentIssue[]} */ const issues = [];
  /** @param {string} path @param {string} message @param {unknown} value */
  const issue = (path, message, value) => {
    if (issues.length < MAX_ISSUES) issues.push({file, id: map.id, path, message, value});
  };
  /** @param {{id: string}[]} items @param {string} path */
  function unique(items, path) {
    const seen = new Set();
    items.forEach((entry, index) => {
      if (seen.has(entry.id)) issue(`${path}/${index}/id`, 'Duplicate scoped ID', entry.id);
      seen.add(entry.id);
    });
  }
  /** @param {string[]} rows @param {string} path @param {boolean} visual */
  function rows(rows, path, visual) {
    if (rows.length !== map.height) issue(path, `Expected ${map.height} rows`, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== map.width) issue(`${path}/${y}`, `Expected ${map.width} cells`, row.length);
      if (visual) [...row].forEach((symbol, x) => {
        if (symbol !== '.' && !Object.hasOwn(map.legend, symbol)) issue(`${path}/${y}/${x}`, 'Unknown legend symbol', symbol);
      });
    });
  }
  unique(map.layers, '/layers'); unique(map.spawns, '/spawns'); unique(map.objects, '/objects'); unique(map.exits, '/exits');
  map.layers.forEach((layer, index) => rows(layer.rows, `/layers/${index}/rows`, true));
  rows(map.collision, '/collision', false);
  const available = frames ? new Set(frames) : null;
  for (const [symbol, frame] of Object.entries(map.legend)) {
    if (available && !available.has(frame)) issue(`/legend/${symbol}`, 'Atlas frame does not exist', frame);
  }
  const solidCells = new Set();
  map.objects.forEach((object, index) => {
    if (object.x >= map.width || object.y >= map.height) issue(`/objects/${index}`, 'Object outside map bounds', {x: object.x, y: object.y});
    if (available && !available.has(object.frame)) issue(`/objects/${index}/frame`, 'Atlas frame does not exist', object.frame);
    const cell = `${object.x},${object.y}`;
    if (object.solid && solidCells.has(cell)) issue(`/objects/${index}`, 'Overlapping solid objects', cell);
    if (object.solid) solidCells.add(cell);
  });
  const grid = createCollision(map);
  map.spawns.forEach((spawn, index) => {
    if (!grid.canEnter(spawn.x, spawn.y)) issue(`/spawns/${index}`, 'Spawn outside map or on a blocked cell', {x: spawn.x, y: spawn.y});
  });
  if (!map.spawns.some((spawn) => spawn.id === map.defaultSpawn)) issue('/defaultSpawn', 'Default spawn does not exist', map.defaultSpawn);
  const exitCells = new Set();
  map.exits.forEach((exit, index) => {
    if (exit.x + exit.width > map.width || exit.y + exit.height > map.height) {
      issue(`/exits/${index}`, 'Exit rectangle outside map bounds', exit); return;
    }
    for (let y = exit.y; y < exit.y + exit.height; y += 1) {
      for (let x = exit.x; x < exit.x + exit.width; x += 1) {
        if (!grid.canEnter(x, y)) issue(`/exits/${index}`, 'Exit contains a blocked cell', {x, y});
        const cell = `${x},${y}`;
        if (exitCells.has(cell)) issue(`/exits/${index}`, 'Overlapping exit rectangles', cell);
        exitCells.add(cell);
      }
    }
  });
  const messages = map.messages ?? [];
  unique(messages, '/messages');
  const strings = map.strings?.en ?? {};
  for (const [key, text] of Object.entries(strings)) {
    if (!text.trim()) issue(`/strings/en/${key}`, 'String must contain visible text', text);
  }
  messages.forEach((message, index) => {
    for (const key of [message.speakerKey, ...message.pages]) {
      if (!Object.hasOwn(strings, key)) issue(`/messages/${index}`, 'Missing English string', key);
    }
  });
  const interactionCells = new Set();
  map.objects.forEach((object, index) => {
    if (!object.messageId) return;
    if (!messages.some((message) => message.id === object.messageId)) {
      issue(`/objects/${index}/messageId`, 'Message does not exist', object.messageId);
    }
    const cell = `${object.x},${object.y}`;
    if (interactionCells.has(cell)) issue(`/objects/${index}`, 'Ambiguous interaction cell', cell);
    interactionCells.add(cell);
    if (![grid.canEnter(object.x - 1, object.y), grid.canEnter(object.x + 1, object.y),
      grid.canEnter(object.x, object.y - 1), grid.canEnter(object.x, object.y + 1)].some(Boolean)) {
      issue(`/objects/${index}`, 'Interaction has no walkable adjacent tile', cell);
    }
  });
  if (issues.length) throw new ContentError(issues);
  return freezeCopy(map);
}

/** Complete build-time graph checks. Runtime does not fetch all maps to repeat them.
 * @param {GameManifest} game @param {ReadonlyMap<string, MapDefinition>} maps
 */
export function validateWorld(game, maps) {
  /** @type {ContentIssue[]} */ const issues = [];
  const objectIds = new Set();
  const registered = new Set(game.maps.map((entry) => entry.id));
  /** @param {string} file @param {string} id @param {string} path @param {string} message @param {unknown} value */
  const issue = (file, id, path, message, value) => {
    if (issues.length < MAX_ISSUES) issues.push({file, id, path, message, value});
  };
  for (const entry of game.maps) {
    const map = maps.get(entry.id);
    if (!map || map.id !== entry.id) { issue(entry.file, entry.id, '/id', 'Registered map is missing or has a different ID', map?.id); continue; }
    for (const object of map.objects) {
      if (objectIds.has(object.id)) issue(entry.file, map.id, '/objects', 'Duplicate world placement ID', object.id);
      objectIds.add(object.id);
    }
    map.exits.forEach((exit, index) => {
      const target = registered.has(exit.targetMap) ? maps.get(exit.targetMap) : undefined;
      if (!target) issue(entry.file, map.id, `/exits/${index}/targetMap`, 'Target map does not exist', exit.targetMap);
      else if (!target.spawns.some((spawn) => spawn.id === exit.targetSpawn)) issue(entry.file, map.id, `/exits/${index}/targetSpawn`, 'Target spawn does not exist', exit.targetSpawn);
    });
  }
  const start = maps.get(game.start.mapId);
  if (!start?.spawns.some((spawn) => spawn.id === game.start.spawnId)) issue('game.json', game.id, '/start/spawnId', 'Start spawn does not exist', game.start.spawnId);
  if (maps.size !== game.maps.length) issue('game.json', game.id, '/maps', 'Registered and supplied map counts differ', maps.size);
  if (issues.length) throw new ContentError(issues);
}
