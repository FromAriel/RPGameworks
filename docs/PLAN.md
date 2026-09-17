# RPGameworks — Master Plan

**Version:** 0.1 · **Planning date:** September 17, 2026 · **Owner:** Ariel / FromAriel

**Implementation status:** Planning only. This document defines intended behavior, not existing features, completed tests, measured performance, or a deployed game. The repository contained only a title README before this planning change.

**Product statement:** A browser-native, data-driven 2D JRPG construction framework, built a playable piece at a time, with a small dependable runtime and a composable pixel-art effects system.

**Working principle:** An expansive persistent world made from small, bounded active simulations. Keep ordinary gameplay inexpensive so visual effects have room to be expressive.

## Reading map

- This document: product boundaries, architecture, data, world lifecycle, gameplay, persistence, performance, delivery, and risks.
- [PixelFX specification](PIXELFX.md): effect vocabulary, compositing, pixel-art rules, budgets, and experiments.
- [Implementation roadmap](ROADMAP.md): ordered work packets and acceptance gates.
- [Current status and handoff](STATUS.md): what actually exists and what to do next.
- [Research and naming notes](RESEARCH.md): checked primary sources, dated dependency information, naming caveats, and search strategy.
- [Repository working rules](../AGENTS.md): instructions for future human and assistant contributors.

The roadmap owns task ordering; STATUS owns implementation truth. Change architectural decisions deliberately and record the reason rather than allowing these documents to drift silently.

## 1. What we are building

RPGameworks should make it practical for Ariel to describe a change in ordinary conversation, have an assistant inspect and edit the GitHub repository, and then play a verified browser build. A paid coding agent, desktop RPG editor, account-based game server, and proprietary project format are not requirements.

The initial game style is an old-school, single-player JRPG: tile-based exploration, small rooms and outdoor maps, NPC conversations, event triggers, persistent choices, inventory, quests, and eventually party-based combat. The platform should accommodate unusual rules later without requiring all those rules to be designed now.

The aspiration is a framework that can support a substantial game with many regions and hundreds of maps. That is an architectural direction, not a promise of finished content or a performance benchmark. The first success is a convincing, maintainable small game.

The repository acts as the initial editor. Content is ordinary files with stable IDs, schemas, and readable diffs. Browser tools can be added over the same formats once a repeated authoring problem justifies them.

### 1.1 Three independent kinds of scale

**Content scale:** How many maps, dialogue nodes, quests, assets, and definitions exist in the complete game.

**Resident scale:** How much content and how many decoded assets are currently in memory.

**Simulation scale:** How many things receive movement, behavior, collision, or event processing now.

These must not grow together automatically. Adding a distant town must not instantiate its NPCs, download all its music at startup, register thousands of live listeners, or enlarge every frame's quest scan.

Example: 500 authored maps with 30 placed objects each represent 15,000 content placements. They do not require 15,000 active runtime entities. This arithmetic illustrates the design; it does not establish a browser's maximum capacity.

### 1.2 Non-negotiable constraints

- The exported game is a static browser application with no required backend, runtime AI service, or paid API.
- The source remains ordinary TypeScript/JavaScript, JSON, HTML, CSS, and assets. TypeScript is a development aid; the browser receives JavaScript.
- Builds may use Node and npm in development or CI. Playing must not require installing them.
- No desktop visual editor is required to make or change the first game.
- Game state and rules must not depend on live Phaser objects.
- Effects are presentation. Dropping a particle must never change damage, loot, quest results, or random gameplay outcomes.
- Every major milestone leaves a playable or independently testable result.
- Performance, save integrity, and content validation are planned from the beginning, without writing a general-purpose engine before a game exists.

### 1.3 Explicitly outside the first release

No multiplayer, MMO server, continuously simulated planet, universal ECS, general visual scripting language, marketplace, arbitrary remote plugins, 3D renderer, native packaging, or mandatory cloud saves. No promise to recreate another game's proprietary effects technology. No requirement to ship a 50-hour game before the framework is useful.

A future real-time combat or survivors-like game would require separate gameplay architecture and testing. Dense visual effects do not imply that the JRPG runtime already supports thousands of combatants.

## 2. Technology direction and decision gates

| Area | Starting choice | Boundary / verification |
| --- | --- | --- |
| Language | Strict TypeScript, standard JavaScript output | Pure data and game logic remain independent of browser APIs. |
| Rendering and game platform services | Phaser 4.x, with 4.2.1 as the inspected baseline | Verify package availability, examples, and required APIs in the first implementation spike. Pin exact versions and commit the lockfile. |
| Build | Vite and npm | Check compatible Node and package versions during implementation; do not invent a lockfile. |
| Authored content | JSON with JSON Schema | Use one schema authority; validate through Ajv and check TypeScript/schema agreement. |
| Gameplay UI | Semantic HTML/CSS overlay | Dialogue, menus, settings, and accessibility should not require reading canvas pixels. |
| Map authoring | Small canonical JSON maps first | Optional Tiled JSON importer, with an explicit supported subset. |
| Saves | IndexedDB through a small storage adapter | Export/import and storage-failure handling are required. |
| Tests | Vitest for domain tests; Playwright for browser flows | Actual mobile hardware still needs separate testing. |
| Hosting | GitHub Pages as the initial candidate | Deployment depends on workflow permissions and Pages configuration; not enabled by this document. |

