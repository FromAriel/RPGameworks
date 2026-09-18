# RPGameworks — Current Status and Handoff

**Updated:** September 17, 2026, controller-recovery repair. CI timestamps for this work are September 18 UTC.

## Current phase

**M1.1–M1.3 implemented and tested; M1 is not complete.** Two data-authored maps share one reusable Phaser scene, validated schemas, compiled collision data, and on-demand loading. The 20 × 12 Workshop and 24 × 14 Pillar Gallery can be selected in a development preview that reloads the page. Named exits and destination spawns are validated metadata only. There are no gameplay door transitions, NPC conversations, inventory, saves, combat, or full PixelFX recipes yet.

Keyboard focus is requested once after readiness without stealing an intentionally focused setting. Standard browser controllers support left-stick/D-pad movement and an A-button cosmetic burst, with device selection, deadzone, axes/inversion, button remapping, local preferences, and neutral rearming. Physical Elite Series 2 behavior is not certified.

## Latest repair: page errors and controller recovery

The prior global error handler treated every unhandled page error as a fatal game error. During startup this could set the failure flag and suppress the viewport's initial focus. That application defect is repaired: unattributed page errors remain visible warnings and console errors, while explicit load/startup/scene failures still report fatal errors.

**Activate controller** enables input, closes configuration, rescans exposed devices, resets the latch, and focuses the viewport. It does not pair hardware or override browser permission/device exposure. Visible status distinguishes undetected devices, API errors, disabled input, focus/settings pause, and neutral-stick waiting. Detection can refresh through the existing 4 Hz UI timer even when a map cannot load. There is no additional game loop.

**Controller configuration → Show diagnostic report** produces bounded selectable text containing build/runtime, device/mapping/input, focus/settings, and last-page-error data. Nothing is uploaded automatically. Review before sharing. The underlying source of Ariel's checksum-corruption message remains unconfirmed; do not delete browser data or call the hardware failure solved from automated tests alone. See [CONTROLLER-RECOVERY.md](CONTROLLER-RECOVERY.md).

## Established boundaries

Canonical game/map schemas generate standalone validators and TypeScript declarations. The content compiler resolves references before replacing emitted output, then writes a compact manifest and individually hashed maps. Runtime fetches only the selected map, validates it, and applies bounded size/timeout/cancellation handling. Definitions are copied/deeply frozen; collision is a private byte grid with constant-time lookups.

The renderer retains a 320 × 192 logical canvas, integer scaling, bounded camera follow, nine original generated atlas frames, one active map scene, and a 64-particle cosmetic ceiling. Movement is pure domain code. Input has explicit scene ownership; controller service/UI have app ownership. Scoped listeners and restart cleanup remain tested. Cosmetic effects never determine RPG outcomes.

This repair changes no package versions, lockfile, map schema, controller preference format, save format, or Node compatibility range. Current dependency pins remain Phaser 4.2.1, TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.1, Playwright 1.63.0, Node types 22.20.3, Ajv 8.20.0, and json-schema-to-typescript 15.0.4.

## Commands and verification

Node `>=22.16.0 <23 || >=24.15.0 <25` remains accepted with strict engine checks. Ariel's Node 24.15.0 / npm 11.6.2 is in the CI matrix. Use `npm ci --include=dev` after a fresh checkout, then `npm run dev`. No dependency reinstall or Node/npm change is introduced by this repair.

`npm run check` runs source checks, unit tests, content validation, and production building. `npm run test:browser` runs production-browser scenarios after installing Playwright Chromium. `npm run validate` checks content without replacing output; `npm run content` rebuilds content. While a dev server is running, rebuild content and refresh after JSON edits; a content watcher is not implemented.

The repair source **`0ea8825d4460d26412d4d15a3e9ae9b8c35a775c`** passed [CI run 35307998894](https://github.com/FromAriel/RPGameworks/actions/runs/35307998894) on Linux/Node 22, Linux/Node 24, and Windows/Node 24. Every leg passed strict installation, source checks, **129 unit tests**, **37 Chromium browser scenarios**, and production builds. Node 24 jobs used npm 11.6.2. A final documentation/handoff commit receives its own normal CI run; check that exact commit before describing its status.

New regressions inject the reported checksum text as unrelated promise rejections before and after startup, verify continued focus/movement, exercise activation and reports, preserve API-error details, test detection despite failed maps, distinguish neutral waiting, and keep genuine scene update exceptions fatal. Intentional-error assertions do not relax existing no-uncaught-error tests. The report screenshot was inspected. Controller readings are synthetic, not hardware measurements.

Local Node 22 source/unit/content/build checks passed with genuine CI-exported locked dependencies. Local Chromium navigation was administratively blocked before app loading, so local browser success is not claimed. Browser evidence is from GitHub-hosted Windows/Linux runners. The temporary source-export workflow is excluded from delivery; normal CI remains read-only.

Earlier evidence is preserved in [INPUT.md](INPUT.md), [MAPS.md](MAPS.md), [FOUNDATION.md](FOUNDATION.md), and [TOOLCHAIN.md](TOOLCHAIN.md). These are historical records, not substitutes for the current commit's CI.

## Next concrete packet

**M1.4/M1.5 — Interaction and room-to-room integration.** Add one NPC message, one interactable, modal input ownership, and gameplay door transitions using existing map/spawn references. Validate/load a destination before activation; handle duplicate requests, failure/cancellation, re-entry, and outgoing cleanup. Do not create a scene subclass per map.

Preserve controller configuration, focus/neutral safety, page-error isolation, lazy content, schema generation, Node 24 compatibility, and current tests. A held controller press must not both dismiss a message and trigger exploration. Do not expand into saves, combat, a visual editor, custom WebGL, or a general scripting system.

## Open limits and handoff

No public deployment, Tiled importer, regional asset-cache/lease proof, long-session memory plateau, real-device performance certification, Safari/Firefox coverage, or Android/iOS hardware verification is supplied. Map limits/resource counts are not frame-rate guarantees. The Phaser-containing bundle remains approximately 1.38 MB minified / 361 KB estimated gzip; the warning is intentionally visible.

Map/game schema v1 and controller preferences v1 exist; no gameplay save format exists to migrate. Future ID/schema changes need explicit compatibility decisions. Generated outputs are not authoring sources. Project license, final art/story direction, full device support, and measured budgets remain open. Naming availability/SEO remain unproven; preserve [RESEARCH.md](RESEARCH.md).

Read actual main, AGENTS.md, this status and the next roadmap packet before editing. Preserve unrelated work, update refs without force, and distinguish source/build/browser/deployment outcomes. Keep continuity in this file, with detailed historical evidence in the linked records.
