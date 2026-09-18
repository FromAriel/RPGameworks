# RPGameworks — Current Status and Handoff

**Updated:** September 18, 2026, recovered W1 base-skin delivery.

## Current phase

**M1.1–M1.5, the player-first shell and W1 base skin are implemented. M1.6 closeout/baseline is next.** The interrupted work survived on `work/w1-base-skin` at `75bed7605ed6d4eb857cc92027d0ebc25b86e420`; it was recovered and verified rather than rewritten. This delivery imports Ariel's exact skin and finishes its documentation/handoff. It does not implement inventory, saves, conditional doors, branching conversations, N1 menu navigation or other later milestones.

Launch remains the full-browser play area with black letterboxing and a small Menu button. The 320 × 192 logical view uses the largest fitting integer enlargement, with the existing constrained-size fallback. Tools are closed on reload. Menu/Escape opens Settings; F2 opens Debug. Wide screens dock the drawer, narrow screens overlay it. Dialogue/travel retains modal priority over those shortcuts. Fatal game errors remain visible even when Debug is closed.

## W1 behavior and exact source

The real conversation/travel dialog, shared Settings/Debug drawer and Display & controls divider are composed from `assets/source/ui/base/Window.png`. The PNG is 192 × 192 RGBA, 3,862 bytes, SHA-256 `2c81d15a1217059fd7c5177b92fffb3a78ca07c0edb305770083e396f645552a`, identical to Ariel's edited attachment. All 141 partial-alpha pixels are preserved. The original kit generator must not overwrite it.

`Window.manifest.json` preserves every original tile definition, rectangle and fit rule; metadata identifies the edit and original companion. `Window.audit.json` records the actual geometry, alpha, connector and shoulder measurements. [WINDOW-SKIN](WINDOW-SKIN.md) contains the complete tile-format explainer, source paths, runtime limits and full validation record; [source provenance](../assets/source/ui/base/README.md) records the import identities. The skin is now a repository asset, not merely a conversation artifact.

Corners, side/bottom midpoint accents, live title brackets, quiet fills and a captioned horizontal Settings divider are implemented. Longer titles become readable wrapped headers. Long-message actions stay outside the body scroller; new pages and reopened dialogue start at the top. Text and controls remain semantic HTML and the dialog retains native modal/input behavior. Controls use CSS states/focus cues; the optional small-control/glyph/vertical-divider/junction renderers are not all implemented merely because their tiles exist.

A single lazy atlas image, one scratch Canvas 2D bitmap, three current surface backgrounds and scheduled invalidation replace per-tile DOM or per-frame border painting. Hidden/unchanged surfaces skip painting. There is no historical-size cache. Frame surfaces are bounded to 4,096 source pixels per side and 2,000,000 pixels total. Disposal cancels pending work and releases observers/listeners/backgrounds. Missing/wrong-size/timed-out art falls back to usable plain windows, with status under Debug. This is not a measured heap/GPU memory guarantee.

**Known art compatibility:** 88 of 96 edges match the original canonical profiles. Eight right border/corner ports match a documented derived profile from the edited right rail itself; plain right-edge gaps use that profile without changing the PNG. Eight of ten repeat strips differ from the original four-pixel shoulder rule; those differences are retained and recorded. The incompatible D6 right divider attachment is not used. Do not claim all arbitrary skin joins are seamless or silently repaint the source to remove these warnings.

## Preserved gameplay and compatibility

Mara is at Workshop (10,8), two tiles below the initial player. Move one tile down, face her, and interact. The eastern door (18,6) leads to Pillar Gallery `from-workshop` (2,6). The plaque at (4,4) can be read while adjacent and facing it; the western doorway (1,6) returns to Workshop `from-gallery` (17,6).

WASD/arrows move; E/Enter interact or advance; Escape closes/cancels a modal; Space remains cosmetic in exploration and advances an open message. Standard controller defaults remain left stick/D-pad, X interaction, B cancel, A burst, subject to saved remapping. Controller preferences remain v2 with v1 migration. N1 direct controller-only menu navigation is still future work. The old physical detection issue was attributed to Chrome by Ariel; do not resume it as the next gameplay task or infer hardware certification from CI.

One reusable scene/input owner and the existing app sampler remain. Doors prepare and validate destinations, support cancellation/stale-result rejection/Retry/Stay and explicitly dispose outgoing views. Existing particle limits, lazy maps, literal text, form safety, input rearming and page-error isolation remain. No dependencies, lockfile, Node range, map/controller/save schema, gameplay content, settings reset, licensing or deployment changes. The only source-image addition is the approved edited skin and its metadata/audit. Temporary source-export workflows are excluded from the delivered tree.