Phaser's official download page listed 4.2.1 when inspected. Its Phaser 4 migration material describes a different renderer and filter architecture from Phaser 3. Therefore, copying old custom pipeline examples without checking their version is specifically prohibited. Documentation pages can retain older examples even when the current release has changed. See [research sources S1–S4](RESEARCH.md).

The first spike should prove sprites, maps, pixel scaling, a bounded burst effect, input, and scene cleanup on the selected package. If a required capability fails, record the reproducible blocker and compare a narrowly scoped workaround against a different supported version. Do not switch frameworks simply because a tutorial is unfamiliar.

Use Phaser's existing facilities before replacing them. Do not install Pixi beside Phaser merely because both can draw sprites. Do not introduce a custom WebGL renderer, worker pool, or ECS without a measured reason and an isolated experiment.

## 3. Architecture and ownership

```text
Authored JSON + source assets
            |
     validate / compile
            |
   manifest + content bundles
            |
            v
       DOMAIN RUNTIME
 state / conditions / actions / clock / RPG rules
       |                         |
       | render model            | committed presentation events
       v                         v
  SCENE ADAPTER              PIXELFX + AUDIO
  maps / actors / camera     bursts / animation / cues
       |                         |
       +------------+------------+
                    v
                 PHASER
                    |
                  WebGL

HTML UI <--> input commands / domain state
Save adapter <--> versioned domain snapshots
```

### 3.1 Modules

**Domain:** Plain state, IDs, commands, conditions, actions, quest state machines, inventory operations, battle rules, and clock policies. It can run in Node tests without a canvas, DOM, audio device, or Phaser import.

**Content:** Schemas, loaders, manifest resolution, references, localized strings, and compiled indexes. It distinguishes immutable authored definitions from mutable game state.

**Platform:** Browser input, storage, asset loading, sound, and lifecycle adapters. Browser failures become explicit results rather than unexplained domain mutations.

**Presentation:** Map rendering, sprite synchronization, camera, UI, and PixelFX. It consumes domain state and committed events. It cannot award money or advance a quest by ending an animation.

**Tools:** Validators, reports, fixture builders, importers, and later browser laboratories. They use the same schema and rule definitions as the game.

### 3.2 Dependency rules

Domain may depend on shared types and pure utilities. It may not depend on presentation, Phaser, the DOM, IndexedDB, fetch, or wall-clock time directly. Adapters implement narrow interfaces for those concerns.

Prefer explicit construction and small interfaces over an all-purpose service locator. Avoid a universal event bus that obscures ownership and makes every module listen to everything. Use bounded, typed queues with scoped subscriptions where events are useful.

Commands propose a change; state operations validate and apply it; committed events describe what happened; presentation responds. This separation makes tests and replayable bug reports possible.

### 3.3 Proposed project layout

This is a target layout, not a claim that these folders exist now. Start with only the files needed for the current milestone.

```text
RPGameworks/
  README.md
  AGENTS.md
  docs/
    PLAN.md
    PIXELFX.md
    ROADMAP.md
    STATUS.md
    RESEARCH.md
    decisions/              # add records when decisions change
  src/
    app/                    # composition root, startup, browser lifecycle
    domain/
      state/
      commands/
      conditions/
      actions/
      clock/
      rpg/
    content/                # manifests, loaders, normalizers
    platform/
      assets/
      input/
      persistence/
      audio/
    presentation/
      phaser/
      ui/
      fx/
  content/
    games/demo/
      game.json
      regions/
      maps/
      npcs/
      dialogue/
      quests/
      items/
      encounters/
      rules/
      effects/
      locales/
  assets/source/            # originals and provenance
  schemas/
  tools/
  tests/
    unit/
    content/
    integration/
    browser/
    fixtures/
  public/generated/        # build products, not a second authoring source
  .github/workflows/
  index.html
  package.json
  package-lock.json
```

Begin with one application, not a multi-package publishing workspace. Keep boundaries clear enough to extract a library later, after a second game demonstrates the need.

## 4. Content model and authoring contract

### 4.1 Identity

Every referenceable definition has a stable, namespaced ID, a kind, and a schema version. Use lowercase, case-consistent IDs such as `demo:map.westhaven.inn` and `demo:npc.innkeeper`. File paths are locations, not identities.

A placed object has its own stable placement ID. Two chests using the same template must not share their opened state. Local dialogue node IDs are scoped by dialogue ID; exported references resolve explicitly.

Display names are never keys. Renaming the inn in prose must not break exits or saves. ID changes need an alias or migration policy, not an undocumented search-and-replace.

### 4.2 Core definitions

