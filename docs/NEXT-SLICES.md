# Next slices — base skin and stateful exploration

**Decision date:** September 18, 2026. **Status:** approved planning, not implementation.

Ariel approved her quieter edited windowskin as the base skin and requested these next-step refinements be recorded. The runtime inspected for this update is `dd2add47eb52b84d626ff40d057b78016781243e`: two rooms, finite messages, unconditional door travel, controller exploration, and the player-first shell. The skin compositor, persistent world state, conditional access, branching dialogue, and controller-only menus below are not implemented by this documentation change.

[ROADMAP](ROADMAP.md) owns packet order; [PLAN](PLAN.md) owns architectural boundaries; [STATUS](STATUS.md) owns implementation truth. This document is the approved supplement to the stable master plan and supplies the agreed feature contracts. It refines its conditional-state/UI/first-content provisions; ROADMAP and STATUS link here so the new sequence is not inferred from the older provisional examples. [Decision 0001](decisions/0001-base-skin-and-stateful-exploration.md) records the changes from the earlier sequence. Field names here describe semantics; exact JSON schemas must be designed and validated in their implementation packets, not assumed to exist already.

## 1. Delivery order and dependencies

| Order | Packet | Observable result |
| --- | --- | --- |
| 1 | **W1 — Base skin integration** | Existing Mara dialogue and Settings use Ariel's sheet, including title brackets and a real divider. |
| 2 | **M1.6 — Closeout and baseline** | The current playable slice has a recorded, reproducible frame/resource workload; no new claim of phone performance. |
| 3 | **M2.1–M2.3**, with **N1** navigation delivered alongside the first inventory menu | Open a chest, receive an item once, leave, and return to the opened chest. This is session state until storage lands. |
| 4 | **M2.4–M2.6** | Save/export/reload preserves state; failed writes/imports preserve usable progress; transition/residency ownership is audited. |
| 5 | **G1 — Conditional access integration** | A persistent key lock and a switch-controlled gate use the same facts, inventory transactions, and existing travel path. |
| 6 | **M3**, reusing **N1** for choices | Complete the missing-lens micro-quest, then add a second content-driven example. |
| Later | **M4 → M5 → M6** | Recipe-driven PixelFX/laboratory, turn-based battle, then expanded-region/clock proof in their existing order. |

These are stages, not a request for one enormous commit. W1 is a bounded insertion before the outstanding M1.6 task, not an excuse to create a theme editor or skip the baseline. N1's core must be complete before the inventory UI is called controller-usable; dialogue choice integration is accepted with M3.1. Audio polish is optional after the quest slice. No new runtime feature is marked complete by approving this plan.

## 2. W1 — Use Ariel's revised skin, not another redesign

### Selected source and import boundary

The selected source is Ariel's 192 × 192 RGBA PNG uploaded with “i made some edits to make some of the details a little less aggressive,” not the earlier generated Midnight Silver sample. Record it as the base artwork, preserving its pixels and partial transparency. Keep the cool silver, charcoal/midnight, restrained-accent direction; do not substitute a brown/bronze theme or revive aggressive default ornamentation.

Source identity for the future import:

- Edited PNG SHA-256: `2c81d15a1217059fd7c5177b92fffb3a78ca07c0edb305770083e396f645552a` (3,862 bytes).
- Companion `Window.manifest.json` from the conversation kit SHA-256: `42fc5a3df1b0efff3f285aa83c1f9efca2f85022ff7b83ad3f17e7817da27a76`.
- Companion `Window.format.md` SHA-256: `76106326ab8c7db9f2072f68c371f247d62ff6784c6ea0d2ef598701d7f78ae5`.

These files are conversation design assets, not committed runtime assets in this planning change. The hashes identify the handoff; they are not download locations. W1 must retrieve the exact edited PNG and kit, commit canonical source/provenance and an adapted format explainer, and document their real repository paths. Do not invent a repository path that already contains the skin. The kit's generator recreates the original sample, not Ariel's edit: it must never overwrite her source PNG. If an original is unavailable, resolve that before import rather than redrawing a guessed replacement.

### Format retained from the kit

