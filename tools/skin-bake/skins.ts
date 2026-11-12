/**
 * Batch skin bake (decision 0013 B3). Every folder under the skins root that holds a recipe.json is baked into the
 * ordinary v2 window skin beside it: Window.png, Window.manifest.json and Window.audit.json (0013 Q1 and Q4).
 *
 *   npm run skins                 bake every recipe and write the skins that changed
 *   npm run skins -- --check      bake in memory; fail if a committed skin is missing or differs from its recipe
 *   ... --root <dir>              another skins folder (default assets/source/ui/skins)
 *
 * Each skin is baked and audited in a temporary folder first, so a broken recipe reports its file and message and
 * leaves every committed file untouched. Tool code only: the game never imports anything under tools/skin-bake/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRecipe } from './recipe.mjs';
import { bakeSkin } from './bake.ts';
import type { FilledRecipe } from './bake.ts';

export const DEFAULT_ROOT = 'assets/source/ui/skins';
export const OUTPUTS = ['Window.png', 'Window.manifest.json', 'Window.audit.json'] as const;
const AUDIT_TOOL = fileURLToPath(new URL('../audit-windowskin.mjs', import.meta.url));

export interface SkinResult {
  readonly name: string;
  /** baked: written; same: already up to date; stale: --check found a difference; failed: recipe or bake error. */
  readonly status: 'baked' | 'same' | 'stale' | 'failed';
  readonly message: string;
}

/** Bake every recipe under `root`. With `check`, nothing is written. */
export function bakeAll(root: string, { check = false }: { check?: boolean } = {}): SkinResult[] {
  if (!existsSync(root)) return [{ name: root, status: 'failed', message: `${root} does not exist` }];
  const names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, 'recipe.json')))
    .map((d) => d.name).sort();
  return names.map((name) => bakeOne(path.join(root, name), name, check));
}

function bakeOne(dir: string, name: string, check: boolean): SkinResult {
  const file = path.join(dir, 'recipe.json');
  const scratch = mkdtempSync(path.join(tmpdir(), 'rpg-skins-'));
  try {
    let json: unknown;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { return failed(name, `${file}: not valid JSON: ${(error as Error).message}`); }
    const read = readRecipe(json, { dir, file });
    if (!read.ok) return failed(name, read.errors.join('\n'));
    let fresh: Record<(typeof OUTPUTS)[number], Buffer>;
    try {
      const baked = bakeSkin(read.recipe as FilledRecipe, { dir, image: OUTPUTS[0] });
      writeFileSync(path.join(scratch, OUTPUTS[0]), baked.png);
      writeFileSync(path.join(scratch, OUTPUTS[1]), `${JSON.stringify(baked.manifest, null, 2)}\n`);
      const audit = execFileSync(process.execPath, [AUDIT_TOOL, '--manifest', path.join(scratch, OUTPUTS[1])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      fresh = { [OUTPUTS[0]]: baked.png, [OUTPUTS[1]]: readFileSync(path.join(scratch, OUTPUTS[1])), [OUTPUTS[2]]: Buffer.from(audit) } as typeof fresh;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr;
      return failed(name, `${file}: ${stderr?.trim() || (error as Error).message}`);
    }
    const differing = OUTPUTS.filter((out) => { const target = path.join(dir, out); return !existsSync(target) || !readFileSync(target).equals(fresh[out]); });
    if (!differing.length) return { name, status: 'same', message: `${name}: up to date` };
    if (check) return { name, status: 'stale', message: `${name}: ${differing.join(', ')} ${differing.length === 1 ? 'is' : 'are'} missing or out of date; run npm run skins` };
    // Write beside the target, then rename: a reader never sees half a file, and one writer per file (Windows locks).
    for (const out of differing) {
      const target = path.join(dir, out), temp = `${target}.tmp`;
      writeFileSync(temp, fresh[out]);
      renameSync(temp, target);
    }
    return { name, status: 'baked', message: `${name}: wrote ${differing.join(', ')}` };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const failed = (name: string, message: string): SkinResult => ({ name, status: 'failed', message });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = at >= 0 ? args[at + 1] ?? '' : DEFAULT_ROOT;
  const check = args.includes('--check');
  const results = bakeAll(root, { check });
  for (const r of results) (r.status === 'failed' || r.status === 'stale' ? console.error : console.log)(r.message);
  const bad = results.filter((r) => r.status === 'failed' || r.status === 'stale').length;
  console.log(`${results.length} recipe(s): ${results.length - bad} ok, ${bad} ${check ? 'failing the check' : 'failed'}.`);
  process.exitCode = bad || !results.length ? 1 : 0;
}