The first schema family covers game configuration, map, spawn point, exit, entity template, entity placement, interaction, dialogue graph, declared variable, item, quest, and effect reference. Battle skills, encounters, status effects, shops, schedules, and material masks arrive with their milestones.

A game manifest specifies its game ID, content version, start map/spawn, ruleset, supported locales, initial state, required bundles, and optional modules. The demo game is a replaceable content pack, not hardcoded into engine classes.

Use explicit units: logical pixels, tiles, milliseconds, simulation ticks, and world minutes must not be interchangeable unnamed numbers. Fields should make units clear. Define coordinate origin, axis direction, facing values, and angle convention once.

### 4.3 Schemas and validation

JSON Schema is the machine-readable contract. Choose a supported dialect during the first schema task and configure Ajv consistently. Generate TypeScript declarations where practical, or test them against schema fixtures; do not maintain two unrelated definitions of every record.

Reject unknown action kinds, misspelled fields, unknown references, invalid numbers, duplicate IDs, invalid enum values, negative durations, unbounded counts, and paths outside allowed namespaces. Impose document size and nesting limits on imported data.

A validator error must identify file, record ID, field path, offending value, and a useful explanation. Warnings require a reason when suppressed. A generic `invalid JSON` report is not adequate for a large content archive.

Do not evaluate JavaScript expressions from JSON. Conditions and formulas use registered operations and a deliberately small typed expression model. Trusted source-code extensions are reviewed and bundled with the application, not fetched and executed from arbitrary content URLs.

### 4.4 Human-readable source versus efficient runtime

Author small, purpose-specific files. Avoid one giant world JSON and avoid generating a new file for every individual sentence. Split by region, map, dialogue, or reusable definition according to real editing needs.

The build may normalize records, compact tile arrays, and emit regional bundles. Those outputs must be reproducible and must not become a competing source of truth. Stable formatting and deterministic ordering make assistant changes reviewable.

The startup manifest should remain compact. Load detailed map records, long conversations, and optional subsystems on demand. Do not accidentally defeat lazy loading by eagerly importing every content file into the JavaScript bundle.

### 4.5 Map format and Tiled interoperability

The first map format is a finite orthogonal tile grid with tile layers, solid-cell collision, named spawns, exits, placements, and rectangular trigger regions. Choose one tile size per game; the demo starts with 16-pixel tiles. Sprite artwork may extend beyond one tile.

Small maps must be editable directly in text. A compact row-oriented source representation is acceptable if its serializer is stable and the validation errors identify coordinates.

Tiled is optional, not a workflow requirement. Its documented JSON format provides a useful interchange source, but importing it requires a defined adapter. Initial support should be finite orthogonal maps, selected tile/object layers, typed properties, and known tileset references. Validate external tilesets, tile flip flags, object coordinates, and collision conversion; reject unsupported constructs rather than silently discarding them. Infinite maps, arbitrary plugins, and full round-trip editing are deferred. See [S10](RESEARCH.md).

For each imported map, declare whether Tiled or canonical RPGameworks JSON owns the source. Never invite editing both and then overwrite one without warning.

### 4.6 Localization and provenance

Use stable string IDs and locale tables for player-facing prose once dialogue lands. English-only content is acceptable initially, but IDs must not require English display text. Support Unicode, variable substitution with escaping, text wrapping, and missing-string diagnostics.

Each external asset needs source, author, license/permission, attribution requirements, and modification notes. Placeholder art must be original or clearly licensed. Do not extract assets from commercial RPGs or Vampire Survivors merely because they illustrate the intended style.

The project license is an owner decision. This planning commit must not silently license future code or artwork. Track dependency licenses separately from the eventual RPGameworks license.

## 5. State and simulation model

### 5.1 Four distinct representations

**Definitions:** Immutable templates and authored content.

**Persistent state:** Party, inventory, quests, variables, clock, region deltas, placed-object deltas, schedule records, and gameplay random-generator state.

**Transient simulation:** Current movement, active interactions, bounded event execution, and optional battle runtime.

**Presentation objects:** Sprites, particles, DOM nodes, audio voices, textures, cameras, and visual tweens.

A save contains persistent state and explicitly supported checkpoints. It does not serialize Phaser objects, DOM elements, promises, texture handles, audio buffers, or every spark currently visible.

### 5.2 Global, regional, and local scopes

Global state includes the party, shared inventory, story facts, global clock, and world-level scheduled changes. Region state includes faction changes, shop deltas, local story facts, and last-resolved world time. Placement state includes a specific chest's contents, an NPC's persistent change, or a switch's position.

Store changes relative to immutable defaults, not complete duplicates of every unloaded map. Define policies for spawned and removed objects so an object does not reappear accidentally when a region reloads.

Declared variables have types, defaults, ownership, and persistence scope. A reference to an undeclared flag is an error, not an implicit new Boolean.

### 5.3 Randomness and reproducibility

Use a seeded, versioned gameplay random source. Separate streams by system where doing so prevents unrelated actions from perturbing one another. PixelFX has an independent cosmetic stream.

