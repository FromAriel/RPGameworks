# RPGameworks — Full JRPG Build-Out Strategy

**Version:** 0.1 · **Date:** September 20, 2026 · **Status:** Planning companion; implementation truth remains in [STATUS](STATUS.md).

## Purpose and authority

RPGameworks is intended to support a full, functional, complete single-player JRPG, not only a collection of isolated demonstrations. The safest route to that goal is to finish one small game chapter through every required system, then expand the content and the reusable tools around proven needs.

This document explains that long-range route in more detail than the master plan. It does not replace the existing document hierarchy:

- [PLAN](PLAN.md) owns architectural boundaries and product direction.
- [ROADMAP](ROADMAP.md) owns milestone order and acceptance gates.
- [STATUS](STATUS.md) owns current implementation and verification truth.
- [NEXT-SLICES](NEXT-SLICES.md) owns the approved near-term behavior contracts.
- This document connects those sources into a practical path from the current chest/inventory slice to a finishable JRPG.

When these documents disagree about what exists, STATUS and the repository win. When they disagree about work order, ROADMAP wins until Ariel deliberately changes it.

## The target

The framework should eventually be capable of shipping a complete browser JRPG with:

- a title/start flow, settings, save selection, save/export/import, and a clear ending;
- exploration across towns, routes, interiors, and dungeons;
- persistent chests, switches, doors, discoveries, and other world changes;
- inventories, usable items, equipment, currency, shops, and rest/recovery;
- characters, a party, progression, skills, statuses, and readable statistics;
- authored conversations, choices, quests, conditions, and consequences;
- deterministic turn-based battles with rewards, defeat, recovery, and bosses;
- music, sound, animation, PixelFX, accessible controls, and reduced-effects behavior;
- validated data, compatibility-aware saves, bounded runtime ownership, and a tested release process.

That capability is proved by shipping a small coherent game, not by creating empty abstractions for every possible RPG mechanic. A one-hour chapter whose beginning, middle, boss, ending, saving, and failure paths all work is stronger evidence than a large engine with no completable adventure.

## Build strategy

### 1. Complete vertical slices

Each packet should add one player-visible outcome and all of the domain rules, authored content, validation, failure behavior, lifecycle ownership, and tests required to trust it. New systems should first appear in ordinary gameplay rather than only in debug fixtures.

### 2. Finish the state spine first

Facts, inventory, placement state, atomic transactions, and compatible persistence form the spine used by quests, gates, shops, battles, and endings. The next work should harden that spine before adding more presentation-heavy systems.

### 3. Separate four kinds of state

| Layer | Examples | Lifetime and ownership |
| --- | --- | --- |
| Authored definitions | item definitions, map objects, dialogue nodes, enemy templates | Versioned content; immutable at runtime |
| Persistent deltas | opened chest, quest fact, item count, party state, defeated boss | Session/save domain; independent of Phaser and the DOM |
| Transient simulation | current step, pending interaction, battle turn, animation queue | Owned by the active scene or battle and safely disposable |
| Presentation | sprites, windows, particles, sound instances | Reconstructable from domain state; never authoritative for rewards or rules |

This separation is non-negotiable. A sprite frame must not be the only record that a chest was opened, and an animation callback must not be the only authority granting a battle reward.

### 4. Add vocabulary only when content exercises it

Prefer a small registered condition/action language over arbitrary scripting. Add a condition or action with its first real content consumer, validator, domain test, and failure behavior. Do not evaluate JavaScript expressions from JSON.

### 5. Earn generalized tooling

The repository remains the first editor. A browser editor becomes worthwhile after repeated authored examples reveal a stable workflow and real friction. Runtime schemas and validators stay authoritative; tools must not create a second hidden content format.

### 6. Keep proof levels distinct

Domain tests, content validation, production builds, automated browser flows, synthetic stress fixtures, physical-device playtests, deployed-site verification, and human playtesting answer different questions. Record each result separately.

## Recommended progression

The milestone identifiers below match ROADMAP. The detailed packet order inside a milestone may be adjusted when a smaller coherent slice becomes available, but the acceptance dependency should remain explicit.

