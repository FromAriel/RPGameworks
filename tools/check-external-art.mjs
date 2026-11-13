/**
 * Guard for decision 0007: third-party art is fetched locally and never committed.
 * Fails when a tracked or staged path lies under a local-only art root.
 * Exception (decision 0015): the public-domain Stone Soup monster library is committed under
 * assets/source/creatures/stone-soup/, outside these roots, and is verified by tools/import-stone-soup.mjs --check.
 *
 *   node tools/check-external-art.mjs
 *
 * Outside a Git work tree nothing can be tracked, so the check reports SKIPPED rather than passed.
 * S1.2 is expected to add matching against the pinned per-file hashes of fetched libraries.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Local-only roots. Compared case-insensitively because Windows checkouts ignore case. */
export const EXTERNAL_ART_ROOTS = Object.freeze(['external/', 'public/external/', '.import/']);
/** Tracked files allowed inside those roots. */
export const EXTERNAL_ART_ALLOWED = Object.freeze(['external/README.md']);

/** @param {string} path */
const normalize = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();

/**
 * @param {readonly string[]} paths repository-relative paths, as listed by `git ls-files`
 * @returns {string[]} the offending paths, in input order
 */
export function findExternalArtViolations(paths) {
  const allowed = new Set(EXTERNAL_ART_ALLOWED.map(normalize));
  return paths.filter((path) => {
    const key = normalize(path);
    return !allowed.has(key) && EXTERNAL_ART_ROOTS.some((root) => key.startsWith(root));
  });
}

/** @returns {string[] | null} tracked and staged paths, or null outside a Git work tree */
function listTrackedPaths() {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--cached'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return output.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const paths = listTrackedPaths();
  if (!paths) {
    console.log('External-art guard SKIPPED: not a Git work tree, so nothing is tracked.');
    return 0;
  }
  const violations = findExternalArtViolations(paths);
  if (violations.length) {
    console.error(`External-art guard FAILED: ${violations.length} tracked or staged path(s) are local-only third-party art (decision 0007):`);
    for (const path of violations) console.error(`  ${path}`);
    console.error('Unstage them with `git rm --cached <path>`; never commit fetched or derived external art.');
    return 1;
  }
  console.log(`External-art guard passed: ${paths.length} tracked paths, none under ${EXTERNAL_ART_ROOTS.join(', ')}.`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
