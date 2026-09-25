# RPGameworks — Implementation Roadmap

**Version:** 1.1 · **Date:** September 24, 2026 · **Status:** M1/W1, N1.1–N1.2, M2, U1, G1.1 and G1.2 are delivered to `main`. G1.2's Pages release remains separate. N1.3 and the bounded M3 quest slice are locally verified and accepted by Ariel; source delivery is pending. G1.3 follows M3 source delivery, then M3.5 authoring reports before M4. See STATUS for verification and publication boundaries.

Architecture: [Master Plan](PLAN.md). Player-interface standard: [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md) and [Decision 0002](decisions/0002-workshop-astral-ui-language.md). Long-range completion strategy: [JRPG-BUILDOUT](JRPG-BUILDOUT.md). Visual subsystem: [PixelFX](PIXELFX.md). Actual progress: [STATUS](STATUS.md). First implementation evidence: [FOUNDATION](FOUNDATION.md). Agreed feature contracts: [NEXT-SLICES](NEXT-SLICES.md). Base-skin/state decision: [0001](decisions/0001-base-skin-and-stateful-exploration.md).

## Delivery rules

### Current delivery view

| Gate | Current state | Next decision |
| --- | --- | --- |
| Public playtest | Approved animated hero is hosted from game commit `05705b9`; hosted play feedback remains open | Record Ariel's hosted playtest separately from build and browser checks |
| G1.2 conditional travel | Corrected visible locked/unlocked door and set-back arrivals were accepted and pushed as `070234a` | Decide on a Pages release separately |
| M3 missing-lens and archive-ledger quests | Locally accepted: generic dialogue/quest/item hand-in, Journal, lit Gallery and v1 migration; both playtest corrections pass 356 unit/content tests and 146 browser scenarios | Deliver reviewed source to `main`; decide Pages release separately |
| G1.3 independent locks | Next after M3 source delivery | Author a Workshop supply room with its own keyed lock and marker; check surrounding gate/door UX |
| M3.5 authoring reports | After G1.3 | Add orphan/reference reports and deliberately broken validation fixtures before M4 |
| Later chapter release | Planned | Add the minimum FX contract and battle, finish M6.1, then perform M7 release hardening |
| Region-scale proof and optional art/tools | Later packets | Expand only after the small complete chapter has a tested release path |

"Implemented", "locally verified", "Ariel accepted", "pushed", and "hosted" are separate states. A checked packet records implementation evidence; STATUS records the exact remaining acceptance and release boundary.

**Ad-hoc dialogue follow-up:** Mara's earlier conditional plaque response was incorporated into the M3 dialogue graph. The current local candidate adds explicit acceptance, item hand-in, completion and save migration; see [STATUS](STATUS.md) for the checks and review boundary.

**Local M3 playtest corrections:** Ariel found that accepting the archive-ledger quest immediately exposed a hand-in choice before the item was found. Both authored quests now use an acceptance wrap-up and reserve ordinary hand-in for a later visit. Ariel then found the already-held lens offer clunky: that path now asks directly for the item and, if the player chooses to give it, silently stages acceptance and completion with item removal in one transaction. Declining or closing leaves the item and quest untouched; the clerk uses the same authored pattern. The clerk's door directions no longer assume the door is still locked. See [STATUS](STATUS.md) for post-correction evidence.

A milestone is a working result, not a pile of scaffolding. Each work packet should be small enough to review in an ordinary chat/GitHub session. Finish the narrow implementation, its fixtures, and its status update before starting another architectural layer.

The ordering below is a recommended sequence, not a demand to implement all future features. A small game may ship before later milestones. Browser authoring tools and advanced graphics must not prevent finishing the demo.

Update task status only when the corresponding behavior and evidence exist. Do not invent durations, completed benchmarks, CI results, or deploy URLs.

