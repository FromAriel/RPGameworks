#!/usr/bin/env node
// Decision 0019 (roadmap S1.5b): preview candidate character designs before choosing recipes.
//
//   npm run lpc:preview -- [--lpc <folder>] [--candidates <file>]
//
// Each candidate in assets/source/lpc/candidates.json is resolved and licence-checked exactly as the import does
// (tools/lpc/resolve.mjs), then baked with our own frame code from DanJen's reduced sheets (identical to ours, as the
// S1.5a tests show). A member without an attack (a map character, S1.5g) shows its standing frame each way and its
// walk instead. Writes external/lpc-preview/ (ignored by git, decision 0007): one PNG strip per candidate and action,
// and index.html, which plays each strip at battle size (2×) and shows idle up close. A candidate that fails the
// licence check or the recipe rules is listed with its problems instead. index.html embeds the strips, so it is one
// self-contained file.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { checkLicences, lpcFolder, openLpc, resolveCharacters } from './resolve.mjs';
import { bakeFrame, bakeStandFrame, reduceSheet } from '../../src/content/lpc/bake.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const at = args.indexOf('--candidates');
const candidates = JSON.parse(readFileSync(at >= 0 ? args[at + 1] : join(repo, 'assets', 'source', 'lpc', 'candidates.json'), 'utf8'));
const reduction = JSON.parse(readFileSync(join(repo, 'assets', 'source', 'lpc', 'reduction.json'), 'utf8'));
const lpc = openLpc(lpcFolder(args));
const out = join(repo, 'external', 'lpc-preview');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const sheets = new Map();
/**
 * The reduced sheet for a resolved file: DanJen's cached one (identical to ours, S1.5a), or ours from the source when
 * DanJen's cache reduced it at the wrong cell size (the bow's walk_128 sheets).
 */
const reducedFor = (files) => (file) => {
  const { key, cell, danjenCell } = files.get(file);
  if (!sheets.has(key)) {
    if (danjenCell === cell) {
      const png = PNG.sync.read(readFileSync(join(lpc.folder, 'cache', 'sheets', `${key}.png`)));
      const record = lpc.records[key];
      sheets.set(key, { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data), cell: record.cell, cellOut: record.cellOut });
    } else {
      const png = PNG.sync.read(readFileSync(join(lpc.folder, 'source', 'spritesheets', file)));
      sheets.set(key, reduceSheet({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) }, cell, reduction));
    }
  }
  return sheets.get(key);
};
/** Frames side by side in one PNG. */
const strip = (frames) => {
  const size = frames[0].width, png = new PNG({ width: size * frames.length, height: size });
  frames.forEach((frame, i) => { for (let y = 0; y < size; y++) png.data.set(frame.data.subarray(y * size * 4, (y + 1) * size * 4), (y * png.width + i * size) * 4); });
  return PNG.sync.write(png);
};
const escape = (text) => String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const FRAME_MS = { idle: 300, walk: 110, walk_128: 110, hurt: 140, shoot: 90, spellcast: 110, slash_128: 90 };

