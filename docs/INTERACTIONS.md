# Interaction and room-to-room travel — M1.4/M1.5

## Player-visible slice

The Workshop caretaker, Mara, stands at tile (10,8), two tiles south of the initial player. Move one tile down, face her, and interact. Her two-page message describes the lit doorway at (18,6). That doorway loads the Pillar Gallery at its named `from-workshop` spawn (2,6), facing right. The gallery plaque at (4,4) can be read from an adjacent tile while facing it. Its doorway at (1,6) returns to the Workshop at `from-gallery` (17,6), facing left.

Keyboard: WASD/arrows move, E/Enter interact or advance, Escape closes/cancels. Space remains the cosmetic burst during exploration and advances an open message. Pointer/touch controls have an Interact button and semantic modal action buttons. Standard controller defaults preserve A for the burst and add X for interaction/advance and B for close/cancel. Existing remappings may give different bindings; the controller panel shows the actual configuration.

Interaction is adjacent and facing-based, not remote clicking. A step in progress must finish before an interaction can start. Mara and the plaque are solid placements. This is a finite message presenter, not a branching dialogue/quest engine. The example contains no item reward, inventory, save, or hidden persistent state.

## Content contract

The existing map schema v1 is extended additively with optional `strings.en`, `messages`, and placement `messageId`. Maps without these fields remain valid. Message IDs and string keys are map-local; placement IDs remain globally namespaced. A message has a speaker string key and one to eight page string keys. A map supports at most 32 message records and 128 English strings, each bounded to 1,500 characters by schema. English is the only implemented locale in this slice; keyed strings leave room for later localization without claiming a locale selector.

Shared validation checks missing message/string references, duplicate message IDs, ambiguous interactive cells, blank strings, unknown properties, and an interaction with no walkable adjacent tile. Adjacency validation is not a proof that an entire quest or route is reachable. Existing map/spawn/exit/atlas validation remains in force. Build errors still preserve the previous generated pack.

Messages are rendered with `textContent`, never interpreted HTML. Unicode and line breaks are retained, long text wraps, and the modal scrolls in a constrained viewport. Generated types and validators still come from the canonical schema. Authored content remains deeply frozen; `MessageSession` stores only the current page index.

New artwork is three small original placeholder frames: caretaker, doorway, and plaque. Existing atlas frame names remain unchanged. See `assets/source/README.md` for provenance.

## Input ownership

A single scene-owned InputController consumes keyboard, pointer, and sampled gamepad inputs. It has exploration, message, transition, and transition-error modes. The native dialog owns focus and makes background page controls inert. The gamepad is allowed to operate this owned modal, but not unrelated dialogs, settings, forms, hidden tabs, or inactive windows.

Opening or closing a modal clears queued actions and held movement and rearms the controller neutral latch. A held key cannot repeatedly advance text; a held controller press cannot dismiss a message and then trigger exploration. Interaction takes priority over a simultaneous cosmetic burst. Cancel wins over advance when both arrive in a modal frame. No movement or burst is admitted behind a message or travel dialog. Returning to exploration restores viewport focus.

The existing one app-owned gamepad sampling callback is preserved. Room transfers do not make new input owners, samplers, or background simulations. The earlier physical-controller failure was later attributed to Chrome by Ariel; that is user-reported resolution, not a new hardware certification by the test runner.

## Door transaction and resource ownership

The browser document, game, shared atlas, and reusable Phaser scene stay alive during normal door use. `MapView` owns all per-room images, hero, and bounded particle emitter. A transfer does not need a scene subclass or a page reload. `Restart room` remains a separate explicit scene shutdown/recreation fixture, disabled while a modal owns input.

An exit fires when a completed tile step enters its half-open rectangle. The optional movement-arrival callback stops the actor precisely at the door before leftover frame time can begin another step. ExitLatch suppresses immediate bounce when spawning on an exit and suppresses automatic retry while remaining on a cancelled/failed exit. Leave and re-enter to attempt it again, or use Retry after a failure.

Only the registered destination payload is fetched; the existing compact manifest is reused. The loader retains its eight-second timeout, 256 KiB response bounds, UTF-8/schema checks, and cancellation. A TransitionTask permits one pending request and rejects stale results even if a loader ignores its abort signal. Scene shutdown/application disposal invalidate the owner.

The current room remains resident while destination data is loading. A new MapView validates atlas references and constructs invisibly. If preparation fails, partial new visuals are destroyed and the old room remains usable. Once prepared, camera and visuals switch, the new room becomes active, and the old view/particles are destroyed. There can briefly be two sets of visuals during synchronous preparation; there is no claim that peak transition memory equals steady-state memory. There is still only one active room simulation. Shared atlas eviction and regional asset leasing belong to later work.

A failed destination gives Retry / Stay here rather than a false fatal startup. Cancellation leaves the actor at the current door tile; late completion cannot replace it. Real scene/cleanup exceptions remain fatal rather than being reported as successful rollback. Telemetry distinguishes map transfers, failures, cancellations, scene starts/stops, current input mode, and active message. Display-object counts and synthetic repeated transfers are not proof of a heap/GPU-memory plateau.

## Controller preference compatibility

Preferences now use `rpgameworks.controller.v2`. On first use without a v2 record, valid v1 settings are copied while preserving all five original action bindings, axes, inversion, enabled state, custom-mapping opt-in, and deadzone. Interaction/cancel prefer X/B when unused, otherwise an unused button index. Old v1 storage is not deleted. The UI reports migration, and all seven bindings remain editable with duplicate-assignment validation.

Invalid or future-version records have visible fallback. Storage failure leaves migrated settings usable for the session. There are no new dependencies, lockfile changes, Node/npm requirements, map ID renames, or gameplay saves to migrate. Existing Node 24.15.0/npm 11.6.2 remains supported.

## Verification and limits

Local source/type checking, 178 unit tests, content validation, and production builds pass using the genuine CI-exported locked dependencies. Source revision `d7b1c0dba137a5e29bffc2c69ffe38ec24d56a0d` passed [run 35335800741](https://github.com/FromAriel/RPGameworks/actions/runs/35335800741) on Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Every leg passed all 56 browser scenarios as well as installation, source checks, 178 unit tests, and builds; Node 24 used npm 11.6.2. The final clean main commit has its own normal CI, which is authoritative for that commit. Local HTTP navigation is administratively blocked; no local HTTP-browser pass is claimed.

The initial candidate passed all fourteen new browser cases but failed an older check expecting the explicit Ready status label. Restoring that label in the application fixed it without weakening the assertion. Desktop caretaker and narrow plaque screenshots were inspected.

The 27 new unit cases cover facing, mid-step refusal, message bounds/immutability, missing references, literal Unicode/HTML text, exit-entry guards, exact door arrival at simulated 30/60/120/144 Hz, duplicate requests, abort/stale generation, failed preparation/retry, disposal, preference migration, and action edges.

The browser suite adds 14 scenarios to the previous 42. It exercises actual caretaking/plaque interaction, keyboard/controller modal leakage, pointer controls at narrow width, document continuity and map-request counts, five destination failure variants, pending cancellation and late response, timeout/Stay recovery, 20 round trips (40 transfers), single-effect response after the tour, restart cleanup, literal text, reduced effects, and legacy settings persistence. Controller inputs are injected at the browser API boundary; no physical Elite hardware is connected to hosted CI.

M1.6 closeout still requires a recorded baseline frame/resource workload and consolidated acceptance. No public deployment, Android/iOS certification, other browser-engine certification, save system, branching quest engine, or long-session memory benchmark is implied.
