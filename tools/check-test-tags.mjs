/**
 * Decision 0012 T1.1: every browser scenario carries at least one area tag, and only known tags.
 *
 *   node tools/check-test-tags.mjs
 *
 * Reads Playwright's own test list (`playwright test --list --reporter=json`), so tags written on a test,
 * a describe block or in a title are all seen. No browser or preview server is started.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Areas a scenario can belong to. `npm run test:area -- <area>…` runs one or more of them. */
export const TEST_AREAS = Object.freeze([
  '@boot', '@world', '@input', '@dialogue', '@quests', '@inventory', '@saves', '@windows', '@battle', '@shell', '@perf',
]);

/**
 * Tiers cut across areas: `@smoke` marks the quick set (decision 0012 T1.2, `npm run test:smoke`).
 * A tier is never a scenario's only tag; it still needs an area.
 */
export const TEST_TIERS = Object.freeze(['@smoke']);

/** Spec files allowed to stay untagged. window-frames is W2-only and is deleted by W3.0 (decision 0011). */
export const UNTAGGED_SPECS = Object.freeze(['window-frames.spec.ts']);

/**
 * @param {readonly {file: string, title: string, tags: readonly string[]}[]} tests
 * @returns {string[]} one message per problem, in input order
 */
export function findTagProblems(tests) {
  const areas = new Set(TEST_AREAS);
  const known = new Set([...TEST_AREAS, ...TEST_TIERS]);
  const exempt = new Set(UNTAGGED_SPECS);
  const problems = [];
  for (const { file, title, tags } of tests) {
    if (exempt.has(path.basename(file))) continue;
    const unknown = tags.filter((tag) => !known.has(tag));
    if (unknown.length) problems.push(`${file}: "${title}" has unknown tag(s) ${unknown.join(', ')}`);
    if (!tags.some((tag) => areas.has(tag))) problems.push(`${file}: "${title}" has no area tag`);
  }
  return problems;
}

/** @param {any} report Playwright JSON report @returns {{file: string, title: string, tags: string[]}[]} */
export function testsFromReport(report) {
  /** @type {{file: string, title: string, tags: string[]}[]} */ const out = [];
  /** @param {any} suite @param {string} file */
  const walk = (suite, file) => {
    const owner = suite.file || file;
    for (const spec of suite.specs || []) out.push({ file: spec.file || owner, title: spec.title, tags: (spec.tags || []).map((/** @type {string} */ t) => (t.startsWith('@') ? t : `@${t}`)) });
    for (const child of suite.suites || []) walk(child, owner);
  };
  for (const suite of report.suites || []) walk(suite, suite.file);
  return out;
}

/** Path to Playwright's CLI, run with this Node so no shell or .cmd wrapper is involved. */
export function playwrightCli() {
  return createRequire(import.meta.url).resolve('@playwright/test/cli');
}

function main() {
  const output = execFileSync(process.execPath, [playwrightCli(), 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const tests = testsFromReport(JSON.parse(output));
  const problems = findTagProblems(tests);
  if (problems.length) {
    console.error(`Test tag check failed (${problems.length}):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    process.exit(1);
  }
  const counted = tests.filter((t) => !UNTAGGED_SPECS.includes(path.basename(t.file))).length;
  console.log(`Test tag check passed: ${counted} tagged scenarios (${tests.length - counted} in exempt specs).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
