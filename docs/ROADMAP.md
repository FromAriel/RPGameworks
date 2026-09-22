# RPGameworks — Implementation Roadmap

**Version:** 1.0 · **Date:** September 21, 2026 · **Status:** M1/W1, N1.1–N1.2, M2, and U1 (U1.1–U1.3) are complete. G1 conditional access is next. See STATUS for verification and publication boundaries.

Architecture: [Master Plan](PLAN.md). Player-interface standard: [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md) and [Decision 0002](decisions/0002-workshop-astral-ui-language.md). Long-range completion strategy: [JRPG-BUILDOUT](JRPG-BUILDOUT.md). Visual subsystem: [PixelFX](PIXELFX.md). Actual progress: [STATUS](STATUS.md). First implementation evidence: [FOUNDATION](FOUNDATION.md). Agreed feature contracts: [NEXT-SLICES](NEXT-SLICES.md). Base-skin/state decision: [0001](decisions/0001-base-skin-and-stateful-exploration.md).

## Delivery rules

A milestone is a working result, not a pile of scaffolding. Each work packet should be small enough to review in an ordinary chat/GitHub session. Finish the narrow implementation, its fixtures, and its status update before starting another architectural layer.

The ordering below is a recommended sequence, not a demand to implement all future features. A small game may ship before later milestones. Browser authoring tools and advanced graphics must not prevent finishing the demo.

Update task status only when the corresponding behavior and evidence exist. Do not invent durations, completed benchmarks, CI results, or deploy URLs.