| Stage | Player-visible result | System proof | Exit gate |
| --- | --- | --- | --- |
| Current acceptance | Ariel tests the Gallery chest and Inventory | Existing M2.1/M2.2 candidate behaves correctly in real use | Report any usability or hardware issue before expanding semantics |
| M2.3 | Objects visibly change according to declared facts and conditions | Bounded conditions, ordered conditional states, registered actions, atomic updates | Re-entry, repeat interaction, stationary refresh, failure, and fallback tests pass |
| M2.4–M2.5 | Progress survives reload and can be exported/imported | Versioned IndexedDB slots, compatibility rules, recovery, concurrency policy | Corrupt, stale, full-storage, interrupted-write, and multiple-tab cases are handled honestly |
| M2.6 | Repeated travel remains bounded | Asset/listener/timer ownership and distinct-map audit | Counts plateau or documented budgets fail visibly |
| G1 | A key and a switch open two different persistent gates | Shared state semantics work across rooms without special-case scene code | Consume/retain rules, reload, repeat use, and out-of-order discovery pass |
| M3 | The missing-lens quest can be discovered and completed through more than one valid route | Conditional conversations, choices, quest facts, turn-in transactions | Branches remain reachable, rewards are idempotent, saves resume every tested phase |
| M4 minimum | Important actions have readable, bounded effects | Data-driven cosmetic recipes and explicit effect lifecycle | Effects can be disabled without changing outcomes; richer spectacle need not block M5 |
| M5 core | A complete battle can be entered, won or lost, and exited safely | Pure deterministic battle kernel plus inventory/reward integration | Same state, commands, and seed reproduce results; reward and defeat are one-shot |
| M5 expansion | A small party can prepare and make meaningful tactical choices | Characters, equipment, skills, statuses, currency, shop/rest loop | Transactions are atomic and stat derivation remains deterministic |
| M6 chapter | A short authored chapter can be started, saved, completed, and replayed | All core systems cooperate in real content | Beginning-to-ending playthrough and recovery matrix pass |
| M6 scale | More content can be added without simulating or retaining everything | Region loading, cache budgets, world clock, schedules, catch-up | Resident resources and offscreen work remain bounded |
| M7 | A named build is safe to share on tested targets | Release, accessibility, lifecycle, storage, and deployment discipline | Release URL and exact revision pass the supported-device matrix |
| M8+ | Repeated authoring becomes faster without forking formats | Targeted editors/inspectors and optional experiments | Production-format round trips and explicit promote/reject decisions |

M4 should establish the minimum effects contract needed by combat and presentation. Elaborate visual recipes can continue after the functional battle loop; visual ambition should not postpone proving inventory spending, damage, defeat, rewards, and save compatibility.

## Near-term detail: the state and persistence spine

### M2.3 — Declared facts, bounded conditions, and conditional states

Start from the delivered `SessionState` transaction rather than creating a parallel quest-state store.

The first condition vocabulary should be deliberately small:

- `all`, `any`, and `not` composition with structural depth/size limits;
- declared fact equality or boolean truth;
- placement fact equality, such as a specific chest being opened;
- item quantity at least a declared non-negative amount.

The first action vocabulary should also stay small:

- set a declared fact to a validated value;
- add or remove a validated item quantity;
- claim or update a placement fact;
- group gameplay changes into one atomic transaction;
- request authored feedback after the transaction result is known.

An authored conditional object should contain ordered states with explicit conditions and a required fallback. The domain selects one state deterministically. Presentation then reconstructs the current frame, interaction text, blocking behavior, or enabled action from that selection.

Acceptance needs more than a static evaluator test:

- a state change while the player remains in the room refreshes the affected active object;
- leaving and returning reconstructs the same result;
- repeated interaction cannot duplicate a one-shot outcome;
- an invalid action leaves every involved field unchanged;
- unknown IDs, unsupported operators, excessive nesting, and missing fallbacks fail validation;
- refresh work is bounded to relevant active objects rather than rescanning the whole authored world.

### M2.4–M2.5 — Saves, export/import, and failure behavior

Persistence should serialize domain state, not Phaser objects or presentation state. A save envelope should include at minimum:

