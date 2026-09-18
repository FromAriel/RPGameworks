# RPGameworks — Implementation Roadmap

**Version:** 0.4 · **Date:** September 18, 2026 · **Status:** M1.1–M1.5 implemented; M1.6 closeout remains. See INTERACTIONS and STATUS for verification.

Architecture: [Master Plan](PLAN.md). Visual subsystem: [PixelFX](PIXELFX.md). Actual progress: [STATUS](STATUS.md). First implementation evidence: [FOUNDATION](FOUNDATION.md).

## Delivery rules

A milestone is a working result, not a pile of scaffolding. Each work packet should be small enough to review in an ordinary chat/GitHub session. Finish the narrow implementation, its fixtures, and its status update before starting another architectural layer.

The ordering below is a recommended sequence, not a demand to implement all future features. A small game may ship before later milestones. Browser authoring tools and advanced graphics must not prevent finishing the demo.

Update task status only when the corresponding behavior and evidence exist. Do not invent durations, completed benchmarks, CI results, or deploy URLs.

## Milestone overview

| ID | Result | Main dependency | Exit evidence |
| --- | --- | --- | --- |
| M0 | Written project contract | Repository access | Reviewed, committed documentation and handoff |
| M1 | Browser room-to-room slice | M0 | Two maps, movement, interaction, tiny effect, build/test foundation |
| M2 | Persistent world slice | M1 | Inventory, one-shot state, safe saves, repeatable transitions |
| M3 | Data-authored quest slice | M2 | Branching dialogue, a small quest, validation/reporting |
| M4 | PixelFX v1 and laboratory | M1–M3 | Recipe-driven catalog, lifecycle tests, quality controls |
| M5 | Playable turn-based battle | M2–M4 | Domain battle rules, presentation independence, reliable rewards |
| M6 | Expanding region and residency proof | M3; M5 for battle integration | Many-map fixture, bounded assets, elapsed-time behavior |
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

**Checkpoint:** The two validated maps now have a caretaker message, readable plaque, modal keyboard/pointer/controller input, and real door travel without reloading the document. Destination preparation, cancellation, Retry/Stay recovery, and explicit outgoing room cleanup are implemented. The suite has 178 unit tests and 56 browser scenarios; see [INTERACTIONS.md](INTERACTIONS.md) and [STATUS.md](STATUS.md) for actual execution evidence. M1.6 remains open for a recorded frame/resource baseline and full acceptance consolidation; no public deployment is claimed.

### Work packets

- [x] **M1.1 — Reproducible foundation.** Inspect current repository/head. Create a minimal TypeScript/Vite application, choose compatible exact dependency versions, generate a real lockfile, and add typecheck/test/build commands. Record the actual environment and package decisions.
- [x] **M1.2 — Rendering compatibility spike.** On the pinned Phaser version, prove sprite loading, atlas frames, nearest-neighbor presentation, camera alignment, one bounded emitter, and cleanup. Keep the spike small enough to replace if the selected API is wrong.
- [x] **M1.3 — Domain and map minimum.** Define IDs, a finite orthogonal map schema, two tiny maps, named spawns/exits, and a pure collision representation. Add schema and coordinate-boundary tests.
- [x] **M1.4 — Movement and input.** Implement four-direction tile-step movement with interpolation, facing, collision, and a single input owner. Include keyboard and a minimal touch-control path; prevent menu/input leakage.
- [x] **M1.5 — Interaction and lifecycle.** Add one NPC message, one interactable, repeatable door transitions, transition cancellation/error reporting, and scene-owned cleanup. Avoid hardcoding a map-specific scene class.
- [ ] **M1.6 — Build and diagnostics.** Add visible build/map diagnostics and browser smoke tests. Create validation/build CI when permissions allow. Configure and verify a static preview only if the required hosting access is available. Source/build/browser CI and diagnostics already exist; next record baseline frame/resource timings, check the remaining acceptance cases, and clearly distinguish a build from a deployment.

### Acceptance

The production build opens under its intended base path. Movement behaves correctly at multiple refresh rates and after hiding/resuming the tab. The player cannot walk through solid tiles or spawn outside the map. NPC interaction locks/unlocks the correct controls. Repeated door use does not multiply listeners or input responses.

The burst is cosmetic: removing it cannot break the interaction. Inspect the pixel presentation at two integer scales and one constrained viewport. Record baseline frame timings and resource counts without treating a fast desktop as proof of mobile performance.

**Defer:** Full inventory, quests, battle, material masks, generic event scripting, a map editor, and custom shaders.

## M2 — Persistent state and trustworthy saves

**Player-visible outcome:** Open a chest once, receive an item, change rooms, return, save/export, reload, and find the same world state with no duplicate reward.

### Work packets

- [ ] **M2.1 — State layers.** Implement immutable definitions, persistent deltas, transient map state, and separate presentation objects. Give placed objects stable instance IDs.
- [ ] **M2.2 — Inventory transaction.** Add bounded stackable items, item grants/removals, a basic inventory menu, and atomic checks. Test invalid quantities and repeated grants.
- [ ] **M2.3 — Declared facts and one-shot actions.** Add declared typed variables, one-shot completion markers, and a minimal condition/action registry. All rewards use one atomic domain path.
- [ ] **M2.4 — Safe storage.** Implement an IndexedDB adapter, versioned envelope, safe checkpoints, previous-valid-revision preservation, and clear save status. Add export/import with size/schema validation.
- [ ] **M2.5 — Failure and concurrency fixtures.** Test unavailable storage, quota failure, invalid import, corrupt/future-version saves, stale tab revisions, and interrupted writes. Preserve usable prior data.
- [ ] **M2.6 — Transition and residency audit.** Add explicit asset leases/cache ownership and outgoing-scene disposal checks. Run both repeated two-room transitions and a small distinct-map tour.

