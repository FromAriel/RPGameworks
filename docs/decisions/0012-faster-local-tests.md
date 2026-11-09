# Decision 0012 — Faster local tests: measured tiers, tags and setup shortcuts

**Status:** Proposed by Claude and **approved by Ariel on November 9, 2026**, including the §5 tier rule and the one-minute smoke target. Not started. Ariel chose to do this before the window work in [decision 0011](0011-reusable-window-skins.md), because slow tests are slowing every packet.

## 1. Why

- Tests run locally only; GitHub Actions tests are disabled (AGENTS.md). So every minute of test time is Ariel's or the assistant's time.
- The full browser suite takes about 7.5 minutes for about 156 scenarios, plus a full production build before every run (`pretest:browser` runs `build:browser-fixtures`: the game build under `/RPGameworks/` and the UI gallery build).
- Playwright runs one worker, not in parallel (`workers: 1`, `fullyParallel: false`).
- Many scenarios walk the hero across rooms in real time. A step is 160 ms (`STEP_MS`), and each step waits for the game to report that movement started and ended. The quests spec spent 38.7 s on 4 scenarios in the last local report. Walking-heavy specs by count of key presses and walk helpers: conditional-access (37), interaction (35), quests (33), inventory (29), battle (19), supply-room (17), ui-reference (16).
- There is no quick tier and no way to run "only the battle tests" except by naming spec files.

## 2. What already exists and is reused

- `openRoom(page, suffix)` in `tests/browser/helpers.ts` already accepts URL options. The game already reads `?map=` and `?spawn=` (`loadSelectedMap` in `src/platform/map-loader.ts`), so a test can start in any room at any authored spawn without walking there.
- Save import is a real, tested player feature (M2.4). A test can load a prepared session (inventory, facts, quests, placements) through it instead of playing up to that state.
- `window.__RPGAMEWORKS__.snapshot()` is the existing read-only diagnostic. It stays read-only.
- Playwright 1.63 supports test tags (`test('…', { tag: '@battle' }, …)`) and `--grep`. No new dependency is needed.

## 3. Rules for this plan

- **No coverage is silently lost.** Every scenario either stays, or moves to a unit test, or is replaced by a shorter setup. Each change is listed in the packet's STATUS entry, with the old and new test names.
- **No new runtime test hooks** (for example a teleport or set-state function in the game) without Ariel's approval. Setup shortcuts use URL options and save import that players already have.
- **Keep a few real end-to-end routes.** At least one full walking route each for the lens quest, the ledger quest, locked travel and a battle stays as acceptance. Shortcuts only remove repeated walking that other tests already prove.
- Times are compared on the same machine, same build, same command, before and after, and recorded.

## 4. The packets

### T1.0 — Measure

- Run the full suite once with Playwright's JSON reporter and record, per spec and per scenario: duration, number of page loads, walk steps and fixed waits. Also time `build:browser-fixtures` on its own.
- Write the table into STATUS. It is the baseline for every later packet.

**Acceptance:** the table exists, with machine, Node version, command and date. No test code changes.

### T1.1 — Area tags and commands

- Tag every scenario with one or more areas: `@boot`, `@world` (maps, travel, collision), `@input` (keyboard, controller, touch, MouseJoy), `@dialogue`, `@quests`, `@inventory`, `@saves`, `@windows` (window skin, gallery, reference captures), `@battle`, `@shell` (player shell, Settings, Debug), `@perf` (residency, benchmark probe).
- Add `npm run test:area -- @battle` (or several areas) that runs the matching scenarios.
- The W2-only window specs (`window-frames.spec.ts`, and the unit tests `pixel-frame.test.ts` and `window-frames.test.ts`) are **not** tagged: W3.0 deletes them. W3.0 tags the restored W1 specs. This avoids merge conflicts in the revert.

**Acceptance:** every remaining scenario has at least one tag (checked by a small script that fails on untagged tests); each area command runs and passes.

### T1.2 — Smoke tier (about one minute)

- Tag about 10–15 scenarios `@smoke`: boot to ready, one room travel and return, one dialogue, one inventory open and close, one save and reload, one battle to victory, one window render with its title, one controller menu move, one failure fallback.
- Add `npm run test:smoke`.

