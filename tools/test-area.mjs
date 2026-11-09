/**
 * Decision 0012 T1.1/T1.3: make sure the browser fixtures are current, then run only the scenarios in the named areas.
 *
 *   npm run test:area -- battle
 *   npm run test:area -- @saves @world
 *   npm run test:area -- battle --rebuild     (always build first)
 *   npm run test:area -- battle --list        (other arguments starting with -- go to Playwright)
 *   npm run test:smoke                        (the @smoke tier, T1.2)
 *
 * Areas are listed in tools/check-test-tags.mjs. The fixtures are rebuilt only when an input changed
 * (tools/browser-fixtures.mjs).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_AREAS, TEST_TIERS, playwrightCli } from './check-test-tags.mjs';
import { ensureBrowserFixtures } from './browser-fixtures.mjs';

const SELECTABLE = [...TEST_AREAS, ...TEST_TIERS];

/**
 * @param {readonly string[]} args
 * @returns {{grep: string, passThrough: string[], rebuild: boolean} | {error: string}}
 */
export function parseAreaArgs(args) {
  /** @type {string[]} */ const areas = [];
  /** @type {string[]} */ const passThrough = [];
  let rebuild = false;
  for (const arg of args) {
    if (arg === '--rebuild') { rebuild = true; continue; }
    if (arg.startsWith('--')) { passThrough.push(arg); continue; }
    const tag = arg.startsWith('@') ? arg : `@${arg}`;
    if (!SELECTABLE.includes(tag)) return { error: `Unknown area "${arg}". Known areas: ${SELECTABLE.join(' ')}` };
    if (!areas.includes(tag)) areas.push(tag);
  }
  if (!areas.length) return { error: `Name at least one area: ${SELECTABLE.join(' ')}` };
  // A tag must match as a whole word: "@world" must not match a hypothetical "@worldmap".
  return { grep: areas.map((tag) => `${tag}(?![\\w-])`).join('|'), passThrough, rebuild };
}

function main() {
  const parsed = parseAreaArgs(process.argv.slice(2));
  if ('error' in parsed) { console.error(parsed.error); process.exit(2); }
  if (!ensureBrowserFixtures({ rebuild: parsed.rebuild })) process.exit(1);
  const run = spawnSync(process.execPath, [playwrightCli(), 'test', '--grep', parsed.grep, ...parsed.passThrough], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