## Commands and verified work

Node `>=22.16.0 <23 || >=24.15.0 <25` remains supported, including Ariel's Node 24.15.0/npm 11.6.2. An existing installation needs a pull and development-server restart, not a reinstall. A fresh checkout uses `npm ci --include=dev`, then `npm run dev`. Keep Vite running on its reported address; port 5173 has strict conflict handling.

`npm run check` runs source checks, **207 unit tests**, content validation and a production build. `npm run test:browser` runs **78 Chromium scenarios** under `/RPGameworks/`. `node tools/audit-windowskin.mjs` recomputes the committed asset audit; `--write` changes its report only. `npm run validate` and `npm run content` retain their existing content workflow; no content watcher was added.

Candidate **75bed7605ed6d4eb857cc92027d0ebc25b86e420** passed [run 35369541935](https://github.com/FromAriel/RPGameworks/actions/runs/35369541935) on Windows/Node 24, Linux/Node 24 and Linux/Node 22; both Node 24 legs used npm 11.6.2. Every leg passed installation, source checks, 207 unit tests, 78 browser scenarios and builds. The retrieved Linux/Node 24 report records 78 expected, zero unexpected, zero flaky and zero skipped. Recovery matched its source export exactly to Git tree `755774a00cafa80172ab4289a930013e72c58a52`, reran local checks/builds and the audit, and compared the source PNG to the original attachment byte-for-byte. The only change in that recovered tree relative to the candidate was the temporary read-only export workflow.

The added 17 unit cases test source identities/audit, every span length 0–4096, title/ornament geometry and budget failures. Thirteen new browser cases test real windows, lazy single-load art, narrow/wide/odd dimensions, literal Unicode/long titles, no idle/hidden repaint, repeated openings, disposal, missing/wrong-size/timed-out art with working travel, and long-message scrolling/page resets. Existing controller/modal and 40-transfer tests remain. Screenshots were inspected during recovery. Browser evidence comes from hosted CI; local Git networking was unavailable, and no new local browser, physical-controller or phone pass is claimed.

Visual review of an earlier passing candidate found that focusing actions could scroll a long message to its end. The recovered candidate already fixes that by separating actions from the text scroller and resetting it per page; a wheel-scroll/page-change/reopen regression covers it. No gameplay code was reimplemented to resume this delivery. Final documentation and the clean main revision receive their own normal CI; inspect that exact run before reporting final-main success.

## Next concrete packet

**M1.6 — Closeout and baseline.** Retain the skinned two-room experience. Record a reproducible frame/resource workload with commit, browser/environment, map, viewport, duration, effects setting and Debug-open/closed state. Measure separately from the already-passing functional/resource-count checks. Keep noisy timing targets distinct from hard resource/correctness gates. Do not recreate diagnostics or a theme editor, and do not claim mobile performance from small PNG size or emulation.

Then follow **M2 state/inventory/saves, with N1 alongside the first inventory menu → G1 conditional access → M3 branching dialogue/missing-lens quest → M4/M5/M6**. See [NEXT-SLICES](NEXT-SLICES.md), [ROADMAP](ROADMAP.md) and [Decision 0001](decisions/0001-base-skin-and-stateful-exploration.md). These planned facts, object states, transaction rules, trigger lifetimes, key/switch access and dialogue conditions remain unimplemented. Preserve shared state authority and the approved out-of-order discovery/second-content proof.

## Limits and historical records

No inventory, gameplay saves, branching quest, combat, full PixelFX recipes, public release, regional asset leases, long-session memory plateau, controller-only tools navigation, other-browser or Android/iOS certification. The Phaser-containing build remains about 1.39 MB minified / 362 KB estimated gzip with its warning visible. The skin's 3,862-byte transfer is not its decoded memory cost. Project license and measured device budgets remain open.

[PLAYER-SHELL](PLAYER-SHELL.md), [INTERACTIONS](INTERACTIONS.md), [MOUSEJOY-PARITY](MOUSEJOY-PARITY.md), [CONTROLLER-RECOVERY](CONTROLLER-RECOVERY.md), [INPUT](INPUT.md), [MAPS](MAPS.md), [FOUNDATION](FOUNDATION.md) and [TOOLCHAIN](TOOLCHAIN.md) are prior implementation records. Their older counts/CSS-only descriptions do not supersede this status. The approved NEXT-SLICES supplement and decision remain the design contract; W1 completion does not mark M1.6 or M2 complete.

Before editing, inspect current main, AGENTS, this status and the relevant roadmap packet. Preserve unrelated changes, use non-forced parent-aware writes, keep artwork original, and distinguish source/build/browser/deployment/hardware evidence.