**Ad-hoc public playtest delivery (complete, separate from M7):** A manual-only GitHub Pages workflow built, tested, and deployed the current game at [the public playtest URL](https://fromariel.github.io/RPGameworks/) from commit `87e4538` in [run 35676907503](https://github.com/FromAriel/RPGameworks/actions/runs/35676907503). The fetched site and Workshop-to-Gallery route were smoke-tested. This supplies a convenient browser test route; it does not close M7 release hardening or imply that later `main` commits deploy automatically. See [STATUS](STATUS.md) for exact evidence and remaining acceptance boundaries.

## Approved near-term sequence

**W1 skin → M1.6 baseline → M2 state/inventory/saves with N1 navigation → U1 UI foundation → G1 conditional access → M3 conversations/quest → M4/M5/M6 as before.** M1/W1, N1.1–N1.2, M2, and U1 (U1.1–U1.3) are implemented, locally verified and accepted. G1 now applies the shared state spine to a visible key lock and switch gate. See [STATUS](STATUS.md) for current evidence, [U1-COMPONENTS](U1-COMPONENTS.md) for ownership/migration, [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md) for the visual contract and [WINDOW-SKIN](WINDOW-SKIN.md) for the retained art audit.

## Milestone overview

| ID | Result | Main dependency | Exit evidence |
| --- | --- | --- | --- |
| M0 | Written project contract | Repository access | Reviewed, committed documentation and handoff |
| M1 | Browser room-to-room slice | M0 | Two maps, movement, interaction, tiny effect, build/test foundation |
| W1 | Base skin on actual windows | Existing M1.5/player shell | Ariel's edited artwork, live titles/dividers, responsive dialogue/Settings |
| N1 | Direct menu navigation | Existing input/shell; delivered with first M2 menu | Controller/keyboard selection, confirm/cancel, scrolling, binding safety |
| M2 | Persistent world slice | M1 closeout; N1 with inventory UI | Inventory, one-shot state, safe saves, repeatable transitions |
| U1 | Coherent player-interface foundation | W1, N1 and the real M2 screens | Approved visual references, semantic tokens, reusable components and normalized existing screens |
| G1 | Conditional access integration | M2 acceptance and U1 foundation | Persistent key lock and switch gate using shared state/travel |
| M3 | Data-authored quest slice | M2 + G1; N1 for choices | Conditional dialogue, micro-quest, second-content proof, validation |
| M4 | PixelFX v1 and laboratory | M1–M3 | Recipe-driven catalog, lifecycle tests, quality controls |
| M5 | Playable turn-based battle | M2–M4 | Domain battle rules, presentation independence, reliable rewards |
| M6 | Complete chapter and expanding-region proof | M3; M5 for battle integration | Finishable chapter, many-map fixture, bounded assets, elapsed-time behavior |
| M7 | Release hardening | M1–M6 | Real-device tests, failure recovery, verified static release |
| M8 | Targeted browser authoring tools | Stable schemas and demonstrated editing friction | Validated export/import using production formats |
| M9 | Advanced optional extensions | A stable playable release | Separate experiments with measured benefits |

Mobile input, accessibility, and performance checks begin early. M7 is a consolidation gate, not permission to ignore them until then.

## M0 — Documentation baseline

**Outcome:** A future contributor can understand the intended product, current reality, and next small task without needing the original conversation.

This milestone includes README, PLAN, PIXELFX, ROADMAP, STATUS, RESEARCH, and AGENTS. It records the chosen project name without claiming legal clearance or guaranteed search performance. It distinguishes dependency facts from proposed architecture.

**Acceptance:** Internal document links resolve; names and source references agree; the repo's initial content is preserved or deliberately expanded; implementation and performance claims are clearly marked as future work.

**Not included:** Runtime code, package installation, a workflow, a deployment, asset licensing, or project licensing decisions.

## M1 — First browser slice

**Player-visible outcome:** Open the game, see a small pixel room, move around, talk to an NPC, walk through a door into a second room, return, and trigger one tiny visual burst.

**Checkpoint:** The two validated maps now have a caretaker message, readable plaque, modal keyboard/pointer/controller input, and real door travel without reloading the document. Destination preparation, cancellation, Retry/Stay recovery, and explicit outgoing room cleanup are implemented. The M1.6 slice has 216 unit tests, 81 functional browser scenarios and eight separate baseline workloads; the W1 (207/78), shell (190/65) and interaction (178/56) suites are historical. See [WINDOW-SKIN.md](WINDOW-SKIN.md), [INTERACTIONS.md](INTERACTIONS.md) and [STATUS.md](STATUS.md) for recorded execution evidence. M1.6 now records a reproducible frame/resource baseline and consolidated acceptance in [BASELINE.md](BASELINE.md); no public deployment or unmeasured hardware budget is claimed.

### Work packets

- [x] **M1.1 — Reproducible foundation.** Inspect current repository/head. Create a minimal TypeScript/Vite application, choose compatible exact dependency versions, generate a real lockfile, and add typecheck/test/build commands. Record the actual environment and package decisions.
- [x] **M1.2 — Rendering compatibility spike.** On the pinned Phaser version, prove sprite loading, atlas frames, nearest-neighbor presentation, camera alignment, one bounded emitter, and cleanup. Keep the spike small enough to replace if the selected API is wrong.
- [x] **M1.3 — Domain and map minimum.** Define IDs, a finite orthogonal map schema, two tiny maps, named spawns/exits, and a pure collision representation. Add schema and coordinate-boundary tests.
- [x] **M1.4 — Movement and input.** Implement four-direction tile-step movement with interpolation, facing, collision, and a single input owner. Include keyboard and a minimal touch-control path; prevent menu/input leakage.
- [x] **M1.5 — Interaction and lifecycle.** Add one NPC message, one interactable, repeatable door transitions, transition cancellation/error reporting, and scene-owned cleanup. Avoid hardcoding a map-specific scene class.
- [x] **M1.6 — Build, diagnostics and baseline.** Existing source/content/build CI and production-browser preview are retained. `npm run benchmark` records seven warmed ten-second workloads and a timed 40-door tour, with actual source/environment, raw callback intervals, sampled resources, Debug state and bounded probe ownership. [BASELINE.md](BASELINE.md) consolidates acceptance and [the selected record](benchmarks/M1-2026-09-18.json) preserves measured summaries. Candidate 26a7e827 passed all three environments in run 35397588184. CPU/GPU/heap budgets, long-session stability and real phones are not certified. No new public deployment is implied.

### Acceptance

The production build opens under its intended base path. Movement behaves correctly at multiple refresh rates and after hiding/resuming the tab. The player cannot walk through solid tiles or spawn outside the map. NPC interaction locks/unlocks the correct controls. Repeated door use does not multiply listeners or input responses.

The burst is cosmetic: removing it cannot break the interaction. Inspect the pixel presentation at two integer scales and one constrained viewport. Record baseline frame timings and resource counts without treating a fast desktop as proof of mobile performance.

**Defer:** Full inventory, quests, battle, material masks, generic event scripting, a map editor, and custom shaders.

## W1 — Base skin integration (implemented)

**Outcome:** Mara's existing message window and Settings use Ariel's edited base skin, a live title opening, and a real section divider. Keep the default game view clean and tools optional. Detailed art identity, packing, joining and acceptance rules: [NEXT-SLICES](NEXT-SLICES.md).

- [x] **W1.1 — Source and seam audit.** Retrieve the exact edited PNG and companion kit; record original bytes/hash, alpha, dimensions, extraction rectangles and provenance. Audit ports/shoulders against the actual edit. Preserve it rather than regenerating the older sample or silently repainting mismatches. The selected source is now imported; see WINDOW-SKIN for its exact identity and retained seam warnings.
- [x] **W1.2 — Minimum production compositor.** Implement the fixed corners, repeats/plain remainder plus complete mirrored ending, title brackets, fills and dividers needed by those real surfaces. Retain the full format's named roles for future use, with no per-stamp DOM explosion or per-frame border rebuild.
- [x] **W1.3 — Integration and acceptance.** Preserve semantic text/input/modal behavior, readable responsive content and current shell defaults. Check real dialogue/Settings, long titles, narrow/wide and odd/remainder dimensions, selected/focused states, revised-alpha composition, disposal and skin-load fallback. Record any unresolved seam explicitly.

**Delivery evidence:** Candidate `75bed7605ed6d4eb857cc92027d0ebc25b86e420` passed 207 unit tests and 78 production-browser scenarios across Windows/Node 24 and Linux/Node 22/24 in [run 35369541935](https://github.com/FromAriel/RPGameworks/actions/runs/35369541935). The exact edited PNG, production manifest, known connector/alpha audit and adapted full slot explainer are preserved in the repository. Right-edge plain spans use an explicitly documented derived port profile; eight original shoulder differences remain recorded and the unused D6 attachment is not claimed compatible. Live titles/divider, bounded invalidation, load fallback, fixed long-message actions and input/lifecycle regressions are covered. STATUS identifies the next task; final main CI remains authoritative.

**Defer:** theme editor, extra visual tiers, recolored variants, fake inventory/party screens, new source packing and Python as a browser runtime requirement.

The subsequent M1.6 baseline is now recorded in [BASELINE.md](BASELINE.md). Proceed to M2 state and the first chest/inventory proof, with N1 alongside its menu. Preserve the skin rather than reopening general UI redesign; future performance comparisons must identify environment, source, map, viewport, duration, effects and Debug state.

## N1 — Direct menu and choice navigation

**Scheduling:** reuse the current input/sampler; deliver the core with or before M2.2's first real inventory menu. Integrate choices during M3.1. This is not new controller detection and does not require a virtual cursor.

- [x] **N1.1 — Navigation owner.** Direct directional selection/focus, confirm/cancel, scroll-to-selection, bounded held repeat and predictable focus restoration for actual lists/tabs/controls. Include controller access to the player menu and existing Settings, preserve bindings, and explicitly validate/migrate any additional Menu action.
- [x] **N1.2 — First inventory/menu acceptance.** Test keyboard/controller/pointer handoff, scrolling, disabled items, nested settings, remapping, disconnect/reconnect and held-input leakage. Prompts reflect configured actions; no hidden menu can keep exploration blocked. Empty save-slot Load supplies the real disabled control and adjacent reason.
- [ ] **N1.3 — Dialogue choices.** Reuse the model for M3.1 visible/disabled/hidden choices, preserving stable selection and a cancel/fallback path. No second incompatible navigation system.

Keep Debug separate from player Inventory/Journal/Party/save functions. Add those entries only when their models work. New Game / Continue / Load follows M2.4/M2.5 storage; protect existing progress rather than adding a nonfunctional title screen.

**N1 evidence:** Inventory, Save/Load, and existing Settings/Debug controls share one semantic navigation owner and the existing sampled controller. Keyboard/controller/pointer handoff, scrolling, disabled empty-slot Load, remapping, nested Settings, reconnects, held-input isolation and repeated opening are covered. N1.3 remains paired with M3 dialogue choices.

## M2 — Persistent state and trustworthy saves

**Player-visible outcome:** Open a chest once, receive an item, change rooms, return, save/export, reload, and find the same world state with no duplicate reward.

### Work packets

- [x] **M2.1 — State layers.** Implement immutable definitions, persistent deltas, transient map state, and separate presentation objects. Give placed objects stable instance IDs. Declare fact types/defaults/ownership/persistence; chest/switch/lock state belongs to instances, not art/templates. Prepare ordered conditional object states with fallback and state-driven appearance/interaction.
- [x] **M2.2 — Inventory transaction.** Add bounded stackable items, item grants/removals, a basic inventory menu, and atomic checks. Deliver it with N1 core navigation. Test invalid/full inventory and repeated grants; failure cannot partly claim a chest or lose its reward.
- [x] **M2.3 — Declared facts and one-shot actions.** Add bounded pure all/any/not, typed fact/placement/item checks, one-shot markers and a minimal registered action vocabulary. All rewards use one atomic domain path. Interact is the only executing event in M2; Enter and State changed remain reserved. Active objects update through dependency-indexed commit subscriptions rather than frame scans.
- [x] **M2.4 — Safe storage.** Implement a three-slot IndexedDB adapter, versioned envelope, exact safe checkpoints, previous-valid-revision preservation, and clear save status. Add bounded export/import for facts, inventory and placement deltas plus transactional in-place loading. Title-screen Continue remains deferred.
- [x] **M2.5 — Failure and concurrency fixtures.** Test unavailable storage, quota/abort failures, invalid import, corrupt/future/incompatible saves, prior-revision recovery, stale tab revisions, and failed destination preparation. Preserve usable prior data and the running session.
- [x] **M2.6 — Transition and residency audit.** Record app/session/repository/UI/room/input/request/subscription ownership, expose bounded diagnostics, retain the existing repeated two-room tour, and add a twelve-distinct-map residency fixture. The one app-owned foundation atlas means a generalized regional asset cache is deliberately deferred.

### Acceptance

The chest remains opened across both map changes and a full reload. Item totals match the expected transaction count. An invalid save import cannot overwrite a valid slot. The game remains playable with a clearly reported storage failure. A stale tab cannot silently replace newer progress.

Saving during unsupported modal activity is explicitly deferred or disabled. No promise of mid-script or mid-battle saving is implied.

**Defer:** Cloud sync, arbitrary save repair, unlimited undo history, and a full scripting language.

**Evidence:** The prior M2.2 candidate `cf534f912f39e931d7448e9d577f6bee7fe252b7` passed 252 unit tests, 95 functional Chromium scenarios and eight benchmark workloads across Windows/Node 24 and Linux/Node 22/24 in [run 35437641180](https://github.com/FromAriel/RPGameworks/actions/runs/35437641180). The complete local M2 candidate adds the plaque proof, save fixtures/service/UI, concurrency/failure paths, in-place loads, and twelve-map audit; STATUS records its current local gates. Publication and exact-commit CI remain separate.

## U1 — Player-interface visual language and core components

**Player-visible outcome:** Dialogue, Inventory, Save/Load and Settings feel like parts of one intentional JRPG interface. Selection, focus, disabled reasons, feedback, actions and responsive layouts look and behave consistently, while Ariel's exact windowskin remains the art foundation.

The detailed direction, tokens, component contracts, full-JRPG screen patterns and acceptance matrix live in [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md). U1 is a focused foundation, not a theme editor or permission to build empty Party/Battle/Journal screens.

- [x] **U1.1 — Visual references and token baseline.** The approved reference contains 12 real production captures at matched wide, compact, touch-first, failure and forced-colors states. Workshop Astral semantic cyan/brass/violet and outcome-state tokens centralize color, type, spacing, focus, safe-area and target-size values without changing gameplay behavior. All matched pre/post captures are byte-identical; Ariel separately accepted the reference set.
- [x] **U1.2 — Core components and UI gallery.** The production controls and isolated gallery are implemented, locally verified and visually accepted. The accepted treatment includes brighter outlined component-level brass and a default-off, optional opacity-only glow pulse for meters, selected rows/tabs and highlighted actions.
- [x] **U1.3 — Existing-screen normalization.** Move dialogue, Inventory, Save/Load and player-facing Settings onto the approved tokens and components. Preserve Debug separation, exact skin identity, plain/forced-color fallback, long text, storage recovery and all existing keyboard/controller/pointer behavior. Delivered as accepted slices U1.3a–U1.3d, including the shared confirmation interaction on Save/Load; see [STATUS](STATUS.md) and the accepted captures under `docs/ui-reference/u1.3/`.
- [ ] **U1.4 — Gameplay extensions.** Add choice/Journal patterns with M3, battle/party/equipment/shop patterns with M5, and title/Continue/credits patterns only when their domain behavior exists. Update the shared standard when an implemented feature establishes a reusable rule.
- [ ] **U1.5 — Cohesion and accessibility gate.** Before release, complete the cross-screen input tour, responsive/text-enlargement/reduced-motion/forced-color checks, prompt/copy/focus audit and separate human visual review.

**Foundation acceptance:** U1.1–U1.3 pass before U1 is considered ready for G1/M3 expansion. The same production components appear in the gallery and real screens; every applicable control state is specified; resizing retains meaning and selection; held input cannot repeat through window changes; decorative-art failure leaves a readable and controllable UI. Automation, visual review and Ariel's manual acceptance remain separately recorded.

**Defer:** new windowskin art, recolored themes, a theme editor, a custom font, dead future menu entries, title flow, portrait system, dialogue history and battle UI without battle rules.

## G1 — Conditional access integration

**Dependency:** complete M2 state/save/lifecycle acceptance and the U1.1–U1.3 interface foundation. **Outcome:** one key lock and one switch gate respond to the same authoritative facts/inventory/placement state and remain correct across travel and reload. Detailed semantics: [NEXT-SLICES](NEXT-SLICES.md).

- [ ] **G1.1 — Conditional object/access contract.** Separate activation, eligibility, denial, unlock, visual state, passability and destination; retain unconditional exits and old content. Give conditional states an explicit order/fallback and update dynamic collision at safe boundaries with a tested occupied-cell policy. Keys are retained by default, unlock markers are per lock, and the return route is deliberately authored.
- [ ] **G1.2 — Existing travel integration.** Denial reports once and makes no destination fetch. Success uses existing prepare/validate/activate, generation/cancel guards, Retry/Stay and cleanup. Recheck relevant state before commitment; distinguish permanent unlocking from crossing. Future passage-only costs cannot be charged for failed/cancelled travel.
- [ ] **G1.3 — Playable proof and failures.** Test missing/present key, already unlocked, two independent locks, switch appearance/collision, occupied gate cell, reverse travel, reload, rapid input and cancelled/failed destination recovery. Preserve the 40-transfer and unconditional-exit regressions.

**Defer:** toll implementation, stat checks, time schedules, arbitrary scripted transitions, hidden-entrance variants not used by content, and a new loader.

## M3 — Content-driven quest and authoring proof

**Player-visible outcome:** Complete the missing-lens micro-quest using the existing Workshop, Gallery, Mara and plaque plus one storeroom. Clue facts, a reachable switch/gate and one-shot lens chest feed a conditional conversation; handing in the lens completes the quest and grants a brass key once. It unlocks the storeroom, which must not contain the prerequisite switch/lens. Save/reload and returning NPCs recognize progress.

This smaller proving ground precedes the old town-square/inn/cellar/path expansion. First access conditions use keys, switches and quest facts; stat gates require a separately approved exploration-stat model instead of depending on later battle systems. See [NEXT-SLICES](NEXT-SLICES.md) for the route and out-of-order discovery tests.

### Work packets

- [ ] **M3.1 — Dialogue graphs.** Preserve existing finite messages; add stable node IDs, ordered entry rules with fallback, choices with separate visibility/eligibility and disabled reasons, safely substituted text and explicit ends. Revalidate on confirm and handle changing/no selectable choices. Reuse N1 with proper modal ownership. Use M2 facts before M3.2 adds quest-state checks; portraits/typewriter/history are deferred.
- [ ] **M3.2 — Quest state machine.** Implement named states, legal transitions, derived journal text, completion markers and quest-state conditions. Entry rules select before/during/ready/completed conversations from that shared state. Preserve discovered progress when the quest is accepted late; add save compatibility fixtures.
- [ ] **M3.3 — Useful actions.** Add the minimum sequence/branch/yield behavior required by the demo, with cancellation and execution budgets. Accepted choices use shared transactions: hand-in, reward and completion together, once. Remember meaningful authored decisions/topics, not every sentence. Keep state transactions separate from presentation waits; cancel does not undo already committed story changes.
- [ ] **M3.4 — Content compiler and manifest.** Validate references and emit a compact game/region index. Check that distant content is not eagerly bundled or downloaded at startup.
- [ ] **M3.5 — Reports and authoring fixtures.** Add orphan/reference reports, missing-exit tests, blocked-spawn checks, missing-string diagnostics, and deliberately broken fixtures that prove validation catches errors.
- [ ] **M3.6 — Second-content test.** Add a second NPC, another conditional entrance, a second small quest and an extra room primarily through content definitions. Document any genuinely required engine primitive; do not introduce per-NPC/per-door hardcoded branches and call that data-driven.

### Acceptance

The main quest is completable from a fresh game through documented routes, including declining then returning and finding the lens before accepting. Hidden/disabled choices, priority/fallback, full inventory, cancellation, stale prerequisites and repeated acknowledgement are tested. Reward collection cannot be repeated through dialogue re-entry. The clue, switch, chest, lock, inventory and quest agree after travel/reload, with no circular access dependency. A save from M2 either migrates correctly or is explicitly rejected with preserved export access according to the declared compatibility policy.

Invalid references fail before deployment. A structurally unreachable node is flagged, while reports acknowledge that graph connectivity does not establish logical solvability.

**Defer:** Complex factions, procedural dialogue, broad crafting/economy systems, and a graphical quest editor.

## Optional post-M3 audio polish

- [ ] **A1 — Small nonessential cue set.** Exercise the planned bounded audio service with confirm/cancel/denied-action/door cues, per-category volume/mute, user-gesture start and cleanup. Missing sound is nonfatal; no essential information is sound-only. Do not preload the world's music or delay M4 for this optional packet.

## M4 — PixelFX v1

**Player-visible outcome:** The small game has distinctive impacts, healing, dust/trails, a teleport impression, a magical ambient effect, and a defeat-style animation assembled from reusable recipes.

### Work packets

- [ ] **M4.1 — Presentation contract.** Add validated effect requests, scene/actor anchors, independent cosmetic seeds, cancellation handles, and missing-effect fallback.
- [ ] **M4.2 — Recipe runner.** Implement finite timelines, parallel visual tracks, parameter bounds, and recursion/expansion limits. Begin with sprites, stock emitters, tint, and simple transforms.
- [ ] **M4.3 — Resource policy.** Add global/per-recipe caps, bounded emitter ownership, small reserves, dropped-effect counters, and quality presets. Do not preallocate the high preset on every device.
- [ ] **M4.4 — Reference catalog.** Author roughly six visually distinct effects. Test on bright and dark maps, under camera motion, and with reduced effects.
- [ ] **M4.5 — FX laboratory.** Add recipe/seed selection, replay/step, background choice, parameter editing, diagnostics, and complete-file export/import. It must run the production effect code.
- [ ] **M4.6 — Saturation and cleanup proof.** Test burst, steady-flow, large-alpha-overdraw, scene-exit, target-despawn, and cancellation cases. Compare domain state hashes with effects enabled, disabled, and saturated.

### Acceptance

Changing an effect recipe does not require editing the runner. Global ceilings cannot be bypassed with nested effects. Lower quality preserves clear essential feedback. Scene exit leaves no scene-owned emitters, callbacks, or texture leases behind.

Record measured capacity separately from the provisional 500/1,500/4,000 particle caps. A large count with tiny sprites is not evidence that large blended overlays perform equally well.

**Defer:** Material-aware breakup, generalized dissolve shaders, GPU custom batches, and one-particle-per-source-pixel explosions.

## M5 — Battle and core RPG rules

**Player-visible outcome:** Enter a short turn-based battle, select an action or item, see readable feedback, win or lose, and return with correct persistent rewards.

### Work packets

- [ ] **M5.1 — Pure battle kernel.** Define combatants, minimal stats, turns, target rules, damage/rounding, and a seeded random stream. Implement one hero, one enemy, and basic attack first.
- [ ] **M5.2 — Integration lifecycle.** Enter/exit battle without leaking exploration input, scene resources, or state. Preserve a safe return checkpoint.
- [ ] **M5.3 — Commands and inventory.** Add a consumable, invalid-target handling, cancellation before commitment, and atomic item spending.
- [ ] **M5.4 — Presentation sequence.** Show already-resolved results through animation, PixelFX, numbers, and audio. Add skip/accelerate/reduced-effects behavior without changing outcomes.
- [ ] **M5.5 — Reward and defeat rules.** Cover simultaneous defeat, repeated completion callbacks, rewards, escape if included, and game-over/retry behavior.
- [ ] **M5.6 — Controlled expansion.** Add a small party, one equipment modifier, a skill, and a status effect only after the minimum battle passes its tests.
- [ ] **M5.7 — Preparation and economy loop.** Add transactional currency, one shop, usable items, equip/unequip comparison, and one paid rest/recovery point. Keep prices and rules authored and validated; do not introduce crafting or a generalized economy engine.

### Acceptance

Headless tests resolve a battle without Phaser. Replaying the same initial state/commands/seed produces the expected domain result at different presentation speeds. Rewards are granted once. Invalid actions cannot create negative inventory or impossible targets.

Battle saves remain checkpoint-only unless a separately tested serialization design is added.

Before M5 exits, the player can prepare for a second battle through at least one purchase, item use, equipment decision, recovery service, or progression reward. Charges, inventory changes and derived statistics commit atomically and remain correct after save/load.

**Defer:** Real-time swarms, multiplayer combat, universal skill trees, hundreds of statuses, and an arbitrary formula interpreter.

## M6 — Complete chapter and expansive-world proof

**Player-visible outcome:** Finish a small coherent JRPG chapter, then move through a larger test region without rising memory use and see appropriate changes when returning after game time advances.

### Work packets

- [ ] **M6.1 — Small complete chapter gate.** Finish an authored beginning-to-ending chapter using exploration, the lens quest, a safe hub, preparation/economy, route or dungeon traversal, battles, a boss and a clear ending. Keep the scope small enough to test every required route and supported input flow.
- [ ] **M6.2 — Content expansion fixture.** Build a modest authored region and a generated validation/stress pack. Distinguish synthetic map counts from actual designed playable content.
- [ ] **M6.3 — On-demand residency.** Bundle by region/shared dependency, prefetch only where useful, and evict unreferenced resources under a budget. Exercise more unique maps than fit in the cache.
- [ ] **M6.4 — World clock.** Implement explicit advance policies for travel/rest and a central due-event schedule. Keep hidden-tab wall-clock progression disabled by default.
- [ ] **M6.5 — Catch-up examples.** Add one shop refresh, one NPC schedule, and one quest deadline. Resolve global consequences independently of whether a region is loaded.
- [ ] **M6.6 — Large active map fixture.** Profile a 128 × 128-tile map with configurable static and moving actors. Introduce finer culling or bounded pathfinding only where the workload demonstrates need.
- [ ] **M6.7 — Compatibility and content tour.** Run saved-game regression fixtures, asset ownership checks, a fresh-to-ending production playthrough, and a scripted tour through the wider region and its battles.

### Acceptance

Distant content does not inflate per-frame actor processing. Resident resource counts plateau according to cache policy. Loading a region twice does not apply elapsed-time rewards or penalties twice. Scheduled NPCs do not duplicate across maps.

A global deadline triggers on game-time advancement even if its associated town is not visited. Catch-up work is bounded and cannot replay millions of missed frame ticks.

The complete chapter can be started from a fresh profile, saved and exported at named checkpoints, recovered from supported failures, and finished without debug tools. Its exact production artifact receives a human playthrough; automated coverage and a successful build are recorded separately from that playtest.

**Defer:** Seamless entire-world streaming and simulated offscreen travel unless a concrete game feature requires them.

## M7 — Release hardening

**Player-visible outcome:** A dependable small browser JRPG that can be shared and played on the specifically tested desktop/mobile targets.

### Work packets

- [ ] **M7.1 — Device matrix.** Record actual desktop, Android, and iOS hardware/browser versions, viewports, quality settings, and thermal/long-session observations. Mark unavailable targets as untested.
- [ ] **M7.2 — Accessibility and input.** Test keyboard-only menus, touch targets, text scaling, reduced effects, focus transitions, audio controls, and non-color essential cues.
- [ ] **M7.3 — Lifecycle recovery.** Test hidden/resumed tabs, failed assets, context loss where practical, network interruption, storage limits, stale saves, and multiple open tabs.
- [ ] **M7.4 — Delivery correctness.** Verify the actual production base path, lazy chunks, asset URLs, build/content version, and cache behavior. Deploy only the validated artifact.
- [ ] **M7.5 — Release documentation.** Publish working setup instructions, controls, supported/untested environments, known issues, asset attributions, and the owner's explicit licensing decision.
- [ ] **M7.6 — Optional offline spike.** Only after ordinary update behavior is stable, evaluate a bounded versioned service worker and deliberate update activation. Omit offline support if it weakens reliability.

### Acceptance

The release URL is opened and checked. Test reports identify the deployed revision. No feature is advertised merely because a dependency could support it. Save export is easy to find. A real-device reduced-effects configuration remains readable and usable.

**Release stop conditions:** Data loss, duplicate rewards, missing critical assets, broken input, an unbounded lifecycle leak, or a claim of platform support without evidence.

## M8 — Browser authoring tools

Build only the tool whose absence is repeatedly slowing real work. Candidate order is FX laboratory improvements, content inspector, small map editor/importer, dialogue graph viewer/editor, and quest/state inspector.

Each tool must use the existing schema, validate before export, preserve IDs, provide explicit import/export, and clearly distinguish local edits from saved repository changes. Add undo/redo for editing operations before claiming an editor is safe for substantial work.

A static editor does not imply authenticated GitHub writing. Start with complete-file export/import and chat-assisted repository changes. A future direct-save integration requires a separate authorization and secret-handling design.

**Acceptance:** Round-trip tests preserve supported records; unsupported data is rejected or retained explicitly, never silently dropped. Exported content passes the same validator used by the game. No editor-only hidden state is required at runtime.

## M9 — Optional experiments

Candidates include sprite fragmentation, material masks, palette-aware effects, controlled dissolve filters, GPU sprite layers, richer weather, relationships/factions, card-based combat, lifepath/name-generation content, additional rulesets, native wrappers, and a second independent game.

Every experiment has a named use case, an isolated branch/module, a baseline, a test scene, a compatibility plan, and a keep/reject decision. An attractive feature is not automatically promoted into the required engine core.

Extract reusable packages only after at least two real consumers show a stable boundary. Consider workers only after profiling shows main-thread work that can move without introducing worse serialization or synchronization cost.

## Definition of done for an individual packet

The requested behavior exists; relevant old behavior still works; new data is validated; failure/cancellation paths are covered; resource ownership is explicit; tests and build output are reported honestly; any save/schema change has a migration decision; and STATUS records the next task.

A commit is not a build. A build is not a deployment. A deployment is not a playtest. Report those states separately.

## Next implementation packet

**U1.3 existing-screen normalization.** Migrate dialogue, Inventory, Save/Load and player-facing Settings one screen at a time onto the accepted U1.2 components while preserving the U1.1 references and all existing behavior.

U1.2 adds shared production components and the test-only gallery; U1.3 normalizes the real screens. G1 then applies the completed M2 facts, conditions, actions, session activation and save compatibility contracts to the first passability-changing access rule. M3 follows with conditional conversations and the connected missing-lens quest. Preserve controller migration, modal ownership, lazy loading, cancellation, optimistic storage and residency tests throughout. Reuse `npm run benchmark` for comparable future measurements; preserve the exact skin and do not treat a headless baseline as phone certification.

The detailed continuation through deterministic battle, party/progression, preparation/economy, the first complete chapter, content scale and release is recorded in [JRPG-BUILDOUT](JRPG-BUILDOUT.md). It is a sequencing companion, not evidence that those later systems exist.
