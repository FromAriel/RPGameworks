# RPGameworks — Current Status and Handoff

**Updated:** September 18, 2026, M1.6 baseline and foundation closeout.

## Current phase

**M1.1–M1.6, the player-first shell and W1 base skin are complete. M2 session state/chest is next.** This packet adds a reproducible benchmark and consolidates foundation acceptance. It does not implement inventory, saves, conditional doors, branching conversations or N1 menu navigation. The running game, maps, artwork, bindings and clean player screen are unchanged from `af647f2ea584db462f587cf26bc17c65d1e54b09`.

The optional Debug drawer remains closed on reload; there is no new always-on profiler or visible instrumentation. The benchmark is a separate development/test command whose probe is injected only in test pages. No runtime CPU work is added to ordinary play by this packet.

## M1.6 measurement and acceptance

`npm run benchmark` builds and serves production under `/RPGameworks/`, runs one headless Chromium worker with no retries or tracing, and writes raw workload reports plus Playwright outcomes. The command owns and shuts down its port-4173 preview; it does not reuse an unknown running server. See [BASELINE.md](BASELINE.md) for complete reproduction, metric definitions, limitations and the M1 acceptance matrix.

Seven warmed steady workloads run at least ten seconds each: Workshop idle, Gallery idle, walking/burst requests with effects off, effects on, and Debug visible, plus Mara's message and Settings. All use a 1500 × 760 viewport with the same 960 × 576 displayed game canvas, even with Debug docked. A separate twenty-round-trip tour records forty actual door crossings and named-spawn/resource checkpoints. Input uses ordinary keyboard/pointer operations, not game-state mutation or fake clocks.

Reports preserve unclamped animation-callback intervals, sampled runtime/DOM/skin-paint counts, optional long-task entries, source/worktree/lock identity and actual browser/driver/host descriptions. Travel is map-fetch start to first animation-frame-observed exploration readiness, not exact internal transition timing. CPU work, GPU time, heap/GPU bytes and exact listener counts are explicitly unavailable. Captures use bounded buffers and a watchdog; probe tests verify start/stop cleanup, duplicate-owner refusal, preserved stalls and hidden/blur contamination. No arbitrary FPS gate is imposed on shared CI runners.

