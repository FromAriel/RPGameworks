# RPGameworks — Current Status and Handoff

**Updated:** September 18, 2026, approved base-skin and stateful-exploration planning revision (documentation only).

## Current phase

**M1.1–M1.5 and the player-first shell are implemented; M1.6 performance closeout remains.** The latest change updates planning only against runtime baseline `dd2add47eb52b84d626ff40d057b78016781243e`. Ariel approved her edited windowskin as the base. W1 integration is now the next bounded implementation packet, followed by M1.6; neither it nor the stateful gameplay below is implemented by approving the plan. Do not resume the resolved controller-detection investigation as the next task.

Launch shows the full-browser play area with black letterboxing and a small Menu button. The game remains 320 × 192 logical pixels, now enlarged to the largest fitting integer scale with no former 4x cap or partial-window height budget. Sub-1x downscaling is reserved for windows smaller than the logical view. No browser fullscreen permission is requested.

**Menu / Escape → Settings**, or **F2 → Debug**. The drawer starts closed on every page load. On wide screens it docks beside the game; on narrow screens it overlays the right edge and scrolls independently. Click the play area to continue playing with Debug visible. Using panel controls pauses new gameplay input; closing the drawer restores focus and collapses nested controller configuration. Native conversations and travel retain ownership of Escape/F2, so the tools cannot cover them.

Settings retains the complete controller setup, activation, live readings, report, reduced-effects option, and collapsible controls instructions. On-screen directional/action buttons are hidden on desktop, automatic for coarse primary pointers, and manually toggleable for this session. Debug retains map preview/restart, runtime counters, observed FPS, build identity and page warnings. The diagnostic table does not rebuild while hidden. Fatal load/scene errors and loading status remain visible outside the panel.

Messages now appear in a bottom-aligned JRPG-style window. Their domain behavior and native modal semantics are unchanged. See [PLAYER-SHELL.md](PLAYER-SHELL.md) for UI behavior, scope, test contract and limitations.

## Preserved playable slice

Mara stands at Workshop tile (10,8), two tiles south of the initial player. Move one tile down and interact while facing her. The eastern doorway (18,6) leads to Pillar Gallery at `from-workshop` (2,6). Read the plaque at (4,4). The gallery's western doorway (1,6) returns at Workshop `from-gallery` (17,6). Existing map/spawn IDs and JSON content are unchanged.

WASD/arrows move; E/Enter interact and advance messages; Escape closes/cancels; Space is a cosmetic burst in exploration and advances an open message. Standard controller defaults remain left stick/D-pad movement, X interaction, B cancel, A burst, subject to saved custom bindings. Controller preferences remain v2 with v1 migration intact. Controller-only navigation of the new menu/configuration is not implemented. Ariel attributed her earlier detection problem to Chrome; this is user-reported resolution, not physical-device certification by CI.

Normal doors preserve the document, game, scene, atlas and input owner. Destination loading/validation occurs before activation, with cancellation, stale-result rejection and Retry/Stay recovery. Outgoing MapView sprites/particles are explicitly destroyed. One active map is simulated; two visual sets can briefly coexist during synchronous preparation. The 64-particle cosmetic ceiling, literal message text, schema-derived validators/types, immutable content, bounded loading, form safety, neutral controller rearming and page-error isolation remain intact.

## Approved planning update — not new runtime behavior

[Decision 0001](decisions/0001-base-skin-and-stateful-exploration.md) and [NEXT-SLICES](NEXT-SLICES.md) record the accepted additions/refinements. The edited skin is the selected source, but the PNG/kit are still conversation artifacts, not imported repository/runtime assets. NEXT-SLICES identifies exact source hashes and the custom v1 layout; audit seams/alpha on that edit, do not regenerate the older art or silently repair it.

The planned sequence is **W1 → M1.6 → M2 (N1 alongside the first inventory menu) → G1 → M3 → existing M4/M5/M6**. N1 adds direct controller/keyboard menu selection without a virtual mouse; G1 adds a persistent key lock and switch gate using shared state and the existing travel path. Object-state fallback/priority, activation versus conditions, trigger repeat scope/lifetime, denial/retry/cancellation, and unlock versus crossing commitments now have explicit contracts.

M3's conversation plan now distinguishes entry selection, choice visibility and eligibility, disabled reasons, meaningful remembered decisions, and atomic hand-in/reward/quest completion. Quest/journal/door state share one authority. The first connected content reuses Workshop/Gallery/Mara/plaque and adds a storeroom; the lens and switch must be reachable before the storeroom key. Preserve out-of-order discovery. The older town fixture remains a later expansion; initial access no longer assumes a stat model from future battle work. Player Continue/Load follows reliable storage, and optional audio cues do not block PixelFX.

All added roadmap tasks remain pending. No runtime/source/assets, packages, lockfile, map/controller/save schema, licenses, settings, or deployment changed in this planning revision. Existing test counts below are the prior runtime suite, not proof of any newly planned capability. This task checks documentation consistency/links and the docs-only Git diff; it does not claim a new game benchmark or physical-device test.

## Commands and compatibility

