# Character-sheet integration branch plan

**Status:** CA1/CA2 delivered and published; CA3/CA4 remain optional separate art packets · **Owner:** Ariel · **Current order:** G1.2 local review, G1.3, then M3 gameplay. See [ROADMAP](ROADMAP.md) and [STATUS](STATUS.md); this character plan does not mark G1 complete or require CA3/CA4 before M3.

## Outcome and boundaries

Replace the demo's static `hero-*` atlas frames with a correctly anchored, animated, layered Cute Fantasy player assembled from the documented sheets. Package the approved game-use pixels as a versioned binary asset blob fetched by the static web game, not as the original `.aseprite`, PNG folder tree, ZIP, or a sprite-download endpoint. Preserve the 16×16 **world tile/collision footprint**: the character's source alignment cell is 64×64 pixels and its visible art can extend outside one world tile. The foundation atlas remains for maps, objects, and effects.

This branch does **not** add equipment gameplay, combat, new rules, saves, player appearance customization UI, a generalized region asset cache, a second renderer, or a new deployment cadence. The first playable result uses one deliberately selected appearance. The pipeline must be capable of adding approved layer variants later without redefining the file format.

The input contract is the [player layout and 56-row animation map](asset-analysis/cute-fantasy-player.layout.json), validated by its [schema](asset-analysis/sprite-sheet-layout.schema.json) and explained in the [reconstruction guide](asset-analysis/README.md). Row 44–46 `fish_cast` counts are **9/9/9**. The eight outer Aseprite frames are appearance examples, not animation time. There are no Aseprite animation tags; Ariel's row map supplies the names and counts.

## Source and artifact gate