**Historical character-art research (subsequently implemented in CA1/CA2):** The ignored Cute Fantasy player pack has a [sprite-sheet layout schema, populated map, and reconstruction guide](asset-analysis/README.md). It identifies verified layer order, row offsets, and split tool depth; Ariel's 56-row map supplies animation names, directions, and frame counts even though the Aseprite file has no animation tags. The last two body cells of each `fish_cast` row are exact duplicates, but the rod overlay differs by four pixels; Ariel chose nine frames for all three cast directions. Mirroring, playback timing, anchoring, and approval were open at that point; the later CA1/CA2 release below resolves the starter appearance. This research packet itself did not add art to the production bundle.

**Ad-hoc CA1/CA2 game-art release (published):** [CHARACTER-ASSET-INTEGRATION](CHARACTER-ASSET-INTEGRATION.md) remains the detailed CA1–CA4 plan. The synthetic pack foundation and recorded appearance feed an explicit, hash-pinned real-pixel generator. Ariel approved the 46,336-byte derived `starter-hero.rpgpack` after reviewing the local Workshop/Gallery preview. It drives six layered idle/walk animations with fallback and lifecycle ownership; unit checks and the 139-scenario local browser suite passed for that release. The derived pack and provenance report shipped in `05705b9`; manual Pages [run 35789345759](https://github.com/FromAriel/RPGameworks/actions/runs/35789345759) succeeded, and the live page, pack hash, build ID, and both rooms were verified. See [STATUS](STATUS.md). Ariel's hosted playtest remains open; the later G1.2 local candidate has its own checks and release boundary.

**Ad-hoc public playtest delivery (complete, separate from M7):** The manual-only, build-only GitHub Pages workflow deployed game commit `fb17a1c` at [the public playtest URL](https://fromariel.github.io/RPGameworks/) in [run 35685752229](https://github.com/FromAriel/RPGameworks/actions/runs/35685752229). The fetched build ID and edited texture were verified, and a bounded live Workshop-to-Gallery and narrow-viewport smoke passed. No hosted tests ran in that release; the full Foundation checks workflow is separately manual-only. This does not close M7 release hardening or imply that later `main` commits deploy automatically. See [STATUS](STATUS.md) for exact evidence and remaining acceptance boundaries.

## Approved near-term sequence

**Historical approved sequence:** W1 skin → M1.6 baseline → M2 state/inventory/saves with N1 navigation → U1 UI foundation → G1 conditional access → M3 conversations/quest. The current delivery view above governs the remaining order through M7. M1/W1, N1.1–N1.2, M2, and U1 (U1.1–U1.3) are implemented, locally verified and accepted. G1 applies the shared state spine to a visible key lock and switch gate. See [STATUS](STATUS.md) for current evidence, [U1-COMPONENTS](U1-COMPONENTS.md) for ownership/migration, [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md) for the visual contract and [WINDOW-SKIN](WINDOW-SKIN.md) for the retained art audit.

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
| M4 | Minimum battle FX contract, then fuller PixelFX catalog/lab | M1–M3 | Owned cosmetic requests, fallback and caps before M5; wider catalog/lab after tested battle needs |
| M5 | Playable turn-based battle | M2–M3 and M4 minimum | Domain battle rules, presentation independence, reliable rewards |
| M6 | Complete chapter, then expanding-region proof | M3; M5 for battle integration | M6.1 finishable chapter; later many-map, residency and elapsed-time fixtures |
| M7 | Complete-chapter release hardening | M6.1 and required M4/M5 behavior | Real-device tests, failure recovery, verified static chapter release; region-scale proof may follow |
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
- [x] **N1.3 — Dialogue choices.** Reuse the model for M3.1 visible/disabled/hidden choices, preserving stable selection and a cancel/fallback path. No second incompatible navigation system.

Keep Debug separate from player Inventory/Journal/Party/save functions. Add those entries only when their models work. New Game / Continue / Load follows M2.4/M2.5 storage; protect existing progress rather than adding a nonfunctional title screen.

**N1 evidence:** Inventory, Save/Load, Settings/Debug and M3 dialogue choices share one semantic navigation owner and the existing sampled controller. Keyboard/controller/pointer handoff, scrolling, disabled empty-slot Load, remapping, nested Settings, reconnects, held-input isolation and repeated opening are covered. The M3 browser suite covers choice navigation and cancellation, including a focused narrow controller check.

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

- [x] **G1.1 — Conditional object/access contract.** Separate activation, eligibility, denial, unlock, visual state, passability and destination; retain unconditional exits and old content. Give conditional states an explicit order/fallback and update dynamic collision at safe boundaries with a tested occupied-cell policy. Keys are retained by default, unlock markers are per lock, and the return route is deliberately authored.
- [x] **G1.2 — Existing travel integration.** Denial reports once and makes no destination fetch. Success uses existing prepare/validate/activate, generation/cancel guards, Retry/Stay and cleanup. Recheck relevant state before commitment; distinguish permanent unlocking from crossing. Future passage-only costs cannot be charged for failed/cancelled travel. Ariel's local feedback led to distinct visible locked/unlocked door frames and arrival spawns set back from both return exits. Revised local checks pass: 348 unit/content tests and 141 Chromium scenarios. Ariel accepted the corrected local gameplay packet on September 23 and authorized its source push; Pages release remains separate.
- [ ] **G1.3 — Second independent lock and usability proof.** Author a second keyed lock placement with its own persistent unlock marker and a playable route. Verify the first lock cannot open the second, then check both locked/unlocked door visuals, reverse-travel spawn spacing, switch appearance/collision, and occupied gate behavior. Keep missing/present key, already unlocked, reload, rapid input, cancelled/failed loads, 40-transfer ownership, and unconditional exits as regressions; G1.2 already covers many of those failure paths. Review other existing return exits and the switch gate for the same visual/re-entry confusion before declaring the UX proof complete.

**Defer:** toll implementation, stat checks, time schedules, arbitrary scripted transitions, hidden-entrance variants not used by content, and a new loader.

## M3 — Content-driven quest and authoring proof

**Player-visible outcome:** Complete the missing-lens quest using the existing Workshop, Gallery, Mara and plaque. Handing in the lens lights the Gallery sigil once. The Gallery key crate grants the retained brass key; its per-placement unlock marker opens the Storeroom door. A second quest asks the player to carry a ledger from that room to the Gallery archive clerk. Early key, lens, and storeroom discovery remain valid, and save/reload and returning NPCs recognize progress. Preserve existing IDs and saved key/door state.

**Engine acceptance rule:** Implement item hand-in, dialogue selection, quest transitions, one-shot rewards, and validation as reusable registered semantics. An authored NPC/quest record names the requested item, quantity, dialogue nodes, conditions, accepted choice, actions, and completion marker; no Mara-specific TypeScript/JavaScript branch decides whether the player has the item or whether the hand-in completed. Prove reuse with a second NPC requesting a different item through content changes alone. If that example exposes a missing mechanic, add one small reusable engine primitive with generic tests before authoring it; never evaluate arbitrary code from content.

This smaller proving ground precedes the old town-square/inn/cellar/path expansion. First access conditions use keys, switches and quest facts; stat gates require a separately approved exploration-stat model instead of depending on later battle systems. See [NEXT-SLICES](NEXT-SLICES.md) for the route and out-of-order discovery tests.

### Work packets

- [x] **M3.1 — Dialogue graphs.** Preserve finite messages; add stable node IDs, ordered entry rules with fallback, literal authored text, explicit ends, and choices with separate visibility/eligibility and disabled reasons. Revalidate on confirm, handle changing/no selectable choices, and reuse N1 with modal ownership. Variable text substitution remains a future content need.
- [x] **M3.2 — Quest state machine.** Implement inactive/active/completed states, legal transitions, Journal text, completion markers and quest-state conditions. Entry rules select before/during/ready/completed conversations from shared state. Preserve discovered progress on late acceptance. Validate and migrate v1 saves/imports without accepting a quest automatically or rewriting stored data before an explicit save.
- [x] **M3.3 — Useful actions.** The current encounters use one choice-triggered registered transaction for item removal and completion, with a visible lit-state consequence. Re-entry cannot repeat hand-in. Presentation cancellation does not undo a committed transaction. Asynchronous action sequences and yields remain deferred until content requires them.
- [x] **M3.4 — Dialogue/quest index and validation.** Extend the compact manifest and hashed map build with a hashed quest catalog, versioned state index, dialogue/quest reference checks and graph reachability; retain the existing lazy map loader.
- [ ] **M3.5 — Reports and authoring fixtures.** Add orphan/reference reports, missing-exit tests, blocked-spawn checks, missing-string diagnostics, and deliberately broken fixtures that prove validation catches errors.
- [x] **M3.6 — Small second-content proof.** The Gallery archive clerk asks for a ledger from a Storeroom container through the same dialogue, quest, item-removal and completion path. The different NPC and item are authored content, without per-NPC code.

### Acceptance

The main quest is completable from a fresh game through documented routes, including declining then returning and finding the lens before accepting. Hidden/disabled choices, priority/fallback, full inventory, cancellation, stale prerequisites and repeated acknowledgement are tested. Reward collection cannot be repeated through dialogue re-entry. The clue, switch, chest, lock, inventory and quest agree after travel/reload, with no circular access dependency. A save from M2 either migrates correctly or is explicitly rejected with preserved export access according to the declared compatibility policy. The second item-request encounter runs through the same interpreter, validator, and transaction path with only authored content differences.

Invalid references fail before deployment. A structurally unreachable node is flagged, while reports acknowledge that graph connectivity does not establish logical solvability.

**Defer:** Complex factions, procedural dialogue, broad crafting/economy systems, and a graphical quest editor.

## Optional post-M3 audio polish

- [ ] **A1 — Small nonessential cue set.** Exercise the planned bounded audio service with confirm/cancel/denied-action/door cues, per-category volume/mute, user-gesture start and cleanup. Missing sound is nonfatal; no essential information is sound-only. Do not preload the world's music or delay M4 for this optional packet.

## M4 — PixelFX v1

**Player-visible outcome:** The small game has distinctive impacts, healing, dust/trails, a teleport impression, a magical ambient effect, and a defeat-style animation assembled from reusable recipes.

**Sequence gate:** M4.1–M4.3 deliver only the owned request/fallback/cap behavior and one readable battle cue needed to enter M5. Expand the catalog and laboratory in M4.4–M4.6 after battle reveals concrete presentation needs. Full M4 completion is not a prerequisite to M5.

### Work packets

- [ ] **M4.1 — Presentation contract.** Add validated effect requests, scene/actor anchors, independent cosmetic seeds, cancellation handles, and missing-effect fallback.
- [ ] **M4.2 — Recipe runner.** Implement finite timelines, parallel visual tracks, parameter bounds, and recursion/expansion limits. Begin with sprites, stock emitters, tint, and simple transforms.
- [ ] **M4.3 — Resource policy and first cue.** Add global/per-recipe caps, bounded emitter ownership, small reserves, dropped-effect counters, and quality presets. Prove one battle cue remains readable with reduced effects and is fully disposable. Do not preallocate the high preset on every device.
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
- [ ] **M5.7 — Preparation and economy loop.** Add transactional currency, one shop, usable items, equip/unequip comparison, and one paid rest/recovery point. Until M6.4 adds an explicit world clock, rest restores resources without implicitly advancing game time. Keep prices and rules authored and validated; do not introduce crafting or a generalized economy engine.

### Acceptance

Headless tests resolve a battle without Phaser. Replaying the same initial state/commands/seed produces the expected domain result at different presentation speeds. Rewards are granted once. Invalid actions cannot create negative inventory or impossible targets.

Battle saves remain checkpoint-only unless a separately tested serialization design is added.

Before M5 exits, the player can prepare for a second battle through at least one purchase, item use, equipment decision, recovery service, or progression reward. Charges, inventory changes and derived statistics commit atomically and remain correct after save/load.

**Defer:** Real-time swarms, multiplayer combat, universal skill trees, hundreds of statuses, and an arbitrary formula interpreter.

## M6 — Complete chapter and expansive-world proof

**Player-visible outcome:** Finish a small coherent JRPG chapter, then move through a larger test region without rising memory use and see appropriate changes when returning after game time advances.

**Sequence gate:** M6.1 is the complete-chapter content gate and may proceed to M7 hardening and a separately approved chapter release before M6.2–M6.7. The region/clock/large-map packets are later framework-scale proof, not hidden prerequisites for a finishable chapter.

### Work packets

- [ ] **M6.1 — Small complete chapter gate.** Finish an authored beginning-to-ending chapter using exploration, the lens quest, a safe hub, preparation/economy, route or dungeon traversal, battles, a boss and a clear ending. Keep the scope small enough to test every required route and supported input flow.
- [ ] **M6.2 — Content expansion fixture.** Build a modest authored region and a generated validation/stress pack. Distinguish synthetic map counts from actual designed playable content.
- [ ] **M6.3 — On-demand residency.** Bundle by region/shared dependency, prefetch only where useful, and evict unreferenced resources under a budget. Exercise more unique maps than fit in the cache.
- [ ] **M6.4 — World clock.** Implement explicit advance policies for travel/rest and a central due-event schedule. Keep hidden-tab wall-clock progression disabled by default.
- [ ] **M6.5 — Catch-up examples.** Add one shop refresh, one NPC schedule, and one quest deadline. Resolve global consequences independently of whether a region is loaded.
- [ ] **M6.6 — Large active map fixture.** Profile a 128 × 128-tile map with configurable static and moving actors. Introduce finer culling or bounded pathfinding only where the workload demonstrates need.
- [ ] **M6.7 — Compatibility and content tour.** Run saved-game regression fixtures, asset ownership checks, a fresh-to-ending production playthrough, and a scripted tour through the wider region and its battles.

### Acceptance

**M6.1 chapter gate:** The complete chapter can be started from a fresh profile, saved and exported at named checkpoints, recovered from supported failures, and finished without debug tools. Its exact production artifact receives a human playthrough; automated coverage and a successful build are recorded separately from that playtest. M7 then validates the release artifact and tested devices.

**Later M6.2–M6.7 scale gate:** Distant content does not inflate per-frame actor processing. Resident resource counts plateau according to cache policy. Loading a region twice does not apply elapsed-time rewards or penalties twice. Scheduled NPCs do not duplicate across maps.

A global deadline triggers on game-time advancement even if its associated town is not visited. Catch-up work is bounded and cannot replay millions of missed frame ticks.

**Defer:** Seamless entire-world streaming and simulated offscreen travel unless a concrete game feature requires them.

## M7 — Release hardening

**Player-visible outcome:** A dependable small browser JRPG that can be shared and played on the specifically tested desktop/mobile targets.

Harden the exact M6.1 chapter artifact first. If region-scale features are added later, repeat the applicable M7 gates for their new release artifact. The existing public Pages playtest is an earlier delivery tier, not M7 completion.

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

**Deliver the locally accepted M3 source, then implement G1.3.** Ariel accepted the corrected plaque → Mara → lens → Gallery light → Journal and Storeroom ledger → archive clerk routes. Deliver the reviewed source to `main` without dispatching Pages. Next, author the Workshop supply room and its independent key, check the remaining door/gate visual and return-route risks, and present that local route for Ariel's play review. Complete M3.5 authoring reports before M4.

G1.2 uses the completed M2 state and travel contracts for the first conditional doorway. The M3 local candidate now uses those contracts before G1.3's broader second-lock proof. Preserve controller migration, modal ownership, lazy loading, cancellation, optimistic storage and residency tests throughout. Reuse `npm run benchmark` for comparable future measurements; preserve the exact skin and do not treat a headless baseline as phone certification.

The detailed continuation through deterministic battle, party/progression, preparation/economy, the first complete chapter, content scale and release is recorded in [JRPG-BUILDOUT](JRPG-BUILDOUT.md). It is a sequencing companion, not evidence that those later systems exist.
