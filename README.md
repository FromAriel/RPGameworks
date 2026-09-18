# RPGameworks

**A browser-native JRPG framework with expressive pixel effects.**

RPGameworks is being built a playable piece at a time: ordinary TypeScript/JavaScript, small active maps, a persistent world, and a composable cosmetic effects layer. The repository is the initial authoring environment; no paid coding agent, desktop RPG editor, runtime AI service, or game server is required by the design.

## Current build: data-authored map preview

The foundation now loads maps from validated JSON. The 20 × 12 Workshop and larger 24 × 14 Pillar Gallery share one reusable Phaser scene, tile-step movement, collision, original atlas, and bounded particles. A map selector reloads into either room; the camera follows the actor on maps larger than the logical viewport.

This completes the **M1.3 map-data slice**, not the complete M1 two-room RPG milestone. Named exits and their destination spawns are validated metadata only: **walking through a door does not change rooms yet**. NPC conversations, gameplay transitions, persistence, inventory, and the full PixelFX recipe system remain future work. No public deployment is configured.

## Run locally

Supported development runtimes are **Node 22.16.0 or newer within Node 22**, or **Node 24.15.0 or newer within Node 24**. `.nvmrc` keeps 22.16.0 as a reproducible default, not the only accepted runtime. An existing Node 24.15.0 installation does not need to be downgraded. Install the committed lockfile, including the local build tools:

```sh
npm ci --include=dev
npm run dev
```

Open the local address Vite prints. Asset and map generation run automatically before development starts. Do not open `index.html` directly with a `file://` URL.

Click the room to focus keyboard input. Move with **WASD or arrow keys**; **Space** triggers a cosmetic pixel burst. The on-screen direction buttons also accept pointer input. **Restart room** exercises scene disposal/recreation. The **Cosmetic particles** checkbox turns the burst off without changing movement; reduced-motion preference disables it initially.

For a production build and local preview, run the build first and start preview only after it succeeds:

```sh
npm run build
npm run preview
```

The default build uses relative asset URLs. An explicit project-path build is also supported and tested:

```sh
npm run build -- --base=/RPGameworks/
npm run preview -- --base=/RPGameworks/
```

Development needs Node/npm; the built game only needs a supported browser and ordinary static HTTP hosting. The build is not a self-contained double-click HTML file.

### Installation troubleshooting

`EBADENGINE` with Node 24 on the original foundation revision was caused by the project's former Node-22-only restriction. Pull the repaired `main` before installing. The runtime range and lockfile root metadata are now synchronized, while strict engine checking remains enabled.

`tsc` or `vite` not being recognized after a failed installation means the project's local build tools are not available. Complete `npm ci --include=dev` successfully before running build, preview, or dev. Do not install these tools globally, delete the lockfile, or upgrade npm merely because an update notice appears. See [the Windows repair instructions and verification record](docs/TOOLCHAIN.md).

## Check a change

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:browser
```

`check` runs strict TypeScript/checked-JavaScript checking, unit tests, content validation, and a production build. Browser tests run against a production build under `/RPGameworks/`, not just the Vite development server. The map slice expands the suite to **83 unit tests and 18 browser scenarios**; see [MAPS.md](docs/MAPS.md) for verification and limits. The original [foundation verification record](docs/FOUNDATION.md) describes the first 19 unit tests; [the toolchain repair record](docs/TOOLCHAIN.md) covers the three package-policy checks and Node 24/Windows validation.

GitHub Actions checks Linux with Node 22.16.0 and Node 24.15.0, plus Windows with Node 24.15.0. Node 24 jobs use npm 11.6.2. Each matrix leg retains a `browser-build-<label>` artifact and `browser-evidence-<label>` report. Those artifacts are build/test outputs, not a deployed website. The standard workflow has read-only repository permissions.

## Edit and preview maps

Edit the canonical records in `content/games/demo/maps/`, and register maps in `content/games/demo/game.json`. Run `npm run validate` for schema and cross-reference checks. `npm run content` rebuilds map payloads; refresh the development page afterward. Development startup and production builds run this automatically. Live file watching for content compilation is not implemented yet.

Map IDs are independent of filenames. `?map=demo:map.gallery&spawn=from-workshop` selects a registered map/spawn for preview, relative to the app's existing URL. The selector performs a full page load, not a game-world transition. Each load fetches only the compact manifest and selected map; neighbouring room data is not downloaded eagerly.

Generated JSON payloads, standalone validators, and schema-derived TypeScript declarations are ignored build outputs. Do not edit them. [Map authoring and verification](docs/MAPS.md) describes units, boundaries, diagnostics, and the next slice.

## Source boundaries

| Location | Responsibility |
| --- | --- |
| `src/domain/` | Pure movement, compiled collision grids, and viewport arithmetic |
| `schemas/`, `src/content/` | Canonical schemas, generated validators/types, and shared semantic checks |
| `src/platform/map-loader.ts` | Bounded, cancellable manifest/selected-map loading |
| `src/platform/input.ts` | One abortable keyboard/pointer input owner per scene lifetime |
| `src/presentation/foundation.ts` | One data-backed map scene, original atlas loading, camera, bounded emitter, and cleanup |
| `src/main.ts`, `src/style.css`, `index.html` | Accessible controls, diagnostics, errors, and responsive page layout |
| `assets/source/` | Original placeholder pixel patterns and provenance |
| `tools/` | Asset generation, schema generation, and validated map compilation |
| `tests/` | Domain, asset, package-policy, map, loader, and production-browser checks |

Maps are data now, not new scene subclasses. The next packet connects NPC interaction and gameplay door transitions while preserving the existing tests.

## Documentation

| Document | Purpose |
| --- | --- |
| [Map-data slice](docs/MAPS.md) | Map authoring, compiler, tests, known limits, and handoff |
| [Current status](docs/STATUS.md) | Actual progress and the next concrete task |
| [Foundation and verification](docs/FOUNDATION.md) | Implemented behavior, checks, observed constraints, and handoff details |
| [Toolchain and Windows repair](docs/TOOLCHAIN.md) | Node compatibility policy, setup troubleshooting, and regression evidence |
| [Master plan](docs/PLAN.md) | Product boundaries, architecture, world lifecycle, RPG rules, saves, performance, and delivery |
| [Implementation roadmap](docs/ROADMAP.md) | Ordered work packets and acceptance gates |
| [PixelFX design](docs/PIXELFX.md) | Future recipe-driven visual effects and authoring laboratory |
| [Research and naming notes](docs/RESEARCH.md) | Technical sources, naming caveats, and discovery strategy |
| [Contributor/assistant rules](AGENTS.md) | Rules for bounded, testable changes and truthful handoffs |

## Known limits and licensing

Browser checks use Chromium on hosted Linux and Windows runners, including software WebGL and Canvas. Narrow viewport checks are not proof of Android/iOS device support. The Phaser-containing chunk is about 1.38 MB minified with a roughly 361 KB Vite-reported gzip estimate; its size warning is deliberately not hidden. Real-device performance, heap/GPU profiling, and other browser engines remain unverified.

**RPGameworks** is the working name; complete naming availability and search performance are not guaranteed. A project license has not been selected. Original placeholder artwork is documented in `assets/source/README.md`; third-party dependencies retain their own licenses. Do not interpret this repository as granting a license to future code or assets.