No package, lockfile, Node range, asset, map schema, gameplay save or controller preference change. Existing installations need only pull and restart. Supported Node is `>=22.16.0 <23 || >=24.15.0 <25`; the user's Node 24.15.0/npm 11.6.2 remains in the Windows/Linux matrix. New checkouts use `npm ci --include=dev`, then `npm run dev`. Leave Vite running on its reported address; port 5173 uses strict conflict handling.

`npm run check`: strict source checks, **190 unit tests**, content generation and production build. `npm run test:browser`: **65 Chromium scenarios** against production under `/RPGameworks/`. `npm run validate` checks canonical content; `npm run content` rebuilds it. Existing running-dev content edits still require that rebuild/refresh; no content watcher was added.

## Historical runtime verification record

The prior main `813d9f293d260c081c7c7833846dad6e37679559` passed its final [run 35337613530](https://github.com/FromAriel/RPGameworks/actions/runs/35337613530). Its earlier test synchronization correction and implementation are historical evidence in [INTERACTIONS.md](INTERACTIONS.md) and that commit, not new runtime defects introduced by this packet.

Local source checking, 190 unit tests, content validation and production builds passed with the existing genuine lockfile-installed dependencies. The local implementation tree matched candidate tree `9cbae67b7c71dd7869f09016f21c83971c6d2d34`. Local HTTP Chromium navigation was administratively blocked before game loading; browser execution/visual verification must use hosted CI, not a claimed local pass.

Candidate `57227b6589890d524458581a07ac4c12ae86ce8e` passed [run 35347806726](https://github.com/FromAriel/RPGameworks/actions/runs/35347806726) on Linux/Node 22.16.0, Linux/Node 24.15.0 and Windows/Node 24.15.0. All three legs passed strict installation, 190 unit tests, source/content/build checks and all 65 browser scenarios. Node 24 used npm 11.6.2. Clean-play, docked Debug, bottom-dialogue and narrow-panel screenshots were inspected. That was candidate evidence. The final shell revision is `dd2add47eb52b84d626ff40d057b78016781243e`; its run is recorded in the prior delivery. These are historical runtime checks, not results for the newly planned systems.

Twelve viewport unit cases and nine browser cases were added. Existing 56 gameplay/input/load/lifecycle cases remain and reach relocated controls through real menu actions. New cases cover quiet defaults/autofocus, centered black margins, resizing, live docked Debug, hidden-table DOM silence, keyboard tab/menu cycles, dialogue priority, controller pause/rearm, errors outside Debug, nested settings and reload defaults, and coarse-pointer controls. Existing tests still include 40 real door transfers, failed/cancelled destinations, old binding migration and scene restart resource counts. Counts are not a heap/GPU memory plateau or physical-phone performance proof.

## Next concrete packet

**W1 — Base skin integration** is next. Read NEXT-SLICES and retrieve the exact edited PNG/kit; preserve originals and record real canonical paths during import. Check source geometry and connector compatibility without changing Ariel's art silently. Apply the minimum compositor to existing dialogue/Settings, including live title brackets and a divider, preserving focus/input and closed-by-default tools. Finish that bounded packet and its visual/regression evidence rather than adding new UI variants.

**M1.6 — Closeout and baseline follows W1.** Record a reproducible frame/resource workload with environment/browser/commit, map, viewport, duration, effects and Debug state. Existing diagnostics/checks remain; do not recreate them or claim support from emulation. Static deployment still requires verified access and explicit direction.

Then M2 delivers state and one-shot inventory with N1 menu navigation, followed by safe storage/lifecycle acceptance; G1 supplies conditional access; M3 supplies richer conversations and the missing-lens quest plus the second-content proof. Preserve shared transactions, controller migration, lazy loading, cancellation and transfer tests. Do not skip ahead to a broad event language, editor, custom renderer or combat system.

## Limits and continuity

No inventory, gameplay saves, branching quests, combat, full PixelFX recipes, public deployment, regional asset leases, long-session memory plateau, other-browser certification, controller-only tools navigation, or Android/iOS certification is claimed. CSS viewport tests and synthetic gamepad readings are not hardware measurements. The Phaser-containing chunk remains about 1.39 MB minified / 362 KB estimated gzip with its existing warning visible. Project licensing, final art/story, naming availability and measured device budgets remain open.

Historical records: [INTERACTIONS.md](INTERACTIONS.md), [MOUSEJOY-PARITY.md](MOUSEJOY-PARITY.md), [CONTROLLER-RECOVERY.md](CONTROLLER-RECOVERY.md), [INPUT.md](INPUT.md), [MAPS.md](MAPS.md), [FOUNDATION.md](FOUNDATION.md), [TOOLCHAIN.md](TOOLCHAIN.md). Their old visible-dashboard and capped-scale descriptions are superseded by PLAYER-SHELL. The stable master plan, updated roadmap, NEXT-SLICES supplement and Decision 0001 now record the architecture and task order; the earlier immediate-M1.6 next-task text is superseded by W1 then M1.6. The player-shell implementation and this planning revision do not mark M1.6 complete.

Before editing, inspect current main, AGENTS, this status and the relevant plan. Preserve unrelated changes, update refs without force, and distinguish source, build, browser, deployment and physical-hardware evidence. The temporary read-only source-export workflow is excluded from the delivered main tree.