Use the existing custom v1 packing: 8 rows × 8 columns of 24 × 24 cells; each cell has a 16 × 16 artwork rectangle inset by four pixels. Row A is the top and column 1 the left. For zero-based column c and row r, extract `[4+24c, 20+24c) × [4+24r, 20+24r)`. Repeat the art rectangle, never its transparent packing gutter. H8 remains reserved. This is not a drop-in RPG Maker windowskin format.

Preserve the named roles: four corners; independently authored top/bottom/left/right runs; fills; opening/closing title brackets and title background; optional fixed midpoint ornaments; horizontal/vertical dividers; outer-frame attachments; cross/T/elbow junctions; end caps; divider-label brackets; plain connectors; small pointers/control states. Dividers are structural first-class pieces, not improvised overlapping borders. A T's directions name its connections; a cap's name identifies its closed end. Use the kit's full slot table and manifest, not inferred coordinates from an enlarged screenshot.

Keep fixed anchors intact. A title stays live measured text. Optional midpoint ornaments may be omitted when they collide with a title, divider attachment, or small layout. Long titles reflow into a header instead of shrinking text. Reserve content insets separately from ornamental overhang; do not require every window dimension to be a multiple of a motif.

For a rail span L with 16-pixel repeats, retain the specified finishing policy: exact multiples use whole repeats; spans shorter than 16 use a compatible plain rail; other spans use whole repeats, the plain remainder, then one complete lengthwise-mirrored terminal tile. Thus 53 = 16 + 16 + 5 plain + 16 mirrored. Horizontal rails mirror left/right, vertical rails top/bottom, not across bevel thickness. This trades a quiet stretch for a complete endpoint; mirroring an arbitrary clipped motif alone cannot guarantee both seams.

### Seam audit, presentation, and scope

The old sample's binary-alpha and exact-connector validation results do not certify the edited image. W1 must check geometry, gutters, alpha, repeat shoulders, and attachment profiles on the actual edited PNG, and show it assembled over black and its panel fills. In particular, inspect the previously flagged right-side bevel/filler and divider attachment, plus the repeat shoulders. Treat those as audit targets, not permission to repaint them. Report mismatches by tile/port; preserve the source and document any deliberately accepted seam or proposed derived connector. Do not silently threshold alpha, change lighting orientation, repack, or claim perfect seams from matching dimensions alone. Artwork-only revisions do not require a new packing version unless the contract actually changes.

The compositor is a decorative layer around semantic HTML text, buttons, and the existing native modal. It does not own game state, keyboard focus, text content, or hit-target size. Art can use an integer UI scale independent of the 320 × 192 world viewport. Reflow content and simplify optional chrome before compromising legibility. Keep decoration out of pointer handling and the accessibility tree. Recompose on size/title/skin changes, not every animation frame; avoid one DOM element per tiny repeat and unbounded caches.

W1 implements only the pieces needed by the existing conversation and Settings, one real title gap, and one real section divider, with enough junction fixtures to validate the retained format. Do not create fake inventory/party screens to show the skin. Normal, focused, pressed, selected, and disabled controls need distinct, non-color-only cues; a calm border must not erase focus. Keep full-area play, black margins, closed-by-default tools, visible fatal errors, reduced-effects behavior, and current input ownership.

**Acceptance:** exact source hash/provenance; declared region/connector results; screenshots of both real windows at narrow/wide and odd/remainder sizes; readable long titles/text; working keyboard/controller message controls; no duplicate listeners or per-frame border rebuild. The Python compositor remains a design reference, not a Python runtime dependency for players. Theme variants, a theme editor, portrait animation, and new decorative tiers are deferred.

## 3. Shared facts, conditions, and transactions — M2 foundation

Keep one authoritative domain state. Conversations, doors, objects, and the later journal query it rather than caching conflicting copies. Immutable authored definitions remain separate from persistent deltas, transient simulation, and rendering.

Declare fact types, defaults, allowed values/bounds, owner, and persistence scope. Support the global and placement facts needed by the first content; preserve room for region scope without building unused regional machinery. A chest or lock has a stable placement ID independent of its template, filename, or displayed name. Two copies of the same chest art have separate completion state.

