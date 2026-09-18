# RPGameworks

**A browser-native JRPG framework with expressive pixel effects.**

RPGameworks is being built a playable piece at a time: ordinary TypeScript/JavaScript, small active maps, a persistent world, and a composable cosmetic effects layer. The repository is the initial authoring environment; no paid coding agent, desktop RPG editor, runtime AI service, or game server is required by the design.

## Current build: foundation room

The first implementation packet is runnable. It contains a 320 × 192 logical-pixel room, an original placeholder character, four-direction tile-step movement and wall collision, keyboard/pointer controls, a bounded cosmetic burst, restart cleanup, and runtime diagnostics.

This is **M1.1 plus the M1.2 rendering spike**, not the complete M1 two-room RPG slice. Data-authored maps, NPC conversations, doors, persistence, inventory, and the full PixelFX recipe system are not implemented yet. No public deployment is configured or advertised.

## Run locally

Supported development runtimes are **Node 22.16.0 or newer within Node 22**, or **Node 24.15.0 or newer within Node 24**. `.nvmrc` keeps 22.16.0 as a reproducible default, not the only accepted runtime. An existing Node 24.15.0 installation does not need to be downgraded. Install the committed lockfile, including the local build tools:

```sh
npm ci --include=dev
npm run dev
```

Open the local address Vite prints. Asset generation runs automatically before development starts. Do not open `index.html` directly with a `file://` URL.

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

`check` runs strict TypeScript checking, unit tests, and a production build. Browser tests run against a production build under `/RPGameworks/`, not just the Vite development server. The current suite contains **22 unit tests and 8 browser scenarios**. The original [foundation verification record](docs/FOUNDATION.md) describes the first 19 unit tests; [the toolchain repair record](docs/TOOLCHAIN.md) covers the three package-policy checks and Node 24/Windows validation.

GitHub Actions checks Linux with Node 22.16.0 and Node 24.15.0, plus Windows with Node 24.15.0. Node 24 jobs use npm 11.6.2. Each matrix leg retains a `browser-build-<label>` artifact and `browser-evidence-<label>` report. Those artifacts are build/test outputs, not a deployed website. The standard workflow has read-only repository permissions.

## Source boundaries

| Location | Responsibility |
| --- | --- |
| `src/domain/` | Pure movement state and viewport arithmetic; no Phaser or DOM dependencies |
| `src/platform/input.ts` | One abortable keyboard/pointer input owner per scene lifetime |
| `src/presentation/foundation.ts` | Temporary Phaser rendering spike, original atlas loading, bounded emitter, scene cleanup |
| `src/main.ts`, `src/style.css`, `index.html` | Accessible controls, diagnostics, errors, and responsive page layout |
| `assets/source/` | Original placeholder pixel patterns and provenance |
| `tools/generate-assets.mjs` | Validated deterministic atlas generation using Node built-ins |
| `tests/` | Domain/asset/package-policy tests and production-browser checks |

This intentionally starts with one small scene rather than a forest of empty engine modules. The next packet moves the temporary room geometry into validated map data.

## Documentation

| Document | Purpose |
| --- | --- |
| [Current status](docs/STATUS.md) | Actual progress and the next concrete task |
| [Foundation and verification](docs/FOUNDATION.md) | Implemented behavior, checks, observed constraints, and handoff details |
| [Toolchain and Windows repair](docs/TOOLCHAIN.md) | Node compatibility policy, setup troubleshooting, and regression evidence |
| [Master plan](docs/PLAN.md) | Product boundaries, architecture, world lifecycle, RPG rules, saves, performance, and delivery |
| [Implementation roadmap](docs/ROADMAP.md) | Ordered work packets and acceptance gates |
| [PixelFX design](docs/PIXELFX.md) | Future recipe-driven visual effects and authoring laboratory |
| [Research and naming notes](docs/RESEARCH.md) | Technical sources, naming caveats, and discovery strategy |
| [Contributor/assistant rules](AGENTS.md) | Rules for bounded, testable changes and truthful handoffs |

## Known limits and licensing

Browser checks use Chromium on hosted Linux and Windows runners, including software WebGL and Canvas. Narrow viewport checks are not proof of Android/iOS device support. The Phaser-containing chunk is about 1.38 MB minified with a roughly 360 KB Vite-reported gzip estimate; its size warning is deliberately not hidden. Real-device performance, heap/GPU profiling, and other browser engines remain unverified.

**RPGameworks** is the working name; complete naming availability and search performance are not guaranteed. A project license has not been selected. Original placeholder artwork is documented in `assets/source/README.md`; third-party dependencies retain their own licenses. Do not interpret this repository as granting a license to future code or assets.
