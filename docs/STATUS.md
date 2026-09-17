# RPGameworks — Current Status and Handoff

**Updated:** September 17, 2026.

## Current phase

**M1 foundation implemented and tested.** M1.1 (reproducible foundation) and the bounded M1.2 rendering spike are complete. The full M1 room-to-room milestone is **not** complete.

The current playable build is one small room with a placeholder actor, movement, wall collision, keyboard/pointer controls, a bounded particle burst, scene restart, and diagnostics. It is not yet a data-authored RPG or the full PixelFX system.

## What exists

- Exact dependency pins and a registry-generated lockfile: Phaser 4.2.1, TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.1, Playwright 1.63.0, and Node types 22.20.3. Node 22.16.0 / npm 10.9.2 were used for verification.
- Pure tile movement with interpolation, collision callbacks, and bounded resume-time catch-up. Rendering rounds the final sprite coordinates instead of discarding simulation precision.
- A 320 × 192 logical canvas with integer CSS scaling. Small viewports use 1×; viewports narrower than the canvas scroll rather than blur through fractional scaling.
- Nine original placeholder atlas frames, generated deterministically from readable source using Node built-ins.
- One input owner and one scene-owned emitter; particles are capped at 64. Turning effects off cannot change actor movement.
- Reduced-motion defaults, visible loading/error states, build/version diagnostics, and abortable lifecycle ownership.
- Strict checking, 19 unit tests, 8 production-browser scenarios, and read-only CI that uploads build/report artifacts.

The room geometry in `src/presentation/foundation.ts` is deliberately temporary. It must not become the pattern of creating a new hardcoded Scene subclass for every map.

## Verification

The passing source revision is `72f48cdd7dcd4ef91c09559dcde365d48d91babd` on the isolated implementation branch. [GitHub Actions run 35288165031](https://github.com/FromAriel/RPGameworks/actions/runs/35288165031) passed installation from the lockfile, strict TypeScript checks, 19 unit tests, production builds, and all 8 Chromium browser scenarios.

The browser checks cover the `/RPGameworks/` production base path, keyboard movement/walls/release/blur, particle saturation/expiry/disable, 12 scene restarts with stable resource counts, narrow layouts/pointer controls, reduced motion, Canvas fallback, and failed atlas loading. Captured desktop and narrow screenshots were inspected. See [FOUNDATION.md](FOUNDATION.md) for details and limitations.

Local outbound DNS was unavailable. Package installation and the complete application test suite therefore ran on GitHub-hosted CI, not in the chat container. The container did run the original asset generator and independent pure-domain checks, and inspected the CI artifacts.

**No public deployment is configured.** A static build artifact exists; it is not a hosted preview URL. No real Android/iOS hardware, Firefox, Safari, heap plateau, or GPU timing claim is established.

## Next concrete task

Implement **M1.3 — Domain and map minimum** from [ROADMAP.md](ROADMAP.md): define stable map/object/spawn/exit IDs, one canonical finite orthogonal JSON map schema, two small map fixtures, and a pure collision representation with boundary/schema/reference validation.

Replace the temporary room-geometry loop with a reusable data-backed presentation path. Reuse the already-tested movement, atlas, input ownership, and cleanup rather than rewriting them. Keep M1.4/M1.5 work bounded: a later packet adds the NPC interaction, door transition, and modal input behavior needed to complete the two-room slice.

Do not add save games, combat, a full visual editor, custom WebGL, or the complete PixelFX recipe engine in this next packet.

## Open decisions and limits

Project licensing, final story/art direction, supported-device certification, public deployment, long-session measurements, and final performance budgets remain open. The initial Phaser-containing chunk is about 1.38 MB minified / 360 KB estimated gzip; preserve the visible build warning and measure before choosing a custom engine bundle.

The input/collision and diagnostics portions of M1.4/M1.6 have started, but those packets remain unchecked because map integration, interaction focus ownership, and the complete M1 acceptance paths do not yet exist.

RPGameworks remains the chosen working name. Complete name availability and strong SEO results are not established; keep the unresolved naming observation in [RESEARCH.md](RESEARCH.md).

## Handoff checklist

Inspect the actual latest branch/ref, this file, and AGENTS.md. Do not assume the isolated verification revision is still current. Run checks after changes; distinguish source, build, browser tests, and deployment. Preserve unrelated work and existing save/schema decisions. End with a status update identifying the next unfinished packet.
