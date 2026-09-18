# Map-data slice — M1.3

**Scope:** finite, data-authored map definitions, stable IDs, schema/reference checks, and reusable presentation. This is not the gameplay door-transition or NPC-dialogue slice.

## What is implemented

Two canonical maps live in `content/games/demo/maps/`: the 20 × 12 Workshop and the 24 × 14 Pillar Gallery. Both use 16-pixel tiles and the existing nine-frame original atlas. The gallery adds an interior wall, a solid placed pillar, a walkable passage, and a separate named entrance.

A single Phaser scene draws whichever validated map is selected. The logical canvas remains 320 × 192 with integer scaling. The camera follows the actor within map bounds. Existing movement, pointer/keyboard input, reduced-effects settings, particle ceilings, and restart ownership remain in use.

The visible map selector performs a full page reload. It is a development preview convenience, not a persistent-world transition. The two exits are authored and validated, but do not fire when walked onto. M1.4/M1.5 will supply interaction and gameplay transitions.

## Canonical formats

`schemas/map.schema.json` and `schemas/game.schema.json` use JSON Schema draft-07. Ajv produces standalone ESM validation functions during development/build preparation; it does not compile schemas in the browser. `json-schema-to-typescript` generates declarations from those same schemas. Neither generated output is a competing source of truth, and neither schema compiler is a runtime dependency.

