# RPGameworks — Current Status and Handoff

**Updated:** September 17, 2026.

## Current phase

**M1 foundation implemented and tested.** M1.1 (reproducible foundation) and the bounded M1.2 rendering spike are complete. The full M1 room-to-room milestone is **not** complete.

The current playable build is one small room with a placeholder actor, movement, wall collision, keyboard/pointer controls, a bounded particle burst, scene restart, and diagnostics. It is not yet a data-authored RPG or the full PixelFX system.

**Setup repair:** Node 24.15.0 / npm 11.6.2 is now admitted and tested, including on a Windows runner. The initial Node-22-only declaration blocked Ariel's dependency installation. The root package and lockfile now accept Node 22.16+ within Node 22 or Node 24.15+ within Node 24. Strict engine validation remains enabled; no dependency versions changed. See [TOOLCHAIN.md](TOOLCHAIN.md).

## What exists

- Exact dependency pins and a registry-generated lockfile: Phaser 4.2.1, TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.1, Playwright 1.63.0, and Node types 22.20.3. Node 22.16.0 / npm 10.9.2 was the initial verification environment; Node 24.15.0 / npm 11.6.2 is also tested.
- Pure tile movement with interpolation, collision callbacks, and bounded resume-time catch-up. Rendering rounds the final sprite coordinates instead of discarding simulation precision.
- A 320 × 192 logical canvas with integer CSS scaling. Small viewports use 1×; viewports narrower than the canvas scroll rather than blur through fractional scaling.
- Nine original placeholder atlas frames, generated deterministically from readable source using Node built-ins.
- One input owner and one scene-owned emitter; particles are capped at 64. Turning effects off cannot change actor movement.
- Reduced-motion defaults, visible loading/error states, build/version diagnostics, and abortable lifecycle ownership.
- Strict checking, 22 unit tests (including three package/lockfile consistency tests), 8 production-browser scenarios, and read-only CI that uploads matrix-specific build/report artifacts.
- A CI matrix covering Linux with Node 22 and Node 24, plus Windows with Node 24. The Node 24 jobs pin npm 11.6.2 to match the reported setup.

The room geometry in `src/presentation/foundation.ts` is deliberately temporary. It must not become the pattern of creating a new hardcoded Scene subclass for every map.

## Verification

The original passing foundation source revision was `72f48cdd7dcd4ef91c09559dcde365d48d91babd` on the isolated implementation branch. [GitHub Actions run 35288165031](https://github.com/FromAriel/RPGameworks/actions/runs/35288165031) passed installation from the lockfile, strict TypeScript checks, 19 unit tests, production builds, and all 8 Chromium browser scenarios. The delivered foundation commit `ce638d96f321b6f4a862d45397a3d4fb4118daa7` also passed its own [run 35288685754](https://github.com/FromAriel/RPGameworks/actions/runs/35288685754).

The Node 24 repair was checked in [compatibility run 35290573553](https://github.com/FromAriel/RPGameworks/actions/runs/35290573553): strict installation, typechecking, unit tests, production builds, and all browser scenarios passed on Linux/Node 22, Linux/Node 24, and Windows/Node 24. The exact source and synchronized lockfile identities are recorded in [TOOLCHAIN.md](TOOLCHAIN.md). The final repair commit's own normal CI must be checked separately; the temporary preparation workflow is not included in its tree.

The browser checks cover the `/RPGameworks/` production base path, keyboard movement/walls/release/blur, particle saturation/expiry/disable, 12 scene restarts with stable resource counts, narrow layouts/pointer controls, reduced motion, Canvas fallback, and failed atlas loading. Original foundation desktop and narrow screenshots were inspected. See [FOUNDATION.md](FOUNDATION.md) for details and limitations.

Local outbound DNS was unavailable. Package installation and the complete application test suite therefore ran on GitHub-hosted CI, not in the chat container. The original foundation work also ran the asset generator and independent pure-domain checks in the container and inspected CI artifacts.

**No public deployment is configured.** A static build artifact exists; it is not a hosted preview URL. Hosted Windows CI is not a test of Ariel's own machine. No real Android/iOS hardware, Firefox, Safari, heap plateau, or GPU timing claim is established.

## Next concrete task

Implement **M1.3 — Domain and map minimum** from [ROADMAP.md](ROADMAP.md): define stable map/object/spawn/exit IDs, one canonical finite orthogonal JSON map schema, two small map fixtures, and a pure collision representation with boundary/schema/reference validation.

Replace the temporary room-geometry loop with a reusable data-backed presentation path. Reuse the already-tested movement, atlas, input ownership, and cleanup rather than rewriting them. Keep M1.4/M1.5 work bounded: a later packet adds the NPC interaction, door transition, and modal input behavior needed to complete the two-room slice.

Do not add save games, combat, a full visual editor, custom WebGL, or the complete PixelFX recipe engine in this next packet.

## Open decisions and limits

Project licensing, final story/art direction, supported-device certification, public deployment, long-session measurements, and final performance budgets remain open. The initial Phaser-containing chunk is about 1.38 MB minified / 360 KB estimated gzip; preserve the visible build warning and measure before choosing a custom engine bundle.

The input/collision and diagnostics portions of M1.4/M1.6 have started, but those packets remain unchecked because map integration, interaction focus ownership, and the complete M1 acceptance paths do not yet exist.

RPGameworks remains the chosen working name. Complete name availability and strong SEO results are not established; keep the unresolved naming observation in [RESEARCH.md](RESEARCH.md).

## Handoff checklist

Inspect the actual latest branch/ref, this file, and AGENTS.md. Do not assume an isolated verification revision is current. Run checks after changes; distinguish source, build, browser tests, and deployment. Preserve unrelated work and existing save/schema decisions. End with a status update identifying the next unfinished packet.