The durable [selected baseline](benchmarks/M1-2026-09-18.json) is candidate **`26a7e827d4236716d50d2fad376a2e9eb4a230a5`**, [run 35397588184](https://github.com/FromAriel/RPGameworks/actions/runs/35397588184). All three jobs passed installation, strict source/content/build checks, **216 unit tests, 81 functional browser scenarios and eight benchmark workloads**. Windows/Node 24.15.0 and Linux/Node 24.15.0 used npm 11.6.2; Linux/Node 22.16.0 used npm 10.9.2. All eight benchmark outcomes per environment were expected, with zero unexpected, flaky or skipped results. Artifact/report hashes and environment-specific worktree fingerprints are retained; Windows CRLF conversion explains its different worktree lock hash, not a package change.

Selected results: steady p95 callback intervals were 16.7–16.8 ms and the largest interval across each environment's eight workloads was 16.8 ms. All used Headless Chrome 153.0.8010.12 with SwiftShader software rendering; these are not measurements of Ariel's GPU or a phone. Workshop/Gallery display-object counts returned to 245/342 respectively; all samples had one active scene, one map and one counted Phaser texture. Arrivals cleared outgoing particles. Hidden Debug had no table mutations; its live table updated without repainting unchanged chrome. No observed long task is not proof of the 8 ms CPU target. See BASELINE for the detailed measurements and interpretation.

The candidate passed its first full matrix. Local source checking, 216 unit tests, content generation/builds and the existing exact-art audit also passed with genuine locked dependencies. Local Git networking/HTTP-browser navigation were unavailable or administratively blocked; no local browser success is claimed. Final documentation and the clean main delivery receive their own normal CI; inspect that exact commit's run before reporting final-main success. The selected baseline keeps its original candidate identity rather than relabeling its measurements as a later run.

## Preserved player experience

Launch shows the full-browser black-letterboxed game with a small Menu button. The logical world is 320 × 192 and uses the largest fitting integer enlargement, with the existing constrained-size fallback. Menu/Escape opens Settings; F2 opens Debug. Wide screens dock the drawer; narrow screens overlay it. Dialogue/travel retains input priority and fatal game errors stay visible outside Debug.

Mara is at Workshop (10,8), two tiles below the initial player. Move one tile down, face her and interact. The eastern door (18,6) leads to Gallery `from-workshop` (2,6). The plaque at (4,4) is adjacent/facing-based; the west door (1,6) returns at Workshop `from-gallery` (17,6).

WASD/arrows move; E/Enter interacts or advances; Escape closes/cancels a modal; Space is cosmetic during exploration and advances an open message. Controller defaults remain left stick/D-pad movement, X interaction, B cancel and A burst, subject to saved remapping. Preference v2 and its migration remain intact. Direct controller-only menu navigation is future N1, not controller detection. Ariel attributed the earlier device-exposure failure to Chrome; do not reopen that resolved investigation.

The reusable scene/input owner, app-owned sampler, lazy destination loading, cancellation/stale-result rejection, Retry/Stay and explicit outgoing-view disposal are unchanged. No dependencies, lockfile, Node range, gameplay schema, licensing, settings reset or deployment changed. Only the benchmark command, tests, CI artifact step, ignored report directories and documentation were added; temporary source-export workflow is excluded from the delivered tree.

## Preserved skin and source identity

`assets/source/ui/base/Window.png` is Ariel's exact 192 × 192 RGBA edit: 3,862 bytes; SHA-256 `2c81d15a1217059fd7c5177b92fffb3a78ca07c0edb305770083e396f645552a`. Its 141 partial-alpha pixels and all original bytes remain unchanged. Do not run the older sample generator over it. The manifest and reproducible connector audit remain beside the PNG. [WINDOW-SKIN.md](WINDOW-SKIN.md) and [source provenance](../assets/source/ui/base/README.md) own the complete format and art record.

Mara/travel, the Settings/Debug frame and its labeled divider use the bounded, lazy compositor. Titles remain live text, long-message actions stay outside the scroller, and pages reset to the beginning. Hidden/unchanged surfaces skip repainting; failed art leaves usable plain windows. Known seams are not silently repaired: 88 of 96 original ports match; eight right-side ports use the documented derived profile; eight repeat-shoulder differences remain and D6 is unused. Additional divider/glyph renderers and theme editing are not all implemented merely because tiles exist.

## Commands

Supported Node remains `>=22.16.0 <23 || >=24.15.0 <25`. Existing users need only pull this update; no package reinstall is required because dependency versions and the lockfile did not change. Fresh checkouts use `npm ci --include=dev`. Keep `npm run dev` running on its reported address (port 5173 with strict conflict handling).

`npm run check`: strict source checks, 216 unit tests, validated content and production build. `npm run test:browser`: 81 functional Chromium scenarios. `npm run benchmark`: eight separate production measurement workloads; install the pinned browser with `npx playwright install --with-deps chromium` first when it is absent. Raw reports go to ignored `benchmark-results/` and `benchmark-report/`; all three CI legs upload them with 14-day retention. A normal Git checkout is required to identify the measured revision.

`node tools/audit-windowskin.mjs` retains the exact-art audit (`--write` changes its report, not the PNG). Existing `npm run validate` and `npm run content` remain; no content watcher was added. Benchmarks do not configure hosting or publish a site.

## Next concrete packet

**M2.1 — Authoritative session state, then the chest/inventory transaction slice.** Read [NEXT-SLICES](NEXT-SLICES.md), [ROADMAP](ROADMAP.md) and [Decision 0001](decisions/0001-base-skin-and-stateful-exploration.md). Keep immutable authored definitions, persistent-in-session placement deltas, transient simulation and presentation objects separate. Use stable placement IDs and declared typed facts, not ad-hoc flags on sprites. First playable proof: open one chest, grant its item once, travel away/back, and reconstruct the opened chest with the right item count. Failed inventory operations must not partly claim it.

Deliver **N1 direct keyboard/controller selection with the first real inventory menu**, not a virtual mouse or a new detection backend. Initially state survives room travel only; full reload durability waits for M2.4/M2.5 IndexedDB, export/import and failure acceptance. M2.6 adds the planned asset-ownership/distinct-map audit. Then G1 key/switch access and M3 conditional conversations/missing-lens quest use the same facts and transactions. Preserve out-of-order discovery and the second-content proof. M4/M5/M6 remain later. Do not add these systems to M1.6 or reopen the settled skin design.

## Limits and continuity

No inventory, gameplay saves, branching quest, combat, full PixelFX recipes, public release, regional asset leases, long-session memory plateau, controller-only tools navigation, other-browser or Android/iOS certification. A callback-paced tiny scene is not proof of GPU headroom or the master plan's large-map/particle budgets. The existing Phaser-containing bundle warning remains visible. This baseline closes the first foundation milestone, not release hardening or all future performance targets.

Earlier source/test records remain in [WINDOW-SKIN](WINDOW-SKIN.md), [PLAYER-SHELL](PLAYER-SHELL.md), [INTERACTIONS](INTERACTIONS.md), [MOUSEJOY-PARITY](MOUSEJOY-PARITY.md), [CONTROLLER-RECOVERY](CONTROLLER-RECOVERY.md), [INPUT](INPUT.md), [MAPS](MAPS.md), [FOUNDATION](FOUNDATION.md) and [TOOLCHAIN](TOOLCHAIN.md). Their prior counts/next-task language do not supersede this status. Before editing, read current main, AGENTS and the next roadmap packet; preserve unrelated work and use non-forced parent-aware commits.