The same input trace, starting state, ruleset, content version, and seed should produce the same tested domain outcomes. This is not a claim of bit-identical rendering across GPUs or deterministic execution of arbitrary third-party physics.

Use explicit rounding for money, item counts, damage, and other discrete values. Movement and rendering may use fractional values. An integer-only arithmetic engine is not a goal of this project.

### 5.4 Condition/action vocabulary

Conditions initially cover Boolean composition, declared variables, comparisons, inventory membership/count, quest state, and entity availability. Add party statistics, world time windows, and faction relations only when exercised by content.

Actions initially cover setting/incrementing declared state, inventory transactions, dialogue, movement locking, map transitions, and presentation requests. Later actions add battle, shops, schedules, party changes, and controlled spawn/despawn operations.

Do not create a Turing-complete visual programming language by accident. Use explicit sequences, branches, bounded iteration where truly necessary, and registered extensions for genuinely new rules.

### 5.5 Execution semantics

An interaction sequence has an owner, cancellation policy, execution budget, and clearly defined yield points. Only one modal conversation controls player interaction at a time. Exiting a map cancels scene-owned work unless the sequence explicitly transfers ownership.

A logical transaction validates all domain operations before applying them. Spending money and receiving an item either both occur or neither occurs. Publish presentation events only after that transaction commits.

Visual work is not part of the transaction's rollback guarantee. If an effect fails to load, the completed purchase remains correct and the failure is reported separately.

One-shot rewards carry stable completion markers. Re-entering a trigger, reloading a save, or retrying a dialogue callback cannot duplicate them. Define re-entry behavior for each trigger: enter-only, interact, repeatable with cooldown, or once per persistent instance.

Asynchronous sequences need explicit continuation points. A map transition is terminal by default; cross-map continuation is a later named feature, not a callback retaining a destroyed scene. Save only at safe boundaries until serializable script checkpoints are deliberately implemented.

### 5.6 Quest model

Quests use named states and explicit transitions rather than magic integers scattered across dialogue files. Journal text derives from quest state, not a separate conflicting flag set.

Each transition declares its prerequisites, domain changes, completion behavior, and optional presentation. Validators check referenced items, actors, maps, and states. Scenario tests verify important reachable paths; static graph traversal alone cannot prove that every combination of conditions is solvable.

## 6. World loading and scene lifecycle

### 6.1 Primary chunk boundary

A map or room is the initial loading and simulation boundary. One reusable exploration scene class loads map data; do not create a new source-code class for every tavern, cellar, or city block.

Normally there is one active gameplay map, persistent lightweight application/UI services, and possibly a transition overlay. A battle may temporarily replace or suspend exploration under an explicit ownership policy. Cached or prefetched maps are not simulated maps.

### 6.2 Transition protocol

1. Validate the target map and spawn reference, acquire a transition token, and prevent duplicate input.
2. Reach a safe domain boundary and capture the outgoing checkpoint/deltas.
3. Load and validate destination content and required assets; show progress or an intentionally short transition cover.
4. Apply required world-time reconciliation before instantiating destination actors.
5. Create the destination model and presentation from definitions plus persistent deltas.
6. Atomically establish the destination as active, position the party, and release input when ready.
7. Dispose outgoing scene-owned listeners, timers, effects, colliders, and handles; release its asset leases according to cache policy.
8. Request an autosave checkpoint without making gameplay depend on successful disk storage.

Before activation, failure should leave a valid old scene or recoverable checkpoint. Do not destroy the only usable state first and then discover a missing asset. Under memory pressure, use a loading screen and a saved outgoing checkpoint rather than retaining two full scenes indefinitely.

Every request carries a generation/token so a slow older request cannot overwrite a later successful transition. Cancellation and retries must be idempotent. Test rapid door presses, failed requests, and exiting while loading.

### 6.3 Residency is explicit

Phaser scenes and its shared managers are not the same lifetime. The framework's own documentation distinguishes scene-local resources from global caches, textures, animation, and sound services. Therefore, stopping a scene is not sufficient evidence that all its resources have been released. See [S3–S4](RESEARCH.md).

Use an asset ownership layer with acquired leases/reference counts and a bounded cache. Shared UI, party art, and frequently reused effects remain resident; optional region art and audio can be evicted. Evict only assets with no live users. Cleanup logic must handle errors and cancellation as well as successful exits.

Cache budgets track estimates for decoded textures, audio, and other retained resources, not just compressed download sizes. Record logical ownership and live counts even where the browser cannot report exact GPU memory.

### 6.4 Within-map behavior

Static interactables do not need per-frame behavior updates. Collision uses a precomputed grid; nearby interactive candidates come from a simple spatial bucket/index rather than a complete world scan.

For a modest room, direct iteration over a small active list is acceptable. For larger maps, apply view culling and staggered behavior decisions. Do not hide expensive unnecessary work behind the argument that a browser can probably tolerate it.

Being off-camera does not automatically mean being irrelevant. An off-camera moving hazard, chase actor, or time-critical event may still need simulation. Each actor/system declares its update policy rather than inheriting a blanket visibility rule.