The dependency-preparation job installed **Ajv 8.20.0** and **json-schema-to-typescript 15.0.4** as exact development pins. It asserted that all previously locked package versions and integrity hashes were preserved. Node 22/24 support and strict engine checking remain unchanged. Preparation run: [35292392612](https://github.com/FromAriel/RPGameworks/actions/runs/35292392612). The temporary write-enabled preparation workflow is not part of the delivered source tree.

A map contains a version, namespaced ID, display name, fixed orthogonal orientation/tile size, dimensions, visual legend, ordered background layers, collision rows, default spawn, named spawns, static objects, and named exit rectangles. Width and height are bounded to 1–128 tiles; layers to four; spawns/exits to 32 each; objects to 256. These are authoring bounds, not measured performance claims.

Coordinates are integer tile coordinates, top-left origin, positive X right and positive Y down. Exits are half-open rectangles `[x,x+width) × [y,y+height)`. Spawn coordinates locate the actor's occupied tile; rendering positions its center. Facing is `up`, `down`, `left`, or `right`.

Visual layer rows must match map dimensions. A legend maps a one-character ASCII symbol to an atlas frame. `.` means a transparent/no-tile cell. Layers are currently backgrounds; roof/foreground ordering is not implied. Collision is independent: `#` is blocked and `.` is walkable. Solid placed objects add blocked cells to that collision grid. Decorative objects do not.

Map IDs use namespaced forms such as `demo:map.workshop`. Static placement IDs such as `demo:object.gallery.pillar` must be unique across the pack. Spawn, exit, and layer IDs are local to their containing map. References pair a target map ID with a spawn ID; filenames and visible names are not identity.

`game.json` is the explicit map registry and start location. File paths must stay inside the `maps/` namespace, use supported lowercase filenames, and cannot contain parent traversal, remote URLs, backslashes, or query strings. Runtime query parameters select registered IDs, never arbitrary fetch paths. Extra files not registered in the manifest are not automatically included.

## Validation and compilation

Run `npm run validate` to check without replacing a generated pack. Run `npm run content` to validate and emit map payloads. `npm run dev` and `npm run build` prepare assets/content automatically. During an already-running development session, run `npm run content` after a source edit and refresh the page. There is not yet a content-file watcher.

The structural validator rejects unknown properties, incompatible versions/tile sizes, malformed IDs, unsupported orientations, invalid scalar values, and over-budget arrays. Shared semantic checks reject incorrect row dimensions, undeclared legend symbols, missing atlas frames, duplicate scoped IDs, out-of-bounds or blocked spawns, invalid default spawns, out-of-bounds objects/exits, overlapping solid objects/exits, and blocked exit cells.

Build-time world checks additionally resolve start/exit map/spawn references and enforce global placement-ID uniqueness. Errors identify the source file, record ID, field path, and offending value. Semantic reports are capped at 20 issues. Structural checking stops at its first error. No action strings or arbitrary JavaScript are executed from JSON.

The compiler validates the entire registered pack before replacing its generated output. A rejected edit therefore leaves the previously generated pack untouched. This is not a crash-atomic filesystem transaction claim. Each map is emitted separately with a content-hashed filename and a compact manifest. Identical inputs produce identical map bytes and names. Production source control contains neither emitted map copies nor generated validators/declarations.

The browser fetches only the manifest and selected map. It rechecks structure/local semantics and registered exit-map IDs; it does not fetch every destination to revalidate the complete build-time graph. The installed atlas is checked before map objects are created. This boundary avoids accidentally turning validation into eager world loading.

Requests have an eight-second timeout, application-owned cancellation, and a 256 KiB limit enforced against declared and streamed sizes. Failed HTTP/JSON/schema/identity/spawn checks show an error rather than claiming readiness. Content is cloned and deeply frozen; immutable definitions are separate from actor motion.

Collision is compiled once per loaded map into a private byte array. The public interface exposes bounds, counts, and an O(1) `canEnter` predicate; it never returns the mutable array. Moving into a blocked cell or out of bounds is refused. Collision lookup does not scan placed objects per frame.

## Verification record

Local strict TypeScript/checked-JavaScript checking, **83 unit tests**, validation, and production build passed using Node 22.16.0 and the CI-exported pinned dependency installation. Local browser navigation was refused by the environment with `ERR_BLOCKED_BY_ADMINISTRATOR`; that attempt is not a product failure or a passing browser result. Browser verification uses the standard Windows/Linux CI.

The source verification revision is **`6c7a8d08c3eab217381bd3d24434c5eba3c9e3d7`**, with [run 35294045478](https://github.com/FromAriel/RPGameworks/actions/runs/35294045478). The Linux Node 22 and Node 24 jobs passed installation, all 83 unit tests, production builds, and all 18 browser scenarios. STATUS records the delivery checkpoint and Windows result. The final main commit also receives its own matrix run; inspect that run rather than relabelling this earlier source revision.

The first CI attempt passed all unit checks and 17 of 18 browser scenarios. Its preview-selector test evaluated the outgoing page during navigation, causing an execution-context-destroyed test error. The harness now explicitly waits for the selected document's load before polling its runtime; assertions were retained. This was a test synchronization correction, not suppression of a renderer error.

Unit coverage includes both supplied maps, structural/semantic rejection cases, malformed/out-of-bounds coordinates, maximum/minimum map dimensions, immutable-definition and private-grid behavior, movement at 30/60/120/144 Hz, registry and cross-map references, deterministic compiler output, preservation of old output on validation failure, on-demand fetch selection, malformed/oversized responses, timeouts, and cancellation.

The **18 browser scenarios** include all eight foundation scenarios plus map selection/loading, the larger gallery and solid pillar, named entrances, restart counts, a third content-only fixture without a new scene class, malformed/blocked/mismatched/missing-frame map failures, unknown selections, and a failed manifest. The unloaded-gallery request assertion checks actual requested URLs rather than relying solely on the diagnostic counter.

Desktop gallery and narrow workshop screenshots from the first CI run were downloaded and inspected. These were passing scenarios in that run, despite its separate selector-test failure. They show the actual runtime, not generated mockups. The gallery contains 340 display objects and the workshop 243; those are object counts, not draw-call or GPU-memory measurements. The first build reported about 45.56 KB minified / 8.31 KB estimated gzip for the application/validation entry, plus about 1,382 KB / 360.56 KB estimated gzip for the Phaser-containing chunk. The existing large-chunk warning is retained.

## Limits and next packet

No gameplay door activation, NPC dialogue, world persistence, general triggers, Tiled importer, visual map editor, mobile performance certification, or public deployment is supplied. Scene restart is tested separately from a future cross-map transition. A fixed shared atlas is sufficient for this slice; per-region asset leases and eviction remain future work.

This introduces the first versioned map format. No existing save format or saved-game migration is involved because saves do not exist yet. Later schema changes must preserve stable IDs or explicitly record compatibility decisions.

The next packet is M1.4/M1.5 integration: one NPC, focused/modal interaction input, an interactable, and safe room-to-room door transitions using the already-validated map/spawn references. It must handle re-entry, failure/cancellation, and scene cleanup without duplicating the map scene. Save games and combat remain outside that packet.

## Technical references

The implementation follows the official [Ajv standalone-code documentation](https://ajv.js.org/standalone.html) and [JSON Schema support documentation](https://ajv.js.org/json-schema.html). Schema generation itself fails if new schema features introduce a CommonJS `require` helper or dynamic `Function` compilation into the emitted standalone browser validator. This is a validator-specific check, not a claim about every third-party renderer implementation.