**Acceptance:** the smoke tier runs in about one minute or less on this machine (measured, excluding the build), and passes.

### T1.3 — Don't rebuild when nothing changed

- Before browser tests, compute a hash of the build's inputs (source, content, assets, configs, lockfile) and compare it with a stamp written by the last fixture build. Rebuild only when it differs; otherwise reuse `dist/`.
- `npm run test:browser` keeps its current behaviour (always rebuild). The quick commands (`test:smoke`, `test:area`) use the stamp check. A `--rebuild` option forces a build.
- This keeps the old safety: a stale build can't be tested by accident, because any input change triggers a rebuild.

**Acceptance:** a second quick run with no changes skips the build; touching any input file triggers it; the stamp lives in an ignored folder.

### T1.4 — Setup shortcuts instead of walking

- Scenarios that walk to reach a place they are not testing start there with `?map=…&spawn=…`.
- Scenarios that need prior progress (keys, items, quest states) load a committed save fixture through the existing import path.
- If a needed spawn does not exist, adding one to the demo content is a content change and is listed in STATUS.

**Acceptance:** the walking-heavy specs above are measurably faster; the end-to-end routes in §3 still walk; all tagged scenarios pass.

### T1.5 — Move pure rule checks to unit tests

- Where a browser test asserts pure rule results that need no browser (damage numbers, menu-model choices, quest transitions, validation messages), move those assertions to Vitest if they are not already covered there. The browser scenario keeps the flow and the visible result.

**Acceptance:** each moved assertion is listed with its new unit test; the unit suite passes; browser time drops by the measured amount.

### T1.6 — Parallel workers (last, and only if stable)

- Try 2–4 workers. Each Playwright context already has its own storage, so saves don't collide. The two preview servers are shared.
- Keep it only if the full suite passes three times in a row with no new flakiness and it is measurably faster. The rendering uses SwiftShader on the CPU, so more workers may not help.

**Acceptance:** three consecutive passing full runs and a measured gain; otherwise stay on one worker and record why.

### Changes decided during T1.4 (Ariel, November 9, 2026)

- **T1.4 scope.** The survey found that in almost every slow scenario the walking is what is being tested (travel, the full quest routes, locked doors, repeated round trips). Only "a lens found before acceptance…" walked purely to get into position, so T1.4 shortened that one scenario with a save fixture and recorded the finding.
- **Order.** T1.6 (parallel workers) runs **before** T1.5, because it is likely the largest gain.
- **T1.7 — fake-clock trial for real timeouts (optional, after T1.6).** Two scenarios wait through real 5-second load timeouts (the map-load timeout and the window-art timeout, about 16 s together). Try Playwright's page clock to fast-forward those timers, with no game-code change. Keep it only if both scenarios stay reliable over three runs and get faster; it may disturb Phaser's frame loop.

### Changes decided after T1.6 (Ariel, November 9, 2026)

- **T1.5 skipped.** The browser scenarios that check rules (bad maps, rejected save imports, a missing item catalog, an invalid chest item, a failed battle catalog) take about 6.5 s of 381 s, and each checks what the player sees: the message, a usable room, an untouched session. The rules themselves are already unit-tested (`maps`, `save` and `session` tests). The slow battle scenario "playback speed and skipping never change the resolved battle" checks that presentation cannot change outcomes, which needs the real browser. Nothing moved.
- **Next:** fix the two test timing races that 4 workers exposed (T1.6), so the suite holds up on slower machines; then the optional T1.7.

## 5. Which tier to run when (proposed)

| When | Run |
| --- | --- |
| During a packet | `test:smoke` plus the packet's areas |
| Before calling a packet done | unit tests, `npm run validate`, `npm run check`, and the areas the packet touched; say which |
| A change to shared runtime (input, modal ownership, saves, loading, lifecycle), and before a Pages publish | the full browser suite |

## 6. Questions for Ariel

1. Is the §5 table the right rule for when the full suite is required?
2. Is about one minute the right target for the smoke tier?
