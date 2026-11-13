/**
 * Decision 0012 T1.3: build the browser-test fixtures only when something they depend on changed.
 *
 *   node tools/browser-fixtures.mjs            build if stale, otherwise reuse dist/
 *   node tools/browser-fixtures.mjs --rebuild  always build
 *
 * After each build this writes a stamp (ignored `.tmp/browser-fixtures.stamp.json`) holding a hash of every build
 * input and a hash of each built entry page. The fixtures are reused only when the inputs hash and every entry page
 * still match the stamp, so a different build written over dist/ (for example `npm run build` with another base
 * path), a deleted output, or any input edit triggers a fresh build. `npm run test:browser` keeps building every time.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STAMP_FILE = '.tmp/browser-fixtures.stamp.json';
export const STAMP_VERSION = 1;

/** Version-controlled inputs (tracked or untracked-but-not-ignored files). Generated folders are ignored outputs. */
export const INPUT_PATHS = Object.freeze([
  'src', 'content', 'assets', 'schemas', 'tools', 'tests/ui-gallery',
  'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vite.ui-gallery.config.ts', 'vite.studio.config.ts',
]);
/** Vite copies everything in public/ into the build, including ignored local files, so it is read from disk. */
export const PUBLIC_DIR = 'public';
export const PUBLIC_OUTPUT_DIRS = Object.freeze(['public/generated']);
/** Built entry pages; their hashed asset names change whenever the bundle changes. */
export const OUTPUT_PAGES = Object.freeze(['dist/index.html', '.tmp/ui-gallery-dist/index.html', '.tmp/skin-studio-dist/index.html']);

/**
 * Decide whether the existing fixtures can be reused.
 * @param {{ inputHash: string, outputs: Record<string, string | null>, stamp: any }} state
 * @returns {{ fresh: boolean, reason: string }}
 */
export function fixtureStatus({ inputHash, outputs, stamp }) {
  if (!stamp) return { fresh: false, reason: 'no previous fixture build stamp' };
  if (stamp.version !== STAMP_VERSION) return { fresh: false, reason: 'stamp format changed' };
  const missing = Object.keys(outputs).filter((page) => outputs[page] === null);
  if (missing.length) return { fresh: false, reason: `missing ${missing.join(', ')}` };
  if (stamp.inputHash !== inputHash) return { fresh: false, reason: 'build inputs changed' };
  const replaced = Object.keys(outputs).filter((page) => stamp.outputs?.[page] !== outputs[page]);
  if (replaced.length) return { fresh: false, reason: `${replaced.join(', ')} differs from the stamped build` };
  return { fresh: true, reason: 'inputs and built pages match the last fixture build' };
}

/**
 * Hash a set of named entries; order-independent, and a missing file differs from an empty one.
 * @param {Iterable<[string, Buffer | null]>} entries
 */
export function hashEntries(entries) {
  const hash = createHash('sha256');
  for (const [name, data] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hash.update(`${name}\0`);
    hash.update(data === null ? '<missing>' : createHash('sha256').update(data).digest('hex'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** @param {string} file @returns {Buffer | null} */
const readOrNull = (file) => { try { return readFileSync(path.join(REPO, file)); } catch { return null; } };

/** @param {string} dir @returns {string[]} repository-relative files below dir, skipping generated outputs */
function walkPublic(dir) {
  if (PUBLIC_OUTPUT_DIRS.includes(dir)) return [];
  const full = path.join(REPO, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walkPublic(rel) : [rel];
  });
}

/** @returns {string | null} the input hash, or null outside a Git work tree (then always build) */
export function computeInputHash() {
  let listed, head;
  try {
    listed = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard', '--', ...INPUT_PATHS], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // The build embeds the commit as its build ID (vite.config.ts), so a new commit is a new build.
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
  const files = new Set([...listed.split('\0').filter(Boolean), ...walkPublic(PUBLIC_DIR)]);
  /** @type {[string, Buffer | null][]} */
  const entries = [...files].map((file) => [file, readOrNull(file)]);
  const context = JSON.stringify({ head, node: process.version, basePath: process.env.BASE_PATH ?? null, githubSha: process.env.GITHUB_SHA ?? null });
  entries.push(['<context>', Buffer.from(context)]);
  return hashEntries(entries);
}

/** @returns {Record<string, string | null>} */
function readOutputs() {
  return Object.fromEntries(OUTPUT_PAGES.map((page) => {
    const data = readOrNull(page);
    return [page, data === null ? null : createHash('sha256').update(data).digest('hex')];
  }));
}

function readStamp() {
  const data = readOrNull(STAMP_FILE);
  if (data === null) return null;
  try { return JSON.parse(data.toString('utf8')); } catch { return null; }
}

/**
 * Build the fixtures unless they are fresh. Returns false if the build failed.
 * @param {{ rebuild?: boolean }} [options]
 */
export function ensureBrowserFixtures({ rebuild = false } = {}) {
  const inputHash = computeInputHash();
  const status = rebuild ? { fresh: false, reason: '--rebuild requested' }
    : inputHash === null ? { fresh: false, reason: 'not a Git work tree, so changes cannot be detected' }
    : fixtureStatus({ inputHash, outputs: readOutputs(), stamp: readStamp() });
  if (status.fresh) {
    console.log(`Browser fixtures are current (${status.reason}); skipping the build. Use --rebuild to force one.`);
    return true;
  }
  console.log(`Building browser fixtures: ${status.reason}.`);
  // npm is a .cmd wrapper on Windows, so it needs a shell; the arguments are fixed.
  const build = spawnSync('npm run build:browser-fixtures', { cwd: REPO, stdio: 'inherit', shell: true });
  if (build.status !== 0) return false;
  // Stamp the inputs as they were when the build started. If anything changed during the build (an edit, or a build
  // step writing into an input), leave no stamp so the next run builds again.
  if (inputHash !== null && computeInputHash() === inputHash) {
    mkdirSync(path.join(REPO, path.dirname(STAMP_FILE)), { recursive: true });
    writeFileSync(path.join(REPO, STAMP_FILE), `${JSON.stringify({ version: STAMP_VERSION, inputHash, outputs: readOutputs(), builtAt: new Date().toISOString() }, null, 2)}\n`);
  } else if (inputHash !== null) {
    console.log('Build inputs changed while building; no stamp written, so the next run builds again.');
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--rebuild');
  if (unknown.length) { console.error(`Unknown option(s): ${unknown.join(' ')}. Only --rebuild is accepted.`); process.exit(2); }
  process.exit(ensureBrowserFixtures({ rebuild: process.argv.includes('--rebuild') }) ? 0 : 1);
}