Do not build a general streaming-world partitioner before map boundaries prove insufficient.

## 7. Clock, schedules, and the unloaded world

Game time is authoritative and separate from rendering time and device wall time. Specify how walking, resting, travel, dialogue, battles, pauses, and menus advance it. Default: hidden tabs pause active gameplay; no wall-clock offline progression.

An unloaded town can change without frame-by-frame simulation. On re-entry, derive its current state from the saved clock, due domain events, and elapsed-time rules. Examples include shop refresh periods, construction progress, and an NPC's current schedule location.

Consequences that matter outside a town cannot wait for that town to load. Global quest deadlines and world-level events belong to a central lightweight schedule, with deterministic ordering and completion markers. Regional presentation can be deferred, but authoritative consequences are resolved when game time advances.

Catch-up uses bounded arithmetic or due-event processing, not millions of missed ticks. Coalesce repeatable changes where their rules permit it. Preserve order where events depend on one another. Each catch-up operation records what interval/event it already resolved so loading twice does not apply it twice.

An NPC schedule describes where the NPC should be at a relevant time. Unloaded travel need not simulate every footstep. A globally identified scheduled NPC must not exist simultaneously in two maps after a transition.

## 8. Exploration and RPG systems

### 8.1 Movement and interaction

Begin with four-direction, grid-aware movement on 16-pixel tiles, responsive keyboard input, solid-cell collision, facing-based interaction, and named spawns. Keep movement authority separate from sprite animation. Decide explicitly whether the first implementation uses tile steps with interpolation or continuous motion against a grid; the roadmap's first slice selects tile steps for simplicity.

Use one master timing driver. A fixed movement update can be interpolated for rendering, with bounded catch-up after stalls. Do not create independent requestAnimationFrame loops per system. Clamp resume deltas and test different display refresh rates.

### 8.2 Inventory, items, and economy

Items have stable IDs, stack rules, use behavior, descriptions, and optional equipment metadata. All additions/removals pass through validated transactions. Define full-inventory and insufficient-funds behavior before adding shops.

Money and quantities are bounded nonnegative integers. Unique items have instance identity when needed; ordinary stackables do not require a heavyweight entity each. Inventory sorting is presentation and cannot change identity.

### 8.3 Party, statistics, and equipment

Use a compact ruleset defining base statistics, derived statistics, equipment slots, and modifiers. Derived values should be computed from authoritative inputs with explicit invalidation, not manually patched by every menu.

Start with a few characters and equipment slots. Do not implement a universal class-system designer, complex passive graph, or arbitrary formula language before one battle works.

### 8.4 Battle

The initial target is turn-based combat with explicit phases: setup, command selection, action resolution, end-of-turn effects, victory/defeat, and reward/return. Begin with one hero, one enemy, attack, a consumable, and victory; expand party and skill systems afterward.

Domain resolution produces a sequence of presentation requests. Damage and random rolls are resolved by battle rules, not by particle collisions or animation callbacks. Presentation can be accelerated, reduced, or skipped without changing the result.

Define target validity, simultaneous defeat, interrupted actions, status duration, reward idempotence, escape, and game-over behavior through tests. Combat is a module; exploration and dialogue should still function when it is not loaded.

### 8.5 Extension points

Provide registered condition, action, formula, encounter, and presentation handlers only as needed. Handlers declare supported schema versions and dependencies. A custom card-combat module or lifepath generator should integrate through those interfaces rather than editing unrelated map and save code.

A plugin system must not become a promise of secure execution of arbitrary uploaded JavaScript. Untrusted executable mods require a separate security design and are not part of this plan.

## 9. Save architecture and compatibility

Use versioned domain snapshots in IndexedDB, behind a small adapter. IndexedDB is transaction-oriented browser storage; storage limits and eviction behavior are browser-dependent. A completed database transaction does not mean the user has an indestructible backup. See [S7–S8](RESEARCH.md).

### 9.1 Save envelope

Record game ID, save schema version, content/ruleset version, slot ID, revision, creation/update metadata, current map/spawn or safe checkpoint, domain snapshot, and gameplay random state. Keep optional diagnostic metadata separate and bounded.

The storage namespace includes the game ID and build channel. Development saves must not silently overwrite release saves. Project paths under the same web origin are not an isolation boundary; choose names carefully and do not promise security isolation from another same-origin application.

### 9.2 Reliability policy

Use transactional writes and preserve the prior valid revision or rotating backup. Autosave at safe checkpoints rather than every frame. Debounce dirty-state writes, but surface success and failure clearly.

Support human-controlled export/import early. Validate imported size, schema, IDs, and compatibility before changing the active game. Never execute imported content. An import failure leaves the current save intact.

Test quota errors, unavailable storage, corrupt snapshots, interrupted writes, unsupported future versions, and multiple open tabs. Use a single-writer policy or optimistic revision checks; stale tabs must not silently overwrite newer progress.

### 9.3 Migration policy