Begin with bounded pure `all` / `any` / `not` composition, typed fact comparisons, item counts, and placement state. Register named quest-state checks when M3 supplies the quest model. Unknown facts, wrong types, unsupported operations, invalid quantities, and excessive nesting are validation failures, not false values or implicitly created flags. Tests run without Phaser or browser APIs. No expressions execute JavaScript from JSON. Time, exploration statistics, and factions wait for their own exercised models; the first puzzle does not depend on combat statistics.

All item grants/removals, accepted choices, unlocks, and completion markers go through a single validated transaction path. Prerequisites are rechecked at commitment. Coupled domain operations occur together or not at all; publish cosmetic events afterward. Opening, hovering, rendering, resizing, or completing an animation is never sufficient to grant a reward. Stable one-shot markers make re-entry and duplicate callbacks harmless. A failed inventory operation leaves the chest unclaimed and reports why; no item or completion flag is partly applied.

Persistence initially means state surviving room changes in the running session. Full browser-reload durability is not claimed until M2.4/M2.5 storage and import/export work is implemented and tested. Save facts, inventory, placement deltas, and supported checkpoints, not UI components or in-flight promises. When M3 adds quest state, add an explicit save migration/compatibility decision and fixtures.

## 4. Conditional object states and trigger semantics

An object keeps its identity while its resolved presentation and interaction change. Author an unconditional fallback plus explicit ordered state rules, first matching rule wins; reject duplicate state IDs and diagnose overlaps where statically detectable. Do not claim static checks can prove all conditions mutually exclusive or every route reachable.

Examples: unopened/opened chest; switch off/on; gate closed/open; Mara before/during/after a quest. A state can choose sprite, visibility, passability, and interaction entry. These are separate properties, not one Boolean doing every job. Evaluate affected active objects after relevant committed changes, and reconstruct unloaded rooms from defaults plus deltas on entry. Do not attach every unloaded NPC to per-frame condition polling.

Dynamic blockers must update the domain collision view and presentation together at a safe boundary; the current static grid alone is insufficient. Define and test the occupied-cell policy before permitting a closing gate to overlap an actor. The initial safe policy is to defer the physical closing while its cell is occupied rather than trap, crush, or teleport the player. Logical switch state and effective gate appearance/passability must remain explainable. No general dynamic physics system is required.

The first trigger sources are deliberate **Interact**, completed-step **Enter region**, and explicitly authored **State changed** reactions. Doors continue to use the existing completed-tile arrival boundary. State-change reactions subscribe only to relevant committed facts and owned active content; global scheduled events remain M6 work.

Each trigger must declare or use documented defaults for:

- **Re-entry:** enter-only or deliberate interaction, not implicit every-frame execution. A failed door reports once per attempt; the player must leave/re-enter or deliberately retry.
- **Condition changes while occupied:** normal enter triggers wait for re-entry; immediate reaction requires an explicit state-change rule. Loading a saved room is not automatically a new false-to-true event.
- **Repeat scope:** repeatable, once per visit, once per session, or once per saved placement. Never leave “once” undefined. Add cooldown only for exercised content with an explicitly named simulation/game-time unit; no hidden wall-clock progression.
- **Concurrency and lifetime:** no re-entrant copy while the same interaction is active; one modal owner; bounded queues/steps; scene exit cancels scene-owned work. A cyclic reaction cannot spin forever or monopolize a frame.

Configuration details are finalized in schema work. Implement only the sources/policies needed by the current fixture; the remaining vocabulary is a documented contract, not an invitation to build a visual scripting language.

## 5. G1 — Conditional doors and gates

G1 depends on M2's facts, inventory, one-shot transactions, saves, and lifecycle acceptance. It applies those shared systems to one persistent key lock and one switch-controlled gate before M3's richer quest. Ordinary existing exits remain valid and unconditional by default.

Separate **activation** (enter threshold, facing interaction, explicit transition request), **access condition**, **denied feedback**, **unlock operation**, **appearance/passability**, and **travel destination**. A solid interacted door and a walkable threshold are both legitimate but distinct. Denying a transfer alone does not make a tile solid. Invalid content is a validation failure, not an in-world “locked” response.