const sections = [];
let total = 0, refused = 0;
for (const member of candidates.members) {
  const cards = [];
  for (const candidate of member.candidates) {
    total++;
    const id = `${member.member}-${candidate.id}`;
    // Idle is optional: older LPC parts (belts, tunics, tabards, quivers) have no idle animation, and a character
    // wearing one stands on its first walk frame instead.
    const walk = member.walk ?? 'walk';
    const full = member.attack ? [member.attack, 'hurt'] : [];
    let actions = ['idle', walk, ...full];
    let resolved = resolveCharacters(lpc, [{ id, bodyType: candidate.bodyType, selections: candidate.selections, actions }]);
    const noIdle = resolved.problems.length > 0 && resolved.problems.every(p => /UNSUPPORTED_ACTION: .*\/idle$/.test(p));
    if (noIdle) {
      actions = [walk, ...full];
      resolved = resolveCharacters(lpc, [{ id, bodyType: candidate.bodyType, selections: candidate.selections, actions }]);
    }
    const { characters, files, ramps, problems } = resolved;
    const licences = checkLicences(lpc, files);
    problems.push(...licences.problems);
    const parts = candidate.selections.map(s => `${s.id}${s.variant ? ` (${s.variant})` : ''}${s.recolors ? ` (${Object.values(s.recolors).join(', ')})` : ''}`);
    if (problems.length) {
      refused++;
      cards.push(`<article class="card refused"><h3>${escape(candidate.id.toUpperCase())}. ${escape(candidate.label)}</h3><p class="bad">Refused:</p><ul>${problems.map(p => `<li>${escape(p)}</li>`).join('')}</ul></article>`);
      continue;
    }
    const manifest = { ramps, characters };
    const counts = {};
    for (const { licence } of licences.entries.values()) counts[licence] = (counts[licence] ?? 0) + 1;
    const anims = [];
    if (!member.attack) {
      // A map character: LPC's standing frame each way at 4×, as on the map (decision 0019 S1.5f).
      for (const side of ['down', 'left', 'up', 'right']) {
        const png = strip([bakeStandFrame(manifest, id, walk, side, reducedFor(files), reduction.finalAlphaThreshold)]);
        anims.push(`<figure><div class="still" style="--w:192px;--n:1;background-image:url(data:image/png;base64,${png.toString('base64')})"></div><figcaption>standing, ${side}, 4×</figcaption></figure>`);
      }
    }
    for (const action of actions) {
      const spec = characters[id].actions[action];
      const rows = spec.kind === 'standard' ? spec.rows : spec.frames.length;
      const direction = rows >= 4 ? (member.attack ? 'left' : 'down') : 'up';
      const count = spec.kind === 'standard' ? spec.cycle.length : spec.frames[1].length;
      const frames = Array.from({ length: count }, (_, phase) => bakeFrame(manifest, id, action, direction, phase, reducedFor(files), reduction.finalAlphaThreshold));
      const name = `${id}-${action}.png`;
      const png = strip(frames);
      writeFileSync(join(out, name), png);
      // Embedded too, so index.html is one self-contained file that opens anywhere.
      const url = `data:image/png;base64,${png.toString('base64')}`;
      const size = frames[0].width;
      anims.push(`<figure><div class="anim" style="--w:${size * 2}px;--n:${count};--t:${count * (FRAME_MS[action] ?? 120)}ms;background-image:url(${url})"></div><figcaption>${escape(action)}</figcaption></figure>`);
      if (member.attack && (action === 'idle' || (noIdle && action === walk))) anims.unshift(`<figure><div class="still" style="--w:${size * 4}px;--n:${count};background-image:url(${url})"></div><figcaption>${noIdle ? 'standing (no idle), 4×' : 'idle, 4×'}</figcaption></figure>`);
    }
    cards.push(`<article class="card"><h3>${escape(candidate.id.toUpperCase())}. ${escape(candidate.label)}</h3>
<div class="stage">${anims.join('')}</div>
<p class="meta">${escape(candidate.bodyType)} body · ${files.size} sheets · ${Object.entries(counts).map(([l, n]) => `${escape(l)} ×${n}`).join(', ')}</p>
<p class="parts">${parts.map(escape).join(' · ')}</p></article>`);
  }
  sections.push(`<section><h2>${escape(member.name)} <small>${escape(member.role)}</small></h2>${cards.join('')}</section>`);
}

writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Character Designs</title>
<style>
:root{--bg:#0b111b;--floor:#18243a;--ink:#e6e3c6;--muted:#9aa6c0;--bad:#ff9c8a}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}h2 small{color:var(--muted);font-weight:normal}
.intro{color:var(--muted);max-width:70ch}
.card{background:#111a2a;border:1px solid #243450;border-radius:6px;padding:12px;margin:10px 0}
.card h3{margin:0 0 8px;font-size:15px}
.stage{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:var(--floor);padding:10px;border-radius:4px}
figure{margin:0;text-align:center}figcaption{font-size:12px;color:var(--muted)}
.anim,.still{width:var(--w);height:var(--w);background-repeat:no-repeat;background-size:calc(var(--w) * var(--n)) var(--w);image-rendering:pixelated}
.anim{animation:play var(--t) steps(var(--n)) infinite}
@keyframes play{to{background-position-x:calc(var(--w) * var(--n) * -1)}}
@media (prefers-reduced-motion:reduce){.anim{animation:none}}
.meta,.parts{font-size:12px;color:var(--muted);margin:8px 0 0}.bad{color:var(--bad)}
</style>
<h1>Character design candidates</h1>
<p class="intro">Decision 0019. Each design is built only from LPC parts whose every file offers CC0, CC-BY or OGA-BY, reduced to 48-pixel frames as in the game (the sword's slash is oversized, 96 pixels). The animations play at 2×, facing left as on the battle stage (map characters walk facing down). ${total} candidates${refused ? `, ${refused} refused` : ''}.</p>
${sections.join('\n')}
</html>
`);
console.log(JSON.stringify({ candidates: total, refused, output: join(out, 'index.html') }));
