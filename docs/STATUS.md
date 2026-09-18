# RPGameworks — Current Status and Handoff

**Updated:** September 18, 2026, MouseJoy controller comparison repair.

## Current phase

**M1.1–M1.3 implemented; the complete M1 two-room milestone is still unfinished.** The 20 × 12 Workshop and 24 × 14 Pillar Gallery share one reusable Phaser scene, validated map schemas, compiled collision and lazy loading. Preview selection reloads the page. Exits are metadata only; there are no gameplay door transitions, NPC conversations, inventory, saves, combat or full PixelFX recipes yet.

## Latest input work

Ariel supplied a working MouseJoy HTML demo after the prior controller repair still reported no devices. That source is now the comparison baseline. See [MOUSEJOY-PARITY.md](MOUSEJOY-PARITY.md) for exact provenance, differences, tests and limits. **Her physical controller failure is not declared solved by synthetic tests.** Neither Windows failure nor extension interference has been established.

The native reader now samples on one app-owned animation-frame callback, separately from scene readiness. It iterates all returned browser slots before filtering connected entries, retains the chosen automatic device, follows connection events, and accepts numeric as well as object button values. Manual device selection remains authoritative. The sampler reads inputs only; the scene still owns gameplay consumption and movement. Resets do not create callbacks; disposal cancels the sampler.

Controller gameplay no longer requires the viewport div to own focus. Ordinary element focus changes release keyboard/pointer state without unnecessarily rearming the pad. Settings, form editing, open dialogs, inactive windows and hidden tabs still pause input, with neutral rearming after those real pauses. Default bindings/deadzone, preference validation and explicit custom-mapping opt-in remain unchanged.

**Controller configuration → Open MouseJoy-style controller test** opens a self-contained reduced reference reader on the same server. It displays both sticks, buttons and raw slots, without Phaser, saved settings, a canvas-focus gate or keyboard fallback. It is not the whole original desktop demo. The new game diagnostic marker is `mousejoy-frame-v1`, with raw slot/connected counts, sampling frames and event counts. A genuinely empty browser response remains empty.

The build label uses the local Git revision when available. Vite uses port 5173 with strict-port handling: an existing process is reported instead of silently starting the new build on another port. Stop the old server, update, and restart; do not reset browser profiles or delete storage as a speculative repair.

## Preserved behavior and boundaries

Keyboard autofocus still runs once after readiness without stealing intentional settings focus. Keyboard and pointer controls, 64-particle cosmetic ceiling, integer 320 × 192 presentation, camera follow, original atlas, scene cleanup and page-error isolation remain intact. Unattributed page errors are observable warnings; explicit load/startup/scene errors remain fatal. The checksum error's owner remains unknown.

Map definitions remain deeply frozen copies, distinct from transient movement and presentation. Collision uses a private byte grid. Build-time validators/types derive from canonical schemas; payloads are emitted separately per map. Loading remains bounded, cancellable and on demand. No package version, lockfile, map schema, saved preference version, licensing or Node range changed.

## Commands and verification

Accepted Node versions remain `>=22.16.0 <23 || >=24.15.0 <25`. Ariel's Node 24.15.0/npm 11.6.2 remains in Windows/Linux CI. Existing installations need only an update and server restart for this repair. New checkouts run `npm ci --include=dev`, then `npm run dev`.

`npm run check` runs source checks, **151 unit tests**, content validation and a production build. `npm run test:browser` runs **42 production-browser scenarios** after installing Playwright Chromium. `npm run validate` checks content without replacing output; `npm run content` rebuilds it. Development startup prepares content, but an already-running server has no content watcher.

Source candidate `e8a7a5c17b7a5590d2f1cd13dc8e4e231fb621d1` passed all three matrix legs in [run 35329084894](https://github.com/FromAriel/RPGameworks/actions/runs/35329084894). The final element-focus refinement is source `c00e8bdb729ec126954289e947f893efedbba078`, checked in [run 35329380104](https://github.com/FromAriel/RPGameworks/actions/runs/35329380104). The delivered main revision receives its own normal CI; inspect that exact run before claiming the final commit passed.

The additional 22 unit cases compare extracted MouseJoy reader functions, high/empty/disconnected slots, numeric buttons, selected-device retention, fresh API snapshots, errors and sampler disposal. Five added browser scenarios exercise actual gameplay input from those samples, page-level focus/form safety, sampling during map loading, a same-origin reference page and honest empty results. Existing error assertions remain intact.

Local Node 22 source/unit/content/build checks passed with the genuine CI-exported dependency installation. The supplied original HTML and reduced probe were exercised through local Chromium DOM loading with synthetic controller data; a stick moved the original demo's cursor and probe meters responded. Local HTTP navigation was blocked before game loading, so no local hosted-game browser pass is claimed. CI uses hosted Windows/Linux Chromium and synthetic gamepad readings, not physical Elite hardware. The temporary source-export workflow is absent from delivery. Normal CI is read-only.

Earlier evidence in [CONTROLLER-RECOVERY.md](CONTROLLER-RECOVERY.md), [INPUT.md](INPUT.md), [MAPS.md](MAPS.md), [FOUNDATION.md](FOUNDATION.md) and [TOOLCHAIN.md](TOOLCHAIN.md) is historical. In particular, the original scene-polled-only input design and viewport-only controller focus have been superseded by this explicit app-owned sampler.

## Next concrete packet

**M1.4/M1.5 — Interaction and room-to-room integration.** Add an NPC message, one interactable, modal ownership and gameplay door transitions using existing map/spawn references. Validate/load a destination before activation; handle repeats, cancellation/errors, re-entry and outgoing cleanup. Do not create a scene class per map. Preserve the current sampler, focus/form safety, lazy content, schema generation and Node 24 compatibility. A held button must not dismiss dialogue and also trigger exploration.

Controller troubleshooting should compare the provided working reference and same-origin raw results rather than add speculative backends or destructive browser resets. No saves, combat, visual editor, custom renderer or general scripting system belongs in this packet.

## Limits and handoff

No public deployment, Tiled importer, regional cache/lease proof, long-session memory plateau, physical-controller certification, other-browser coverage or Android/iOS hardware test is supplied. The Phaser bundle warning remains visible at approximately 1.38 MB minified / 361 KB estimated gzip. Existing schemas are game/map v1 and controller preferences v1; there is no gameplay save format. Future compatibility changes need explicit decisions. Final licensing, story/art direction and measured device budgets remain open; naming/SEO claims remain unproven.

Read actual main, AGENTS.md, this status and the current roadmap before editing. Preserve unrelated work, use non-forced updates, and separate source/build/browser/deployment and physical-hardware claims. Update this handoff after the next verified packet.