Default key behavior: possession permits unlocking; the key is retained unless explicit content says it is consumed; a permanent unlocked marker belongs to that particular lock. A switch gate follows its switch fact rather than pretending to have a permanent key unlock. Tests must also cover “key present OR already unlocked” and reverse travel. Permission/quest variants reuse these operations after those models exist. Hidden entrances and one-way passages require explicit authored behavior, not accidental inconsistency.

When access is denied, show a localized useful reason once per attempt and do not fetch the destination. On success, use the existing generation-token/prepare/validate/activate travel path; retain Retry/Stay, cancellation, late-response rejection, safe arrival and outgoing cleanup. Recheck relevant access/state revision before irreversible commitment after any asynchronous preparation.

A permanent unlock and a completed crossing are different commitments. If the player explicitly unlocks a lock, that fact may remain even when later travel fails; report it as an unlock, not a successful crossing. A future toll or passage-only consumable must commit atomically with successful domain travel activation, never at the start of a cancellable fetch. Destination failure/cancel does not charge for travel that did not occur. Do not build tolls in G1 merely because this policy is recorded.

**Acceptance:** missing-key denial; success with key; revisiting and save/reload; two independent locks; switch changes collision/appearance; no occupied-cell trap; return route; rapid held input; denied attempts make no destination request; failed/cancelled load preserves a usable room and expected key/unlock state. Existing unconditional exits and the 40-transfer regression still work. No statistics, clock, or broad script interpreter is needed.

## 6. Richer conversations and quests — M3

### Entry, choices, and prose

Keep old finite messages as valid content. Introduce dialogue graphs with stable dialogue/node IDs, localization keys, choices, declared conditions, explicit transitions/end nodes, and a safe adaptation path for existing messages. Do not force every readable plaque into a sprawling quest graph.

Choose the opening using explicit ordered entry rules with a required fallback: before the quest, during the search, after the objective is ready, and after completion. The first eligible rule wins. A missing fallback is invalid; overlapping rules are resolved by documented priority rather than opening two conversations.

Distinguish **shown** from **enabled**. A clue topic can remain hidden until discovered; “Hand over the missing lens” can be visible but disabled with a reason. Authors choose the policy. Preserve a stable selected choice ID when availability changes, move focus predictably if it disappears, and provide an exit/fallback when no actionable options remain. Re-evaluate prerequisites when confirming; stale UI cannot force an invalid transaction.

Retain readable wrapping, text-size changes, literal rendering, escaped substitutions, Unicode, and a clear continuation/cancel cue. Long text and changing titles must not alter the action's identity. Rich animation, portraits, voice blips, and a conversation-history viewer are later presentation work, not dependencies of graph correctness.

### State changes and repetition

Choices may change facts, transfer items, grant permission, or move a quest to a named state only after deliberate acceptance through the shared transaction path. Coupled hand-in/reward/completion is atomic and idempotent. Cancel before accepting makes no choice change; cancel later does not silently undo already committed story decisions. Failed/dropped cosmetics do not undo valid transactions. Save only at supported safe boundaries; no mid-script continuation serialization is promised.

Track meaningful authored events such as “plaque discussed,” “warning delivered,” or “quest accepted,” not an automatically persisted flag for every displayed sentence. Repeatable topics remain repeatable; explicit one-shot topics and post-completion acknowledgements use facts/quest state. Normal prose edits should not require inventing new saved state.

Quests use named states and explicit legal transitions. Derive journal entries from that state instead of maintaining a second independent set of progress flags. Dialogue can use a quest-state condition once M3.2 supplies the model; M3.1's first tests can use M2 facts without a circular dependency.

### Validation and proof

Reject dangling nodes/items/facts/messages, bad substitutions, invalid operations and quantities, unsupported schema versions, and unbounded action execution. Report structural orphans and reachability without claiming this proves logical solvability. Test priority/fallback, hidden versus disabled choices, repeat conversations, stale prerequisites, cancel/re-entry, literal text, no selectable options, all documented quest routes, full inventory, hand-in/reward idempotence, old-save handling, and reduced-effects parity.

## 7. N1 — Direct controller menu and choice navigation