Schema upgrades are explicit ordered transformations with fixture tests. Transform into a new validated snapshot before replacing the previous one. Missing maps, renamed IDs, removed items, and changed quest states each need a declared compatibility policy.

Do not silently reset an incompatible save and call it repaired. Provide a useful error and preserve export access. A safe fallback spawn is allowed only with a documented, tested recovery policy that preserves the remaining state.

Initially, saving during a conversation, transition, or battle is disabled or deferred to a safe checkpoint. Mid-battle and mid-script saves are separate features with serialized continuation requirements.

## 10. Rendering, PixelFX, UI, and audio

[PIXELFX.md](PIXELFX.md) is the detailed specification. The essential boundary is that world state emits presentation requests and PixelFX realizes them within a budget. Effects cannot hold domain state hostage or consume gameplay random numbers.

Start with Phaser sprites, frame animations, and bounded emitters. Add an effect catalog, pooling policy, composable timelines, and an effects laboratory before exploring custom GPU paths. GPU layers and shader filters are optional experiments behind the same interface, not prerequisites for walking around a room.

### 10.1 Pixel-art policy

The demo's proposed logical world viewport is 480 × 270. This is a starting art/layout choice, not a permanent engine constraint. Integer presentation scales include 960 × 540 at 2× and 1920 × 1080 at 4×. A separate game may choose 320 × 180.

Use nearest-neighbor sampling, consistent atlas padding, and explicit camera/pixel alignment. Keep fractional movement internally and snap the final camera-relative world presentation where the selected art mode requires it. Blindly rounding world coordinates while moving a fractional camera still permits shimmer.

A responsive fallback is needed when the viewport cannot fit a clean integer scale. Letterboxing, a smaller logical layout, and a documented non-integer fit mode are choices to test; arbitrary screens cannot all provide perfect integer enlargement.

Do not automatically render all pixel art and effects at devicePixelRatio-scaled 4K. Logical scene resolution and UI resolution can differ. Large glowing quads and repeated full-screen passes can remain expensive even when their source artwork is tiny.

### 10.2 UI and accessibility

Use a semantic DOM overlay for text-heavy dialogue, inventory, settings, and menus. Focus and input ownership must be explicit: typing or clicking in a menu cannot move the character underneath it.

Provide keyboard navigation, readable text scaling, remappable controls where practical, touch-friendly targets, and separate music/effects volumes. Make screen shake, flashes, motion density, and damage-number clutter adjustable. Respect reduced-motion preferences while allowing an explicit user choice.

Do not make important information depend only on color, sound, or visual particles. Include text/shape alternatives. Supply a textual scene/interaction summary as an accessibility and debugging aid; do not claim full screen-reader gameplay support without testing it.

### 10.3 Audio

Use a small audio service with explicit voice ownership, per-category limits, and lifecycle cleanup. Unlock/start audio through user interaction when required by the browser. Looping sounds must stop or transfer ownership intentionally on scene changes.

Music is not required before the first interactive frame. Load regional tracks on demand, avoid retaining every decoded track, and make sound failure nonfatal to gameplay. Repeated effects should use voice caps or coalescing rather than an unlimited pile of overlapping sounds.

## 11. Performance engineering

### 11.1 Policy

Optimize architecture early; optimize hot implementations after measurement. Entity count alone is not a performance prediction. Cost depends on behavior, allocation, draw state, texture residency, alpha overdraw, and target hardware.

Use a precomputed collision grid, event-driven quest updates, scoped listeners, cached indexes, bounded queues, bounded caches, and selective pooling from the beginning. Do not allocate per-frame closure trees for ordinary stationary NPCs.

Pool high-churn particles and transient presentation objects where measurement or known lifetime patterns justify it. Reusing Phaser's own particle machinery is preferable to layering a redundant pool over it. Ordinary low-frequency objects do not all need manual pooling.

MDN's WebGL guidance supports batching, avoiding synchronous GPU readbacks, and budgeting graphics resources. Our exact numerical budgets below are project proposals, not numbers supplied by that source or guaranteed browser capacities. See [S6](RESEARCH.md).

### 11.2 Initial budgets to validate

| Measurement | Proposed starting target | Interpretation |
| --- | --- | --- |
| Default presentation | 60 FPS target; 16.67 ms frame interval | A baseline goal, not a promise for every phone. Optional 30 FPS quality mode. |
| Steady-state main-thread game work | p95 at or below 8 ms in the baseline scene | Includes our simulation and render submission; leaves room for browser work. GPU work is measured separately, not simply added to CPU time. |
| Unloaded-map per-frame simulation | Zero map/entity updates | Central scheduled world events are allowed when due. |
| Initial required transfer | At most 4 MiB for the first playable slice | Excludes deferred regional content/music; report actual compressed transfer. |
| Cold first interaction | Target at or below 7 s in a recorded 10 Mbps / 100 ms RTT test | Device/browser/build and throttling method must be stated. Revisit after measurement. |
| Warm map transition | Target p95 below 300 ms excluding an intentional fade | Define start/end instrumentation; never hide loading stalls by changing the metric. |
| Mobile-profile managed graphics estimate | Soft budget 64 MiB; investigate above 96 MiB | This is an ownership estimate, not measured total process/GPU memory. |
| Long-session residency | Plateau under bounded-cache cycling | No monotonic increase in live scene listeners, objects, effects, or asset leases. |

