# Foundation room — Implementation and verification

**Packet:** M1.1 + bounded M1.2 rendering spike. **Date:** September 17, 2026.

This record describes the actual first implementation, not the capabilities of the future framework. The two-room RPG slice, authored maps, NPC dialogue, inventory, save games, and general PixelFX recipes are still future work.

## What the player can do

Open the browser build, focus the room, walk in four directions, collide with its walls, trigger a small pixel burst, switch particles off, and restart the scene. The HTML interface displays build/version information and live resource counts. Pointer direction buttons and a constrained-screen layout are included.

The initial room is 20 × 12 tiles of 16 logical pixels each. The rendered canvas stays 320 × 192; integer CSS scale is selected independently of the simulation. Tiny viewports scroll the canvas rather than using fractional stretching. This is a foundation policy, not a final mobile viewport design.

## Boundaries established

`src/domain/movement.ts` owns integer destination tiles and interpolated progress. It has no Phaser or browser imports. A started step finishes when movement input is released, then stops. Facing changes at a tile boundary. Input delta is clamped to 50 ms so a long stall or resumed tab cannot request seconds of immediate movement.

`src/platform/input.ts` owns DOM input for one scene lifetime. Keyboard and pointer sources share one directional state. Pointer capture cancellation, blur, visibility changes, and abort-based cleanup prevent retained input. Phaser's unused input plugins are disabled in this spike.

`src/presentation/foundation.ts` draws the temporary finite room and attaches the actor/effect. Scene shutdown aborts scene DOM listeners, disposes the input owner, stops particles, and drops references. Phaser owns display-list destruction. The single shared atlas belongs to the game, not to each restart.

The emitter reuses particle objects, emits up to 24 decorative particles per request, and enforces both active and total pool ceilings of 64. Burst requests have no gameplay consequence. A saturated pool drops decoration; disabling effects kills current particles but does not change the actor or movement code.

The HTML interface is independent of the canvas. Diagnostics refresh at 4 Hz rather than rebuilding DOM every rendering frame. The public diagnostic hook returns copied snapshots, not the mutable Phaser world.

## Original asset pipeline

`assets/source/foundation.json` contains a palette and nine original pixel patterns. `tools/generate-assets.mjs` validates their dimensions/symbols and writes a deterministic PNG plus Phaser atlas JSON to ignored `public/generated/`. Development/build commands generate those files automatically.

The observed atlas is **144 × 16 pixels, 448 PNG bytes**. The generated PNG is not the source of truth. No third-party character art, tileset, font, music, or image-processing package was introduced. No project or asset license is assigned by this work.

## Reproducible toolchain

| Component | Verified version |
| --- | --- |
| Node | 22.16.0 |
| npm | 10.9.2 |
| Phaser | 4.2.1 |
| TypeScript | 7.0.2 |
| Vite | 8.3.0 |
| Vitest | 5.0.1 |
| Playwright | 1.63.0 |
| Node type declarations | 22.20.3 |

These are installed versions, not guessed package metadata. A one-off isolated-branch workflow resolved the registry packages and generated the real lockfile in [bootstrap run 35286865835](https://github.com/FromAriel/RPGameworks/actions/runs/35286865835). That write-enabled bootstrap workflow is removed from the delivered tree. Normal CI only needs read access to the repository.

## Verification evidence

**Passing source revision:** `72f48cdd7dcd4ef91c09559dcde365d48d91babd`.

**Passing run:** [Foundation checks / 35288165031](https://github.com/FromAriel/RPGameworks/actions/runs/35288165031).

The Linux GitHub runner installed the committed lockfile, ran strict typechecking, passed **19 unit tests**, built production output, and passed **8 browser scenarios with no retries**. It then built the portable relative-base artifact. Chromium 153.0.8010.12 was installed by Playwright 1.63.0; WebGL tests used software rendering on the CI runner. Canvas fallback was also exercised.

The final documentation/handoff commit can have a different SHA from this source revision. Consult that commit's own Actions run for its exact build identity; do not relabel the earlier run as a test of an untested commit.

### Unit coverage

Movement tests cover initial tile centers, interpolation, 30/60/120/144 Hz equal-distance simulation, wall blocking, release completion, boundary turns, invalid/large deltas, prolonged movement, and integer viewport scaling. Asset tests cover deterministic generation, frame bounds, PNG signature, and rejection of unknown pixel symbols.

### Browser coverage

1. Production launch under `/RPGameworks/`, exact Phaser version, WebGL rendering, 320 × 192 native canvas, 2× CSS scaling, and nearest-neighbor presentation.
2. Keyboard movement, wall collision, key release, and blur cancellation.
3. Repeated burst requests, active/pool ceilings, expiry, unchanged actor position, and movement with particles disabled.
4. Twelve scene restarts, one active scene, stable display-object/texture counts, and one burst response to one key press.
5. A 390-pixel-wide viewport at 1×, on-screen pointer controls, and explicit scrolling at a 280-pixel viewport.
6. Reduced-motion preference initially disabling particles and explicit opt-in enabling them.
7. Canvas renderer fallback and movement.
8. A missing atlas producing visible failure rather than a false ready state.

Passing screenshots at desktop and narrow widths were downloaded from the CI artifact and visually inspected. They show a correctly aligned room, visible actor, unclipped controls, and responsive diagnostics. They are screenshots of the actual runtime, not generated mockups.

### Problems caught before delivery

The first browser attempt read the diagnostic hook before the asynchronously imported renderer was ready. The harness now polls a safe startup value instead of throwing inside its retry loop.

Captured evidence also exposed a ResizeObserver feedback warning. The implementation now coalesces resizing into an animation frame, skips unchanged integer scales, and uses Phaser's scale manager rather than competing manual CSS writes. Browser scenarios explicitly capture window-level errors as well as uncaught page errors. The warning was fixed, not suppressed.

## Measured observations, not broad performance promises

The room contains **243 display objects**: 240 tile images, one sigil, one actor sprite, and one emitter. Resource-count assertions remain stable across the tested restarts. Those counts are not draw-call counts, GPU memory measurements, or proof of an absence of every possible leak.

Vite's first production report showed approximately **1,381 KB minified / 360 KB estimated gzip** for the Phaser-containing chunk, plus a small separate UI entry and stylesheet. The large-chunk warning stays visible. This measures build output, not a guaranteed compressed transfer size on every static host.

The shared atlas and particle ceilings are deliberately small; they do not establish capacity for thousands of effects or an entire city. No real-device frame-time baseline, thermal test, heap plateau, GPU profiling, or shader-overdraw benchmark is claimed. The diagnostic FPS label is an observation, not a certification target.

## What is not verified or delivered

There is no public deployment or Pages configuration. The CI build artifact is ready for ordinary static HTTP serving, but it is not a double-click HTML package. Browser tests cover Chromium on Linux; narrow viewport and pointer emulation are not Android/iOS hardware testing, and Firefox/Safari have not been certified.

Full application teardown, unusual browser lifecycle paths, real touch gestures, device-pixel-ratio/page-zoom combinations, and long sessions still need broader testing. M1.3 onward must preserve current tests while adding actual map, transition, and interaction behavior.

## Next packet

**M1.3:** introduce a canonical finite JSON map schema, stable map/spawn/exit IDs, two small fixtures, schema/reference checks, and pure collision data. Replace temporary geometry with a reusable data-backed map presenter. Do not copy the foundation scene once per room or expand this packet into combat, saves, or an editor.