Controller detection and exploration already exist; this packet adds selection navigation, not another hardware backend or virtual mouse. Reuse the one app-owned sampler and explicit input-context ownership.

Deliver a small directional focus/selection model for actual lists, tabs, buttons, toggles, and the controller configuration already exposed in Settings. Support confirm/cancel, scrolling to the selected item, bounded held-direction repeat, and deliberate focus restoration. Mouse hover must not unexpectedly steal controller selection; changing device modality should be predictable. Disabled choices remain explainable and cannot be confirmed. No duplicated press can both close a menu and activate the exploration action underneath.

Provide a discoverable controller route to the player menu. Pick the additional menu binding explicitly during implementation, validate conflicts, preserve existing assignments, and migrate preferences only if the schema needs it. Prompts show configured actions, not hardcoded Xbox labels that contradict a custom binding. Preserve keyboard-only and touch paths, inactive-window/hidden-tab safety and neutral rearming.

N1 core is delivered with or before the first M2 inventory menu; choice navigation is wired into M3.1. Test real menu entry/exit, selection, confirmation, cancellation, scrolling, nested settings, remapping, disconnect/reconnect, and held-input isolation. Synthetic tests are not physical-controller certification.

Keep the player game menu separate from Debug. Add Inventory when item operations exist, Journal with quest state, and Party when that model exists. After safe storage works, supply functional New Game / Continue / Load and save/export access, with explicit confirmation before replacing progress. Do not add dead menu entries or a cosmetic Continue button before loading works. No cloud services or profile resets are implied.

## 8. Connected micro-quest and second-content test

Reuse the existing Workshop, Gallery, Mara and plaque; add one storeroom after the systems can serve it. This smaller fixture precedes the previously proposed town/inn/cellar/path expansion. These are test-content choices, not final story commitments.

The first connected route is:

1. Mara asks for a missing lens; agreement records the quest's searching state.
2. Reading the gallery plaque records a meaningful clue and exposes an extra conversation topic.
3. A reachable switch controls a gate to a chest. The switch and lens chest are not inside the key-locked storeroom.
4. The chest grants the lens exactly once and remains open on return/reload.
5. Returning the lens atomically removes it, completes the quest, and grants a brass key once. Mara uses completion acknowledgement on later visits.
6. The brass key permanently unlocks the storeroom; it is not required to obtain the lens in the first place.
7. Save/reload preserves facts, switch/chest/lock state, inventory, quest progress and a valid checkpoint.

Test discovery out of order, including finding the lens before accepting the quest; the conversation must reconcile existing progress rather than erase it or demand an impossible second chest reward. Declining and returning is a supported path. Keep the return route usable. The first access puzzle uses keys, switches, and quest facts, not a not-yet-built stat model.

M3.6 then adds a second NPC, another conditional entrance, and a second short quest primarily through content. Record any genuinely necessary engine primitive; do not call hardcoded per-NPC/per-door branches data-driven. The larger town fixture remains a later expansion and must not block this proof.

## 9. Optional polish and explicit deferrals

After the quest slice, an optional small audio packet can add confirm/cancel/denied-action/door cues through the planned capped audio service, per-category volume and mute, user-gesture start, and owned lifecycle. Missing audio is nonfatal and no critical information is sound-only. This must not delay M4 or silently preload every track.

M4 still owns recipe-driven PixelFX and its laboratory; M5 owns battle/stats expansion; M6 owns world time, schedules and broader residency proof. Defer dialogue animation/history, ornate skin variants, a theme editor, generic event scripting, stat-gated exploration without a separate model decision, and new controller backends. Keep the current skin stable long enough to test it in real interfaces.

## 10. Documentation and implementation acceptance

Every implementation packet includes schemas/compatibility decisions, positive and failure fixtures, source/build/browser evidence, resource ownership, and a STATUS handoff. Preserve old map/message/controller fixtures and, after M2, old saves. Documentation approval does not migrate settings, import art, grant inventory, or implement a gate.

The immediate next implementation is W1. Read the actual repository and source-asset handoff first, validate the revised sheet, apply it to the two existing surfaces, and stop at that tested outcome. M1.6 follows; do not collapse all of this document into a single engine rewrite.