Select and record at least one integrated-graphics desktop/laptop, one actual Android phone, and one actual iOS device before making a broad support claim. A powerful developer machine and emulated touch input are insufficient evidence for mobile performance.

Establish baselines before enforcing noisy timing gates. Correctness and explicit resource caps can be hard CI gates early; absolute GPU/frame-time comparisons need controlled hardware. Store results with commit, browser, device, viewport, quality preset, scene, duration, and measurement method.

### 11.3 Update rates

Movement and collision use the chosen fixed-step policy with bounded catch-up. Rendering follows one engine driver. NPC decisions are staggered and usually much less frequent than movement. Quest rules react to state changes; shops do not reconsider inventory every frame.

Pause or reduce work when hidden. The Page Visibility API provides visibility information, and browsers can throttle background animation/timers; do not assume a hidden tab keeps a reliable 60 Hz clock. See [S9](RESEARCH.md).

### 11.4 Batching and memory

Prefer several reusable/shared and region-scoped atlases over one enormous all-game atlas. An atlas only helps when compatible draw state and ordering permit batching. Preserve transparent compositing order; do not reorder effects incorrectly just to reduce draw calls.

Texture-memory estimates must use decoded dimensions. For example, 2048 × 2048 × 4 bytes is 16 MiB for one RGBA8 base level, before extra copies, mipmaps, masks, or render targets. This is arithmetic, not the compressed PNG size or an exact report of device memory use.

Keep shader variants and render targets bounded. Precompute optional sprite fragment/mask data during asset processing or at controlled load points. Do not read pixels back from the GPU every frame to make a dissolve.

### 11.5 Benchmark scenes

Maintain a tiny room baseline; a 128 × 128-tile city fixture with configurable actor counts; an effects laboratory with burst/steady/overdraw cases; a battle fixture; and a residency tour through more unique scenes than the cache can retain.

Run repeated A/B transitions for listener correctness, and a many-distinct-map tour for eviction correctness. Both are necessary: a leak-free two-room loop can still conceal an unbounded world cache.

A useful stress report includes frame-time percentiles, peak/live particles, emitters, active actors, path requests, draw submissions where available, managed asset bytes, scene-load durations, and dropped-effect counters. Label unavailable browser metrics rather than fabricating them.

## 12. Verification and observability

### 12.1 Test layers

**Unit:** Conditions, transactions, clocks, random sources, inventory, quest transitions, formulas, and migration transforms.

**Content:** IDs, schemas, references, exits/spawns, blocked spawns, asset existence, string references, quest/dialogue graphs, effect limits, and package ownership.

**Scenario:** A scripted player can complete the demo through several choices, revisit rooms, reload a save, and receive each reward exactly once. Important failure paths are first-class fixtures.

**Browser:** Boot, input, movement, dialogue focus, transition, save/reload, touch controls, scaling, storage failure, visibility changes, and visible error reporting. Use Chromium, Firefox, and WebKit as automated coverage; real-device checks remain separate.

**Performance/lifecycle:** Scene cycling, bounded resource counts, FX saturation, cold/warm load, and long-session behavior. Compare equivalent workloads, not unrelated screenshots.

### 12.2 Developer diagnostics

A development overlay reports build SHA, game/content version, current map, coordinates, active input context, recent commands, resource counts, frame timings, and current quality tier. A bounded event trace helps reproduce a bug without an ever-growing log.

A reproducibility export can include seed, sanitized domain snapshot, recent commands, quality settings, and versions. It must avoid secrets and unnecessary personal data. No telemetry, analytics account, or remote error reporting is required by default.

Content reports can show orphan definitions and graph reachability, but must distinguish structural checks from proof of logical solvability. A graph edge may exist while its condition is impossible.

### 12.3 Planned command contract

These are intended commands, not commands available in the planning-only repository:

- `npm run dev`: local development.
- `npm run typecheck`, `npm run lint`: static source checks.
- `npm run validate`: schema and cross-reference validation.
- `npm test`: domain and integration tests.
- `npm run test:e2e`: browser smoke/scenario tests.
- `npm run build`, `npm run preview`: production build and local inspection.
- `npm run world-report`: content/dependency/graph inventory.
- `npm run benchmark`: named reproducible workloads and report artifacts.

Add commands when their implementations exist. Do not mark a command passing because the script is a placeholder.

## 13. Chat-to-GitHub delivery workflow

The intended loop is: describe a change, inspect the current branch and status, implement a bounded patch, validate, commit, build/deploy through CI, inspect the result, and playtest. The assistant must report separately what was changed, what was actually executed, and what remains unverified.

Connected GitHub write access can change files without providing a remote execution environment. A successful commit is not evidence of a successful build. CI run IDs, test output, and a fetched deployment are evidence; a guessed Pages URL is not.