- a format/schema version;
- a game/content identity and compatibility version;
- a stable slot identity plus revision/concurrency metadata;
- player location and arrival/facing information;
- inventory, declared facts, placement deltas, party/progression state when available;
- explicit game-time data when the world clock exists;
- integrity/validation information sufficient to reject malformed imports cleanly.

The first implementation should provide a small number of named local slots, explicit save/load feedback, and a human-downloadable export with import confirmation. Autosave can follow once its checkpoint and interruption behavior are defined.

Required failure cases include malformed JSON, unsupported versions, unknown required definitions, storage denial/quota exhaustion, interrupted writes, stale revisions, simultaneous tabs, and a save whose destination map or spawn is unavailable. Never silently replace a known-good slot with an invalid candidate. Preserve old-save fixtures once a format ships.

### M2.6 — Ownership audit

Exercise more distinct maps and repeated menu/room reconstruction than the current two-room loop. Count active listeners, timers, input owners, effects, room assets, and pending asynchronous work. Cancellation and disposal should be observable in tests; a resource must have an owner and a release point.

## G1 and M3: prove shared semantics through content

### Conditional access

Use two intentionally different gates:

1. A retained-key door checks for a key but does not consume it.
2. A switch-controlled gate checks a persistent fact set elsewhere.

This proves inventory and facts both participate in the same condition system. Author and display locked/unlocked feedback, define whether collision changes immediately, and ensure the player cannot become embedded when a stationary object changes state.

### Missing-lens quest

The first quest should remain small but support meaningful ordering:

- Mara can mention the missing lens before or after the player discovers it.
- The Gallery chest remains the sole lens grant and cannot duplicate it.
- Mara recognizes possession and offers a clear turn-in choice.
- Turn-in removes the lens and grants the reward/facts atomically.
- Declining, lacking the item, repeating the conversation, reloading at each phase, and completing before formal acceptance all have authored outcomes.

This slice should prove conditional dialogue nodes, direct keyboard/controller choices, disabled-choice behavior, quest-log or status communication if needed, idempotent rewards, and reachability validation. It should not introduce a universal dialogue scripting language.

## M5: complete the core RPG loop

### Character and party model

Separate character definitions from saved character state and temporary battle state.

Definitions should cover stable identity, display data, base progression curve, permitted equipment/skills, and presentation references. Saved state should cover level/experience, current resources according to the checkpoint policy, learned skills, equipment IDs, and party order. Battle state should contain only the mutable combat snapshot plus references needed to commit an allowed result.

Start with a small party and a few meaningful statistics. Derived statistics need one documented calculation order and clamping policy. Avoid a generalized formula language until actual content cannot be represented safely by registered calculations.

### Minimum complete battle

The first complete battle needs:

- one controllable hero and one enemy;
- attack, defend or another second tactical command, one skill, and one consumable;
- turn order, valid targeting, damage/healing, defeat, and a seeded random stream;
- cancellation before commitment and rejection of impossible actions;
- readable command selection, target selection, feedback, and accelerate/skip behavior;
- victory rewards granted once and an explicit defeat/retry/checkpoint path;
- safe entry from exploration and safe return without doubled input or scene resources.

The domain resolves outcomes before presentation animates them. Animation speed, reduced effects, tab suspension, or a missing effect asset must not change the resolved battle result.

### Preparation and economy

Before calling the core loop complete, add one small end-to-end preparation cycle:

- currency stored and modified transactionally;
- one shop with buy validation, clear prices, capacity/affordability feedback, and no partial charge;
- usable exploration/battle items with explicit timing and targets;
- equipment comparison and equip/unequip with deterministic derived stats;
- an inn or equivalent recovery service with a defined cost and world-time effect;
- a simple progression reward that matters in the next battle.

Selling, crafting, rare random affixes, large skill trees, and complex economies can wait for content that genuinely needs them.

## The first small complete chapter

The chapter is the integration target, not merely a content milestone. A suitable scope is roughly 30–60 minutes for a new player, subject to actual playtest results rather than a promised duration.

Suggested authored shape:

