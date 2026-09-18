# RPGameworks — Current Status and Handoff

**Updated:** September 17, 2026, M1.3 delivery. GitHub CI timestamps for this work are September 18 UTC.

## Current phase

**M1.1–M1.3 implemented and tested.** The foundation now has two data-authored maps, one reusable scene, canonical schemas, shared structural/semantic validation, compiled collision data, and on-demand loading. The full M1 room-to-room RPG milestone is **not complete**.

The 20 × 12 Workshop and 24 × 14 Pillar Gallery can be selected in the development preview. The selector deliberately reloads the page. Named exits and target spawns are validated metadata only; stepping onto an exit does not yet trigger a gameplay transition. There is no NPC conversation, inventory, save game, combat, or full PixelFX recipe system.

## What works

- Canonical JSON game/map schemas, stable namespaced map and placement IDs, and map-local spawn/layer/exit IDs.
- Two authored maps with tile layers, collision rows, static objects, named entrances, and cross-map exit references. The gallery demonstrates internal walls and a solid placed pillar.
- Build-time generation of standalone browser validators and TypeScript declarations from the same schemas. Ajv 8.20.0 and json-schema-to-typescript 15.0.4 are exact development-only additions; previously locked package versions/integrities were preserved.
- A content compiler that validates before replacing generated output, emits one hashed JSON file per map plus a compact manifest, and refuses broken references or invalid data.
- Runtime loading of only the manifest and selected map, with schema/identity/spawn checking, bounded response sizes, timeout, cancellation, and visible failure reporting.
- Deeply frozen copied map definitions and a private byte-grid collision representation. Movement collision uses constant-time lookup, not scans of every placed object.
- One reusable Phaser map scene, bounded camera follow, original atlas, 320 × 192 logical canvas, and integer pixel scaling.
- Existing scoped keyboard/pointer input, movement, reduced-motion settings, 64-particle ceiling, restart cleanup, and diagnostics preserved.
- Strict TypeScript/checked-JavaScript checks, **83 unit tests**, and **18 production-browser scenarios**.

## Toolchain and commands

The accepted Node ranges remain `>=22.16.0 <23 || >=24.15.0 <25`. The Node 24 compatibility fix is preserved, including strict engine checking, synchronized package/lockfile metadata, and the Windows CI leg. No Node/npm downgrade is needed for Ariel's reported setup.

Run `npm ci --include=dev` after pulling these dependency additions. `npm run dev` prepares assets/maps and starts the local development server. `npm run validate` performs content validation without replacing the emitted pack; `npm run content` rebuilds map payloads. While the development server is already running, manually rebuild content and refresh after editing map JSON; no content watcher is implemented yet.

`npm run check` performs source checks, unit tests, content validation, and production building. Browser checks use `npm run test:browser` after installing the configured Playwright Chromium browser. Commands generate ignored schema outputs automatically.

## Verification and provenance

The map source revision **`6c7a8d08c3eab217381bd3d24434c5eba3c9e3d7`** passed [GitHub Actions run 35294045478](https://github.com/FromAriel/RPGameworks/actions/runs/35294045478) on all three matrix legs: Linux/Node 22.16.0, Linux/Node 24.15.0, and Windows/Node 24.15.0. Node 24 jobs used npm 11.6.2. Installation, typechecking, unit tests, production-browser checks, and portable builds all passed. The clean main delivery receives a separate normal CI run; that run is the authority for its exact final commit identity.

The first map CI attempt passed all 83 unit tests and 17 of 18 browser scenarios. One test read a page execution context during the selector's intentional navigation. It now waits for document load before polling the new runtime, without weakening assertions. See [MAPS.md](MAPS.md).

Browser scenarios preserve the eight original regressions and add selected-map network assertions, gallery collision/named spawn behavior, preview selection/restarts, a third content-only fixture, malformed/blocked/wrong-ID/missing-frame failures, unknown selections, and missing-manifest handling. The network assertion checks actual requests to ensure the gallery is not fetched when the workshop loads. Successful gallery and narrow-workshop screenshots were inspected.

Local Node 22 source checks, 83 unit tests, content validation, and builds also passed using the genuine CI-exported dependency installation. Local browser navigation was blocked by the environment (`ERR_BLOCKED_BY_ADMINISTRATOR`), so no local browser pass is claimed. Actual browser evidence comes from hosted Chromium on Windows and Linux. Those are not tests of Ariel's own device or proof of Android/iOS support.

Original foundation evidence remains in [FOUNDATION.md](FOUNDATION.md), and Node 24 repair evidence in [TOOLCHAIN.md](TOOLCHAIN.md). The temporary dependency preparation workflow is absent from the delivered tree; normal CI retains read-only repository permissions.

## Next concrete packet

**M1.4/M1.5 — Interaction and room-to-room integration.** Add one NPC message, one interactable, modal input ownership, and actual door transitions using existing map/spawn references. Validate/load a destination before establishing it as active. Handle repeated requests, failure/cancellation, re-entry, and outgoing ownership cleanup. Do not create a separate scene subclass for each room.

Keep movement, lazy content, schema generation, original assets, Node 24 support, and existing tests intact. Do not introduce saves, combat, a visual editor, custom WebGL, or general scripting in this packet. The full M1 acceptance criteria still require interaction and real transitions; preview reloads and scene restarts do not substitute for them.

## Compatibility and limits

This introduces map/game schema version 1. There is no prior save format to migrate. Future ID or schema changes require explicit compatibility decisions. Generated JSON and validator/type files are build products, not alternate authoring sources.

No public deployment, Tiled importer, per-region asset lease/cache, performance certification, long-session memory plateau, Safari/Firefox coverage, or Android/iOS hardware verification is supplied. Map size bounds and resource counts are not frame-rate guarantees. Build size warnings remain visible: the Phaser-containing chunk is about 1.38 MB minified / 361 KB estimated gzip.

Project licensing, final story/art direction, full device support, and measured budgets remain open. RPGameworks is the chosen working name; complete name availability and SEO performance are not established. Preserve [RESEARCH.md](RESEARCH.md)'s unresolved naming note.

## Handoff rule

Inspect the actual current branch/ref, AGENTS.md, this status, and the next roadmap packet before editing. Preserve unrelated work, use non-forced ref updates, and report actual source/build/browser/deployment outcomes separately. Update this file after the next verified packet.