Work packets specify an observable player outcome, affected files/contracts, acceptance criteria, and rollback behavior. Prefer content changes over engine changes when the current vocabulary expresses the request cleanly. Do not distort content into an unreadable workaround just to avoid a small legitimate engine extension.

Read the latest branch before editing. Use non-forced, parent-aware updates and reconcile concurrent changes. Do not force-push or replace unrelated user work. Direct commits are appropriate when requested and allowed; protected branches require a documented alternate path rather than bypassing protection.

Update STATUS after each meaningful implementation packet with completed behavior, tests run, failures, pending work, and the next concrete task. Keep the main plan stable enough to serve as continuity across conversations.

## 14. Build and deployment

The production output must be static files. Use GitHub Actions to install locked dependencies, validate content, run tests, build, and only then deploy the verified output when permissions and hosting configuration are available. Keep validation and deployment privileges separate; never expose write secrets to untrusted pull-request code.

For a project Pages path, Vite needs the repository base path `/RPGameworks/`; a custom domain/root deployment has different base configuration. Content fetches, fonts, audio, and dynamically loaded chunks must respect that base. Prefer a hash-based development router or explicit static entry pages over assuming server rewrite support. See [S5 and S11](RESEARCH.md).

Expose the build/content version in a diagnostic screen so a report identifies the actual deployed revision. Cache-busted bundle names and a versioned manifest must prevent incompatible old code/new content mixtures.

Service-worker offline support is deferred until ordinary updates and saves are dependable. When introduced, use a bounded versioned cache and deliberate activation flow; do not force an application update mid-session or cache the entire future world by default.

If the connector cannot configure Pages, modify workflow files, or read a deployment, report the exact access limitation. Do not say the game is live until a real deployment has been checked.

## 15. Growth without engine-first stagnation

Build one vertical slice and then expand it through new content. The framework's quality is demonstrated when a second room, second quest, and second effect can be added without editing unrelated runtime code.

The proposed demo is a small town square, an inn, a cellar, and an outdoor path. A conversation offers a clue; a key or alternate condition opens a route; a chest persists; one quest completes; a magic effect makes the world feel alive. Combat is added only after exploration and persistence work.

This is a test setting, not a commitment to the final game's narrative or art direction. Names and story content can be replaced without changing the engine.

Browser authoring tools should start with the FX laboratory and diagnostics because they shorten immediate feedback loops. A full map editor, dialogue graph editor, and quest editor are later investments, each justified by measured authoring friction.

## 16. Risk register and response

| Risk | Consequence | Mitigation / decision trigger |
| --- | --- | --- |
| Scope expands faster than playable content | Another unfinished engine | Each milestone ends in a visible result; defer features without a current scene/test. |
| Hidden resource retention | Slowdown or crashes after visiting many maps | Explicit ownership, bounded caches, distinct-map cycling tests. |
| JSON becomes an undocumented programming language | Fragile content and difficult debugging | Small typed vocabulary, schema validation, explicit extension handlers. |
| Save/content drift | Lost progress or broken quests | Versioned IDs, migrations, old-save fixtures, preserved originals. |
| Effects obscure gameplay or saturate mobile GPUs | Unreadable combat, heat, frame spikes | Quality tiers, importance priorities, overdraw tests, reduced-motion settings. |
| Framework/API mismatch | Repeated integration breakage | Exact dependency pins and a small renderer/FX compatibility spike. |
| False confidence from a strong desktop | Poor phone experience | Early real-device testing and documented fallback presets. |
| Assistant edits rely on stale context | Unrelated regressions or overwritten work | Read current head, bounded patches, STATUS, validation, non-forced writes. |
| Deployment permissions are missing | Chat edits do not yield a playable URL | Verify hosting separately and report actual capability limits. |
| Unclear asset/project licensing | Release blocked or assets replaced late | Provenance records and an explicit owner licensing decision before distribution claims. |
| Name availability or SEO assumptions are wrong | Branding rework or disappointing discovery | Treat uniqueness as unverified; use crawlable documentation and assess actual search performance. |

Technical feasibility is strong enough to justify the first implementation slice. A numerical success percentage would be a subjective guess until prototypes establish the target-device and workflow evidence. The plan replaces the earlier conversational confidence estimates with measurable gates rather than presenting them as calibrated probabilities.

## 17. Definition of a credible first release

A new visitor can open a verified static build, start the demo, move, interact, change maps, complete a small quest, see several coherent pixel effects, save/export progress, reload, and continue without duplicate rewards or broken state. Keyboard and tested touch flows work. Reduced effects preserve essential information. Repeated travel does not accumulate unbounded live resources.

A contributor can add another small map, NPC, dialogue, item, and effect through documented data definitions and receive useful validation failures for mistakes. A future assistant can identify the current build state and next task without reconstructing the project from an old chat.

That is the first platform. Large worlds, elaborate battle systems, sophisticated pixel transformations, and visual editors build on that evidence rather than delaying it.