1. A start/title flow introduces Mara and the Workshop.
2. The lens task teaches interaction, Inventory, conditional dialogue, and a one-shot chest.
3. A key or switch opens the route out of the starting area.
4. A small settlement or safe hub provides save, rest, equipment, and one shop.
5. A route contains optional exploration, a reusable resource, and at least one battle.
6. A compact dungeon combines a persistent gate, treasure, enemy encounters, and a return shortcut.
7. A boss requires using the learned preparation/battle systems.
8. Victory commits an ending fact, shows a clear ending/credits state, and permits an intentional postgame or return-to-title policy.

The chapter should include at least one optional discovery and one consequence visible after returning to an earlier location. It should remain small enough that every quest phase, battle outcome, checkpoint, and supported input method can be tested.

### Chapter completion gate

Do not call the chapter complete until:

- a fresh game can reach the ending without debug tools;
- save/load and export/import work at named checkpoints;
- every required item and quest reward is obtainable exactly once as designed;
- loss, cancellation, invalid input, failed asset loading, and storage failures have usable outcomes;
- keyboard, controller, and the supported touch path can complete their promised flows;
- reduced motion/effects and readable text scaling preserve essential information;
- repeated travel/battles do not produce unbounded listeners, timers, assets, or callbacks;
- the exact production artifact is playtested, and any hosted release is verified separately.

## Content-scale and tooling gates

Once the small chapter works, scale content deliberately:

- add a modest authored region before generating a huge map count;
- use synthetic packs for residency/stress proof, clearly labeled as synthetic;
- introduce region bundles, cache budgets, and prefetch/eviction only against measured workloads;
- add a world clock with explicit advance points rather than device wall-clock simulation;
- resolve schedules, shop refresh, and deadlines as bounded state transitions rather than missed frame replay;
- build an inspector or editor only after at least two or three real authored examples establish stable needs.

A second independent mini-game or chapter is the strongest later proof that a boundary is reusable. Extract shared packages after two real consumers agree, not before.

## Cross-cutting acceptance matrix

Every major gameplay system should answer these questions:

| Concern | Required answer |
| --- | --- |
| Ownership | Who creates, updates, cancels, and disposes it? |
| Authority | Which pure domain state determines the result? |
| Persistence | Is it transient, session-only, saved, or derived? |
| Atomicity | Which related changes must all succeed or all fail? |
| Idempotence | What prevents duplicate rewards or repeated completion? |
| Compatibility | What happens when IDs or schemas change? |
| Validation | Which invalid authored records are rejected before play? |
| Input | How do keyboard, controller, touch, and modal focus reach it? |
| Presentation failure | What remains usable if an asset, effect, or animation fails? |
| Accessibility | How is essential meaning conveyed without motion, color alone, or tiny text? |
| Performance | What is the relevant bounded workload and how is it measured? |
| Evidence | Was it unit-tested, browser-tested, physically played, built, deployed, or all of these? |

## Guardrails against overbuilding

Defer a proposed abstraction when it has no current content consumer, no independently testable behavior, or no clear ownership boundary. In particular, avoid:

- arbitrary JavaScript or formula evaluation from content;
- a universal ECS, visual scripting system, or plugin marketplace;
- dozens of empty ability/status/quest subclasses;
- a general editor before runtime formats stabilize;
- broad procedural generation presented as authored game completion;
- PixelFX or animation callbacks that own gameplay truth;
- loading or simulating the whole authored world;
- save formats that serialize scene objects or undocumented implementation details.

The desired architecture is extensible because each boundary is explicit and tested, not because every future feature has a placeholder class.

## Immediate planning queue

1. Have Ariel manually test the current chest/Inventory slice and record any real input, focus, visual, or comprehension issues.
2. Implement M2.3 with one authored conditional object that exercises the minimum registered vocabulary.
3. Add M2.4/M2.5 versioned slots plus export/import and destructive-failure coverage.
4. Complete M2.6 ownership auditing across a larger distinct-map/reconstruction fixture.
5. Prove G1 retained-key and remote-switch gates.
6. Build M3 around the existing lens as the first connected quest.
7. Establish only the minimum M4 presentation contract required to proceed into M5.
8. Complete the deterministic battle and preparation/economy loop.
9. Author and finish the small complete chapter before expanding toward a large region or broad editor suite.

The next implementation packet remains M2.3. This document widens the destination without widening that packet.