### Acceptance

The chest remains opened across both map changes and a full reload. Item totals match the expected transaction count. An invalid save import cannot overwrite a valid slot. The game remains playable with a clearly reported storage failure. A stale tab cannot silently replace newer progress.

Saving during unsupported modal activity is explicitly deferred or disabled. No promise of mid-script or mid-battle saving is implied.

**Defer:** Cloud sync, arbitrary save repair, unlimited undo history, and a full scripting language.

## M3 — Content-driven quest and authoring proof

**Player-visible outcome:** Complete a short quest across a town square, inn, cellar, and path. Conversation choices and a key/stat condition change access. Returning NPCs recognize relevant progress.

### Work packets

- [ ] **M3.1 — Dialogue graphs.** Add local node IDs, choices, declared conditions, safely substituted strings, focus ownership, and a small dialogue presenter.
- [ ] **M3.2 — Quest state machine.** Implement named states, explicit transitions, journal text, completion markers, and reusable scenario tests.
- [ ] **M3.3 — Useful actions.** Add the minimum sequence/branch/yield behavior required by the demo, with cancellation and execution budgets. Keep state transactions separate from presentation waits.
- [ ] **M3.4 — Content compiler and manifest.** Validate references and emit a compact game/region index. Check that distant content is not eagerly bundled or downloaded at startup.
- [ ] **M3.5 — Reports and authoring fixtures.** Add orphan/reference reports, missing-exit tests, blocked-spawn checks, missing-string diagnostics, and deliberately broken fixtures that prove validation catches errors.
- [ ] **M3.6 — Second-content test.** Add a second NPC, a second small quest, and an extra room primarily through content definitions. Document any engine extension that was genuinely required.

### Acceptance

The main quest is completable from a fresh game through documented alternatives. Reward collection cannot be repeated through dialogue re-entry. A save from M2 either migrates correctly or is explicitly rejected with preserved export access according to the declared compatibility policy.

Invalid references fail before deployment. A structurally unreachable node is flagged, while reports acknowledge that graph connectivity does not establish logical solvability.

**Defer:** Complex factions, procedural dialogue, broad crafting/economy systems, and a graphical quest editor.

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

### Acceptance

Headless tests resolve a battle without Phaser. Replaying the same initial state/commands/seed produces the expected domain result at different presentation speeds. Rewards are granted once. Invalid actions cannot create negative inventory or impossible targets.

Battle saves remain checkpoint-only unless a separately tested serialization design is added.

**Defer:** Real-time swarms, multiplayer combat, universal skill trees, hundreds of statuses, and an arbitrary formula interpreter.

## M6 — Expansive world proof

**Player-visible outcome:** Move through a larger test region without rising memory use, and see appropriate changes when returning after game time advances.

### Work packets

- [ ] **M6.1 — Content expansion fixture.** Build a modest authored region and a generated validation/stress pack. Distinguish synthetic map counts from actual designed playable content.
- [ ] **M6.2 — On-demand residency.** Bundle by region/shared dependency, prefetch only where useful, and evict unreferenced resources under a budget. Exercise more unique maps than fit in the cache.
- [ ] **M6.3 — World clock.** Implement explicit advance policies for travel/rest and a central due-event schedule. Keep hidden-tab wall-clock progression disabled by default.
- [ ] **M6.4 — Catch-up examples.** Add one shop refresh, one NPC schedule, and one quest deadline. Resolve global consequences independently of whether a region is loaded.
- [ ] **M6.5 — Large active map fixture.** Profile a 128 × 128-tile map with configurable static and moving actors. Introduce finer culling or bounded pathfinding only where the workload demonstrates need.
- [ ] **M6.6 — Compatibility and content tour.** Run saved-game regression fixtures, asset ownership checks, and a scripted tour through the region and its battles.

### Acceptance

Distant content does not inflate per-frame actor processing. Resident resource counts plateau according to cache policy. Loading a region twice does not apply elapsed-time rewards or penalties twice. Scheduled NPCs do not duplicate across maps.

A global deadline triggers on game-time advancement even if its associated town is not visited. Catch-up work is bounded and cannot replay millions of missed frame ticks.

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

**M1.6 — Closeout and baseline:** retain the completed interaction/door slice, review the remaining M1 acceptance cases, and record a reproducible frame/resource workload with browser, environment, scene, duration and effects setting. Source checks, validation, CI, build diagnostics and production browser tests already exist; do not rebuild them as empty scaffolding. Static deployment is conditional on verified hosting access and user direction, not assumed from a build artifact.

After M1 closeout, M2 begins with explicit persistent state layers, a one-shot chest/inventory transaction, and trustworthy save/export behavior. Preserve controller preference migration, modal command ownership, lazy map loading, safe cancellation, and the 40-transfer regression. Do not introduce broad scripting, a custom renderer, or an editor before the next playable outcome requires them.
