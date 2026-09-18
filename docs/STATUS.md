# RPGameworks — Current Status and Handoff

**Updated:** September 18, 2026, M1.4/M1.5 interaction and room-travel delivery.

## Current phase

**M1.1–M1.5 implemented and tested. M1.6 closeout remains.** The two-room demo now supports talking to a caretaker, reading a plaque, and using actual doorways without reloading the page. Do not continue the old controller-troubleshooting thread as the next gameplay task: Ariel subsequently attributed her controller problem to Chrome. This is user-reported resolution, not a physical-device certification by CI.

The Workshop caretaker Mara is at (10,8), two tiles south of the initial player. Move one tile south, face her, and interact. The eastern doorway at (18,6) leads to the Pillar Gallery's `from-workshop` spawn at (2,6). Read the plaque at (4,4), then use the western doorway (1,6) to return at the Workshop's `from-gallery` spawn (17,6). Default map/spawn IDs are preserved.

Keyboard: WASD/arrows move; E/Enter interact or advance; Escape closes/cancels. Space remains a cosmetic burst in exploration and advances an open message. Pointer controls include Interact and modal action buttons. Standard controller defaults retain A for the burst, add X for interaction/advance and B for close/cancel. Actual saved custom bindings may differ; use the panel's displayed assignments.

## Architecture and behavior

Finite messages and English string keys are authored inside map JSON. Placements reference local message IDs. Shared generated-schema/semantic validation checks missing text/message references, duplicates, bounds, blank strings, and impossible adjacent interaction cells. Old map v1 records without messages remain accepted. Text is rendered literally with textContent, not HTML. No branching dialogue, conditions, quests, or arbitrary code evaluation is introduced.

The one reusable Phaser scene owns its InputController and an explicit MapView for the resident room. Normal doors retain the browser document, game, scene, shared atlas, and input owner. Destination data and frames are checked before activation. A new view is prepared invisibly; only after success does it replace the current view and destroy outgoing sprites/particles. Two visual sets can briefly coexist during synchronous preparation; this is not a claim of constant peak transition memory. Restart room still separately exercises actual scene teardown/recreation.

A single pending TransitionTask owns cancellation and stale-result rejection. Door entry stops at a completed tile checkpoint. Failed loads offer Retry or Stay here while keeping the current room. Pending travel can be cancelled; late responses cannot replace the current scene. Exit entry guards prevent immediate bounce or automatic retry while standing on a cancelled/failed exit. Leave and re-enter for a new attempt. Explicit scene/cleanup exceptions remain fatal and visible.

The native modal owns input and makes background controls inert. Moving, burst input, and restart are blocked while messages or travel own control. The same held press cannot close a message and trigger an exploration action. The existing app-owned controller sampler, startup autofocus, input safety gates, bounded particles, map loading limits, and page-error isolation are preserved.

See [INTERACTIONS.md](INTERACTIONS.md) for the implementation, authoring contract, compatibility, and test scope.

## Compatibility

Game/map schema v1 is extended additively with optional messages, strings.en and placement messageId. Generated types/validators remain build outputs. Existing namespaced map/spawn IDs and old message-free map fixtures remain valid.

Controller preferences use v2, adding interaction/cancel. Valid v1 custom settings are migrated without replacing any original binding, axis, inversion, deadzone, or enable setting. New actions take an unused button when X/B was already assigned. Old v1 storage is preserved. Storage failure keeps session settings usable and visible. There is no gameplay save format yet.

No dependency, lockfile, Node range, licensing, game-server, or public-deployment change. The atlas adds three original placeholder frames (caretaker, door, plaque), for twelve frames total; existing frame names are preserved.

## Commands and observed verification

Node `>=22.16.0 <23 || >=24.15.0 <25` remains supported. Ariel's Node 24.15.0/npm 11.6.2 remains in the Windows/Linux matrix. Existing installations need only pull and restart for this slice. Fresh checkouts run `npm ci --include=dev`, then `npm run dev`. Keep Vite running; it uses port 5173 with explicit port-conflict failure. Local Git build identity remains visible.

`npm run check` runs strict TypeScript/checked-JavaScript checks, **178 unit tests**, validated content generation, and a production build. `npm run test:browser` runs **56 Chromium scenarios** against production under `/RPGameworks/`. `npm run validate` checks authored content; `npm run content` regenerates it. Content editing while dev is already running still requires rebuilding content and refreshing; no watcher is supplied.

Source revision **`d7b1c0dba137a5e29bffc2c69ffe38ec24d56a0d`** passed [run 35335800741](https://github.com/FromAriel/RPGameworks/actions/runs/35335800741) on Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Both Node 24 jobs used npm 11.6.2. Every leg passed installation, checks, all 178 unit tests, all 56 browser scenarios, and builds. The final clean main delivery gets its own normal CI; inspect that exact commit before claiming its checks passed.

New coverage includes 27 unit cases and 14 browser scenarios: facing/mid-step behavior, finite messages, text safety, controller ownership and migration, exact door checkpoints, duplicate/cancelled/stale transfers, five malformed/missing destination variants, timeout/Retry/Stay, document continuity and lazy requests, and **20 round trips / 40 actual door transfers**. That tour checks stable per-room display-object counts, texture count, one active scene, one active map, particles cleared, and a single effect response afterward. It is not a heap/GPU memory plateau benchmark.

The initial candidate passed all new interaction cases but failed one older recovery assertion because new status copy omitted the explicit Ready label. The label was restored in application code without weakening the existing test. Desktop caretaker and narrow plaque screenshots were inspected. Local source/unit/content/build checks passed with genuine CI-exported locked dependencies; local HTTP Chromium navigation was administratively blocked, so hosted CI supplies browser evidence. Controller inputs are synthetic; no actual Elite device or phone was attached to CI.

Earlier input/map/foundation history remains in [MOUSEJOY-PARITY.md](MOUSEJOY-PARITY.md), [CONTROLLER-RECOVERY.md](CONTROLLER-RECOVERY.md), [INPUT.md](INPUT.md), [MAPS.md](MAPS.md), [FOUNDATION.md](FOUNDATION.md), and [TOOLCHAIN.md](TOOLCHAIN.md). Those historical descriptions of metadata-only exits, preference v1, and missing messages have been superseded here. The temporary read-only source-export workflow is not included in the delivered tree.

## Next concrete packet

**M1.6 — Closeout and baseline.** Retain the working room-to-room slice, review the remaining M1 acceptance cases, and record a reproducible frame/resource workload with environment, browser, duration, scene and effects setting. Source checks, content validation, build diagnostics and browser CI already exist; do not recreate them as empty scaffolding. Static preview/deployment is conditional on verified hosting access and user direction, not implied by an artifact.

After closeout, **M2** begins persistent state layers, a one-shot chest and inventory transaction, then trustworthy save/export behavior. Preserve input context ownership, migration fixtures, lazy loading, cancellation, and the repeated-transfer tests. Do not skip to a broad event language, editor, custom renderer, or combat framework.

## Open limits and handoff

No inventory, gameplay saves, branching quest, combat, full PixelFX recipes, public deployment, regional asset leases, long-session memory plateau, phone support certification, or other-browser-engine coverage is claimed. The Phaser-containing bundle remains approximately 1.39 MB minified / 362 KB estimated gzip with its warning visible. Performance targets are not measured hardware guarantees. Project licensing, final story/art direction, naming availability/SEO and full device support remain open.

Before editing, inspect current main, AGENTS.md, this status and the next roadmap packet. Preserve unrelated work, update refs without force, and distinguish source, build, browser, deployment, and physical-hardware evidence. Keep the next handoff truthful and concrete.