Record the chosen source version, hash, selected files, creator and pack terms in the asset provenance record. The license is purchase-backed (itch.io order #39717750, 2026-09-22, $2.99 USD; premium-licensed with commercial use and modification allowed but no redistribution/resale, recorded in the [asset-analysis license decision](asset-analysis/README.md#license-decision-ariel-september-22-2026)) and the provenance record may cite the receipt without transcribing buyer personal data. Keep `.import/` ignored and exclude original PNGs, Aseprite files and ZIPs from the production artifact. Ariel approves the selected derived pack before it is committed or released; the encoder and tests can use synthetic pixels until then.

## Current integration points

| Existing boundary | Required change |
| --- | --- |
| `tools/generate-assets.mjs` and `assets/source/foundation.json` | Leave the original foundation generator and atlas intact. Add a separate, deterministic player-pack encoder; do not increase its 32-frame cap to hold character art. |
| `src/presentation/foundation.ts` | Load and verify the player pack at a controlled prepare boundary; report a visible failure or retain the current hero until a complete candidate is ready. Use the configured Vite base path. |
| `src/presentation/map-view.ts` | Replace only the hero presentation with an owned layered character view. Continue reading position/facing/motion from the existing actor; never change movement/collision rules to fit art. |
| `src/domain/movement.ts` and save data | No dependency on image, timing, browser storage, or Phaser. Save remains tile/facing/session state, not animation frame or texture keys. |
| M2 residency diagnostics and browser fixtures | Account for the new shared pack/decoded textures, verify bounded ownership across restarts, room travel, loads, cancellation, and disposal. |
| Manual-only Pages workflow | Keep build-only dispatch. Do not add Chromium installation or the full test suite to hosted deployment; do local gates before any separately authorized release. |

## Binary-pack contract (v1 proposal)

Implement one small pack reader/validator and one offline encoder, with a documented format and golden fixture. Prefer standard browser and Node primitives over a new codec library. A candidate format is: fixed magic and format version; bounded manifest byte length; UTF-8 JSON manifest; then length-delimited, individually compressed RGBA cell/clip payloads. Manifest entries bind a stable asset/layer/animation/row/frame ID to dimensions, source variant ID, payload offset/length, decoded byte length and digest. Use canonical ordering and deterministic compression settings. Check every integer, range, overlap, length, digest and supported version before exposing pixels. Reject unknown formats, truncated packs, invalid UTF-8/JSON, decompression bombs, duplicate IDs, out-of-range rows/columns and unsupported layer mappings. Never execute code or evaluate authored expressions from the pack.

Do not embed whole source PNG files, the Aseprite file, a ZIP, or base64 in JS. Store only selected, game-use RGBA cells in the pack. Trim fully transparent cells and deduplicate identical cells **only if** the manifest still gives deterministic frame reconstruction. Chunk by selected variant/clip or another measured bounded unit so the browser need not decode every outfit and action at startup. The original source hash and pack generation manifest stay in tracked metadata; the original source stays ignored. Commit the approved generated pack for reproducible clean-checkout Pages builds, which cannot depend on Ariel's local `.import/` directory.

The initial compiled pack should contain one chosen full appearance plus `idle` and `walk` down/side/up, not all 129 full-canvas variant PNGs. The encoder and format should already recognize the layer order and 56-row catalog; later packets add only the verified variants and actions that are actually needed. Measure pack bytes, decoded bytes, upload size, decode time, texture count and startup impact before growing the pack. If a full pack cannot remain bounded, split by appearance/action while keeping a single versioned contract; do not fetch the entire premium set at initial boot.

## Sequenced packets and acceptance

### CA1 — Provenance, format, and synthetic round trip

1. Confirm the local source and export hashes against the layout. Pick and record the starter appearance by exact relative file paths/variant IDs, with one hair **or** helmet, optional accessory, and an explicit hidden-hands policy. Do not silently use Aseprite frame 0 as a universal outfit definition.
2. Write the pack-v1 specification, JSON manifest schema, source allowlist, and deterministic encoder/reader around **synthetic pixel fixtures**. Keep `.import/` an input to a separate explicit regeneration command, not a prerequisite for routine `npm run build` or tests.
3. Validate source dimensions (576×3584 full sheets; 64×64 alignment cells; nine columns, 56 rows), row offsets, allowed layer roles, and `layerRowRuns` for smaller tools/mounts. Fail closed on any missing, extra, mismatched, or unverified requested sheet. Exclude the five unmapped specialty exports pending a separate mapping.
4. Unit-test round trips, corruptions, boundaries, stable ordering and byte-identical regeneration from the same inputs. Produce a report of chosen inputs, cell counts, deduplication, pack bytes, source hashes and output hash. Review this report before encoding the selected real pixels.

**Gate:** synthetic pack reader/encoder and format review pass. After Ariel approves the selected derived pack, generate and allowlist **only** that pack and its metadata. Inspect the complete staged file list before any authorized commit.

### CA2 — One animated exploration character

1. Create a narrow presentation-side pack adapter that fetches one blob under `import.meta.env.BASE_URL`, validates it, decodes only required chunks, and hands pixel surfaces/frames to Phaser. Confirm the exact API against the pinned Phaser 4.2.1 package, rather than assuming a Phaser 3 tutorial. [Phaser's texture model](https://docs.phaser.io/phaser/concepts/textures) supports images/canvases and named frames; avoid reuploading a large Canvas Texture every animation tick.
2. Build an owned `CharacterView` (or equivalently focused module) from ordered layer sprites/frames. Keep texture/frame keys stable and namespaced. The source order is horse, tool-under, base, shoes, pants, shirt, hair-or-helmet, accessory, optional hands, tool-top. The hero's foot anchor is measured from the actual art and documented; all layers share one world-space anchor. Apply nearest-neighbor sampling and integer-aligned presentation without shrinking the 64×64 cell into a 16×16 tile.
3. Map current actor motion/facing to `idle`/`walk` down/side/up, and make the opposite horizontal facing policy explicit (mirror one side row if the art test approves it). Choose and record frame durations and whether idle loops; do not reuse the Aseprite outer-frame 100 ms. The game-domain actor remains authoritative and the presentation may not move, collide, or interact on its own.
4. Prepare the complete candidate view before replacing the old hero. On a missing/corrupt pack, unsupported browser decompression, texture failure, room cancellation, or disposal, show a clear recoverable failure or retain the prior valid view; never leave an invisible player with input live. Release object URLs, temporary decoded arrays, subscriptions and owned textures at the correct lifetime boundary. Keep the single app-owned pack resident only if repeated travel measurement supports that choice.

**Gate:** Workshop/Gallery walking and turning are player-visible, aligned at the same tile positions, and preserve interactions, gate collision, save/load, transitions and controller input. A static hero fallback/failure route is tested. No gameplay state or save-format migration occurs.

### CA3 — Layer variants, action catalog, and controlled expansion

1. Extend the allowlist to the specific verified clothing, hair/helmet, accessory, tool and mount variants needed for the demo. Compose all layers at matching row/column coordinates. For a row-offset sheet use `exportRow = masterRow - masterRowOffset`; select its exact front/behind run once. Never draw both tool-depth layers from the same pixels. Treat unmapped lantern/torch/special hands as rejected input until independently mapped.
2. Register all 56 supplied animation entries in the presentation catalog, including nine frames in each `fish_cast` direction. Make action availability explicit by content/tool selection: a catalog entry does not automatically mean the current hero can perform it. Specify loop versus one-shot, hold/return-to-idle, cancellation on transition, and what happens if an action lacks a required layer. No animation callback awards an item, changes a fact, or drives combat rules.
3. Add a test-only preview or bounded local inspection route for appearance/action/layer combinations, not a public asset-browser or downloadable sprite gallery. Compare composites with the source example presets and a held tool and mount. Record any alignment or occlusion exception as a data rule, not a per-frame ad hoc offset.
4. Add decoded-frame/texture residency limits based on measured workloads. Load only chosen variants and clips, cache repeated combinations by stable key, and evict only when no active view uses them. Avoid introducing a general asset-lease framework while the game still has one active room and one small player pack.

**Gate:** one selected outfit plus held-tool and mounted examples composite correctly across down/side/up; every catalog entry is validated; optional variants do not increase startup downloads without use. Unsupported combinations fail with an explicit validation result.

### CA4 — Production, lifecycle, and release review

1. Run focused encoder/decoder/schema/unit tests, content validation, typecheck, `npm run check` (optimized production build), and the complete local browser suite. Add real-play browser checks for movement-to-animation transition, left/right mirroring, room travel, restart, load in place, narrow viewport, reduced motion/effects and load failure. Verify the full current suite still passes.
2. Repeat travel/restarts/save-load and an interrupted pack request. Assert one player view, bounded texture/display-object counts, no stale listeners or animation timers, and no domain-state mutation from animation. Measure a cold and warm load and compare with the current foundation-atlas baseline without inventing a fixed performance gate.
3. Inspect `dist/` and its network requests: only the approved pack, game bundles, content and existing UI/map assets may ship; no `.aseprite`, source PNG tree, ZIP, `.import/`, test gallery or browser report. Check blob header/version/hash, Pages `/RPGameworks/` URL resolution and a production preview.
4. Update STATUS and ROADMAP with exact local evidence and provenance record. Ariel visually reviews the character in Workshop/Gallery. A push, public Pages deployment and hosted verification are **separate authorizations**; do not change the manual-only workflow or trigger hosted tests merely to publish art.

**Gate:** locally verified, reviewable candidate with exact artifact allowlist and Ariel's visual acceptance. Only a separately approved manual deployment may make it the public playtest character; verify the deployed commit and asset hash after that deployment.

## Engineering contracts for the coding agent

- **Source of truth:** the validated layout JSON plus an explicit, small appearance/asset allowlist and provenance record. The pack and texture registry are generated representations. Do not infer action names from pixel occupancy or use arbitrary source-folder globbing at production build time.
- **Validation before output replacement:** reject unknown IDs/variants, unsafe paths, wrong dimensions, duplicate rows, invalid frame counts, bad offsets/run coverage, impossible layer selection, missing cells, changed source hashes, oversized chunks or decoded data, and format-version mismatch. Generate to a temporary file and replace the prior pack only after complete validation and digest verification.
- **Atomic visual adoption:** candidate pack/texture/view preparation finishes before the old hero is removed. Late results from a disposed scene cannot install textures or resurrect listeners. Gameplay readiness should not be reported while required hero art is missing without a visible fallback.
- **Coordinate contract:** domain position remains a 16×16 tile and facing; 64×64 art cells are presentation rectangles. One measured foot anchor and a stable depth policy preserve placement and occlusion. Art cannot widen collision or alter save checkpoints.
- **Pixel and time contract:** nearest-neighbor pixels; no interpolated frame blending; no full-sheet GPU reupload on each tick; animation elapsed time is presentation-only and bounded on tab resume. Respect reduced-motion presentation while keeping facing/state legible.
- **Artifact contract:** package only the approved game-use selections and record creator attribution/terms and source-version hashes. Never commit receipts or the ignored premium source directory.

## Delivery and remaining-art checklist

- [x] Preserve the G1.1 work and record provenance for the selected appearance.
- [x] Obtain Ariel's approval for the selected derived pack after a local visual preview.
- [x] Complete CA1 with synthetic pixels, the binary specification, and deterministic golden-fixture tests.
- [x] Complete CA2 with the selected starter appearance, side mirroring, foot anchor, timing, fallback, and lifecycle checks.
- [ ] Implement CA3 variants, held tools, mounts, and wider actions only as a separate art packet with its own acceptance.
- [ ] Run CA4's broader catalog/residency review before any separately approved expansion release. The published CA2 pack already passed its own local build, browser, source-boundary, and hosted release checks.
