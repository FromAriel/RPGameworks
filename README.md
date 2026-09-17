# RPGameworks

**A browser-native JRPG framework with expressive pixel effects.**

RPGameworks is being built a playable piece at a time: ordinary TypeScript/JavaScript, small active maps, a persistent world, and a composable cosmetic effects layer. The repository is the initial authoring environment; no paid coding agent, desktop RPG editor, runtime AI service, or game server is required by the design.

## Current build: foundation room

The first implementation packet is runnable. It contains a 320 × 192 logical-pixel room, an original placeholder character, four-direction tile-step movement and wall collision, keyboard/pointer controls, a bounded cosmetic burst, restart cleanup, and runtime diagnostics.

This is **M1.1 plus the M1.2 rendering spike**, not the complete M1 two-room RPG slice. Data-authored maps, NPC conversations, doors, persistence, inventory, and the full PixelFX recipe system are not implemented yet. No public deployment is configured or advertised.

## Run locally

Use Node **22.16.0** (recorded in `.nvmrc`; Node 22 versions from 22.16.0 are accepted). Install the committed lockfile rather than resolving new versions:

```sh
npm ci
npm run dev
```

Open the local address Vite prints. Asset generation runs automatically before development starts. Do not open `index.html` directly with a `file://` URL.

Click the room to focus keyboard input. Move with **WASD or arrow keys**; **Space** triggers a cosmetic pixel burst. The on-screen direction buttons also accept pointer input. **Restart room** exercises scene disposal/recreation. The **Cosmetic particles** checkbox turns the burst off without changing movement; reduced-motion preference disables it initially.

For a production build and local preview:

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

## Check a change

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:browser
```

`check` runs strict TypeScript checking, unit tests, and a production build. Browser tests run against a production build under `/RPGameworks/`, not just the Vite development server. The checked foundation has **19 unit tests and 8 browser scenarios**; [the verification record](docs/FOUNDATION.md) identifies the tested revision, environment, actual results, and limitations.

GitHub Actions runs the same checks and retains a static `browser-build` artifact and `browser-evidence` report. Those artifacts are build/test outputs, not a deployed website. The standard workflow has read-only repository permissions.

## Source boundaries

| Location | Responsibility |
| --- | --- |
| `src/domain/` | Pure movement state and viewport arithmetic; no Phaser or DOM dependencies |
| `src/platform/input.ts` | One abortable keyboard/pointer input owner per scene lifetime |
| `src/presentation/foundation.ts` | Temporary Phaser rendering spike, original atlas loading, bounded emitter, scene cleanup |
| `src/main.ts`, `src/style.css`, `index.html` | Accessible controls, diagnostics, errors, and responsive page layout |
| `assets/source/` | Original placeholder pixel patterns and provenance |
| `tools/generate-assets.mjs` | Validated deterministic atlas generation using Node built-ins |
| `tests/` | Domain/asset tests and production-browser checks |

This intentionally starts with one small scene rather than a forest of empty engine modules. The next packet moves the temporary room geometry into validated map data.

## Documentation

| Document | Purpose |
| --- | --- |
| [Current status](docs/STATUS.md) | Actual progress and the next concrete task |
| [Foundation and verification](docs/FOUNDATION.md) | Implemented behavior, checks, observed constraints, and handoff details |
| [Master plan](docs/PLAN.md) | Product boundaries, architecture, world lifecycle, RPG rules, saves, performance, and delivery |
| [Implementation roadmap](docs/ROADMAP.md) | Ordered work packets and acceptance gates |
| [PixelFX design](docs/PIXELFX.md) | Future recipe-driven visual effects and authoring laboratory |
| [Research and naming notes](docs/RESEARCH.md) | Technical sources, naming caveats, and discovery strategy |
| [Contributor/assistant rules](AGENTS.md) | Rules for bounded, testable changes and truthful handoffs |

## Known limits and licensing

The browser checks use Chromium on a Linux CI runner, including software WebGL and Canvas. Narrow viewport checks are not proof of Android/iOS device support. The Phaser-containing chunk is about 1.38 MB minified with a roughly 360 KB Vite-reported gzip estimate; its size warning is deliberately not hidden. Real-device performance, heap/GPU profiling, and other browser engines remain unverified.

**RPGameworks** is the working name; complete naming availability and search performance are not guaranteed. A project license has not been selected. Original placeholder artwork is documented in `assets/source/README.md`; third-party dependencies retain their own licenses. Do not interpret this repository as granting a license to future code or assets.
