# M2 State, Save, and Lifecycle Contract

M2 supplies one persistence spine for later JRPG systems. It is deliberately smaller than a quest engine: authored Boolean facts, inventory quantities, opened placements, ordered object states, and three manual local slots. G1 and M3 should consume these contracts rather than add parallel flag or save systems.

## State and authored objects

`SessionState` is pure domain state. Immutable snapshots contain a runtime revision plus inventory, declared facts, and opened placement deltas. `SessionController` owns the active state, publishes committed dependency keys, and activates a fully validated candidate during load. Phaser, DOM, IndexedDB, controllers, wall-clock time, messages, and promises do not enter the snapshot.

The optional fact catalog is separately loaded. M2 supports declared global saved Booleans only. Conditions are `all`, `any`, `not`, `factEquals`, `itemAtLeast`, and `placementOpened`, limited to depth 8, 64 nodes total, and 16 operands per combinator. Content generation rejects empty combinators, bad types/operators, unknown facts/items/placements, and excess limits.

Registered actions are `setFact`, `changeItem`, and `markPlacementOpened`. Transactions recheck their condition and expected runtime revision, calculate the complete result, validate capacity/stacks/availability, and commit once. A rejection changes no state, revision, visual, or message. A fact already at its requested value and any other net no-op is `unchanged`; an opened one-shot placement is `already-claimed`.

Map objects may provide ordered states with complete frame/visibility/interaction presentation. The first matching condition wins; exactly one unconditional last fallback is required. Placement solidity is constant in M2. A room indexes object positions to stable IDs and resolves the current state again when interaction begins. Committed dependency keys refresh only relevant active objects—there is no per-frame chest or global-condition scan. Legacy `messageId` and chest records normalize into the same resolver.

Only deliberate **Interact** actions execute in M2. `Enter` is reserved for a later region-trigger contract. `State changed` may refresh presentation but cannot itself produce gameplay actions until a later bounded reaction policy defines ordering, re-entry, and loop prevention.

## Save envelope and local slots

`SaveEnvelopeV1` contains the format/schema identity, game ID, save-compatibility version, one of three fixed slot IDs, monotonic storage revision, display-only ISO timestamp, exact map/tile/facing checkpoint, inventory, facts, and placement deltas. It excludes runtime revisions, presentation objects, UI/modal state, pending transitions, effects, promises, and controller state.

The compiler emits a small state index of valid maps/dimensions/spawns and item/fact/placement IDs. Envelope validation uses that index without activating every map. In-place load additionally fetches and validates the checkpoint map and its exact walkable tile. It creates a candidate session and room off to the side; only successful preparation activates them and disposes the prior room. Failure or cancellation leaves the current session, room, input owner, and stored slot untouched.

IndexedDB uses database `rpgameworks`, version 1, store `saveSlots`. A record holds `current` and optional `previous`. One read/write transaction checks the caller's last observed storage revision, moves current to previous, and writes the new revision. A stale tab cannot overwrite newer progress. Malformed current data does not erase a valid previous revision; recovery is explicit and optimistic.

Exports are formatted UTF-8 JSON named `<game>-<slot>-r<revision>.json`; temporary object URLs are revoked after initiation. Imports are limited to 256 KiB and reject invalid UTF-8, malformed JSON, shape/schema/version/game incompatibility, unknown references, invalid values, and invalid checkpoints before preview. Storing an import and loading it are separate confirmed choices.

When IndexedDB is missing or denied, exploration remains available in session-only mode. The UI explains the limitation. Export-current remains available, and a valid import can be loaded into the current session without claiming local storage success.

## UI and ownership

Inventory owns the route to one skinned Save/Load dialog. Keyboard, sampled controller, and pointer use semantic controls and the existing modal navigation owner. Empty Load/Export controls are disabled with visible reasons. Loading/importing always confirms replacement of unsaved progress; overwriting or recovering a non-empty slot also confirms. Saves are reachable only from stationary exploration through Inventory, so messages, transitions, movement, and conflicting owners cannot save.

Ownership is explicit:

- app lifetime: foundation atlas, controller sampler, session controller, save repository/service, shared window-skin source;
- active scene/room: actor, map view, display objects, emitter, input owner, state dependency subscription, transitions and map requests;
- save UI/service: dialog listeners, one navigation owner, IndexedDB transactions and pending-operation count;
- disposal: abort scene and UI listeners, cancel map transfer, abort owned storage transactions, unsubscribe object bindings, destroy outgoing room views, and release the app-owned atlas once.

Diagnostics expose active rooms/scenes, display objects, textures, session subscribers, active conditional bindings, transitions, and pending save operations. The residency fixture tours twelve distinct small test-only maps. Because every current room uses the one app-owned foundation atlas, M2 does not add an unused generalized cache/lease framework; regional asset eviction belongs to the first real per-region consumer.

## Compatibility fixtures and deferred work

Immutable version-1 fixtures cover empty progress, plaque-read progress, plaque-plus-lens progress, and a current/previous pair. Future changes must keep them loadable or deliberately bump compatibility and document migration or rejection.

Deferred: autosave, title-screen Continue/New Game, cloud sync/accounts, encrypted/authenticated saves, arbitrary repair, mid-message/transition/battle saves, conditional passability, quest graphs, dialogue choices, item use/equipment, and gameplay-producing state-change reactions.

## Manual acceptance route

1. Enter the Pillar Gallery, read the plaque, and confirm its visual/message changes.
2. Collect the Polished lens and confirm it in Inventory.
3. Open **Inventory → Save / Load** and save to Slot 1 while stationary.
4. Travel, restart the room, or otherwise alter current progress.
5. Load Slot 1, confirm replacement, and verify plaque, chest, lens, exact location/facing, focus, and controls without a page reload.
6. Reload the browser, deliberately load Slot 1, and verify the same restoration.
7. Export Slot 1, import it into Slot 2, confirm storage and load separately, and verify equivalent progress.
8. Record visual clarity, physical-controller behavior, or any mismatch separately from automated acceptance.
