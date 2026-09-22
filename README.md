# RPGameworks

**A browser-native JRPG framework with expressive pixel effects.**

RPGameworks is being built a playable piece at a time: ordinary TypeScript/JavaScript, small active maps, a persistent world, and a composable cosmetic effects layer. The repository is the initial authoring environment; no paid coding agent, desktop RPG editor, runtime AI service, or game server is required by the design.

## Current build: skinned two-room state, inventory, and manual saves

**The game fills the browser viewport**, centered on a black background with crisp whole-pixel enlargement. The small **Menu** button opens the skinned Inventory; its Settings action reaches the existing configuration panel, and **F2** still opens Debug directly. These windows are closed at launch. On wide screens the drawer can sit beside live gameplay; click the play area to keep playing with the readout visible. Controller options, instructions, map preview, build information and runtime counters remain available without occupying the normal game screen. See [current status](docs/STATUS.md) and [the player interface](docs/PLAYER-SHELL.md).

**Your edited base windowskin is integrated.** Mara’s conversation and the Settings/Debug drawer use the exact source sheet, live bracketed titles, and a real Settings divider. Long titles wrap into a header; long message bodies scroll while their actions stay available. Skin loading is lazy and decoration failures leave usable plain windows. See [the tile format, source identity, connector audit and implementation](docs/WINDOW-SKIN.md).

The 20 × 12 Workshop and 24 × 14 Pillar Gallery are connected by working doors. Walk up to Mara, the workshop caretaker, face her, and open her two-page greeting. The Gallery plaque now records a declared Boolean fact, changes appearance, and reveals a follow-up clue. Its chest at tile (8,8) holds one **Polished lens**. Both interactions use the same validated condition/action/state resolver; door travel and room restart reconstruct their committed state without duplicate rewards.

**Three manual save slots are available from Inventory.** A browser reload still begins a fresh session, but an IndexedDB slot persists until deliberately loaded. Saves restore the exact map tile, facing, Inventory, facts, and opened placements in place; export/import supplies portable plain JSON with validation and confirmation. Invalid, incompatible, stale, unavailable-storage, and failed-destination paths preserve the running game and prior valid data. Item use/discard/equipment, autosave, title-screen Continue, cloud sync, conditional travel, branching quests, battle, and the full PixelFX recipe system remain deferred. See [the M2 state/save contract](docs/M2-STATE-SAVES.md). A [public Pages playtest build](https://fromariel.github.io/RPGameworks/) is available; it is not a finished-game release.

The approved player-interface direction has a dedicated [UI visual language and system plan](docs/UI-DESIGN-SYSTEM.md) and [decision record](docs/decisions/0002-workshop-astral-ui-language.md). **Workshop Astral** combines the restrained Workshop Night structure with cyan interaction/focus, brass importance/reward accents and violet magic/battle accents. The U1 foundation is integrated into the real player windows; G1 conditional access is the current gameplay milestone.

See [the interaction implementation and verification](docs/INTERACTIONS.md) and [current status](docs/STATUS.md).

## Run locally

Supported development runtimes are **Node 22.16.0 or newer within Node 22**, or **Node 24.15.0 or newer within Node 24**. `.nvmrc` keeps 22.16.0 as a reproducible default, not the only accepted runtime. An existing Node 24.15.0 installation does not need to be downgraded. Install the committed lockfile, including the local build tools:

```sh
npm ci --include=dev
npm run dev
```

Open the local address Vite prints. Asset and map generation run automatically before development starts. Do not open `index.html` directly with a `file://` URL.

The room receives keyboard focus automatically when the first scene is ready; an initial click is no longer required. A control deliberately focused during loading keeps its focus. Move with **WASD or arrow keys**. **E / Enter** interacts with the adjacent object you face and advances messages; **Escape** closes a message or cancels travel. **Space** triggers a cosmetic pixel burst during exploration and advances an already-open message. During exploration, **I** or **Escape** opens Inventory and **F2** toggles Debug; dialogue and travel keep their existing Escape behavior. Arrow keys move Inventory selection, **E / Enter** inspects/confirms, and **Escape** returns. Use **Inventory → Settings → On-screen controls** to enable the pointer buttons, which are hidden by default on desktop and automatic on touch-first devices. **F2 → Restart room** exercises scene disposal/recreation. **Inventory → Settings → Cosmetic particles** turns the burst off without changing movement; reduced-motion preference disables it initially. The drawer is not restored on reload. Below the logical canvas size only, proportional downscaling avoids cropping; enlargement stays integer-scaled.

### Controller recovery

Use **Menu → Settings → Activate controller** to close settings, rescan and focus the game. Release the buttons and center the stick briefly. The status inside Settings distinguishes detected-but-paused input, neutral waiting, API problems, and no exposed controller. **Controller configuration → Show diagnostic report** gives selectable troubleshooting data without uploading it. Unattributed page errors are warnings, not automatically fatal game failures; genuine startup/scene failures remain separately reported. See [controller recovery](docs/CONTROLLER-RECOVERY.md).

### Controller configuration

Native input now follows the supplied working MouseJoy reader: one app-owned frame sampler, retained connected-device selection, and no requirement to focus the viewport div for controller movement. Settings, form editing and inactive tabs still pause gameplay. **Open MouseJoy-style controller test** in the panel runs a minimal independent reader on the same server. See [the comparison, tests and remaining hardware uncertainty](docs/MOUSEJOY-PARITY.md).

Open **Inventory → Settings → Controller configuration**. Standard Xbox/Elite-style defaults use the **left stick or D-pad to move/select**, **A for the cosmetic pixel burst**, **X to interact/advance/confirm**, **B to close/cancel**, and **Menu / button 9** to open Inventory. These are defaults: prior remapped buttons and axes are preserved during migration to controller preferences v3, with the new Menu action assigned without overwriting existing choices. The panel provides device selection, deadzone adjustment, axis selection/inversion, button remapping, and a live input readout. Settings save locally in this browser; gameplay Inventory does not yet persist across reload. No extra dependency or account is required.

The browser may require a controller button press before exposing a connected device. Press and release once, center the stick, and use **Return to game** after configuration. Input pauses while settings are open; an already-started tile step finishes. Reconnection or return from an input-blocking pause requires neutral controls before gameplay resumes, preventing held-button surprises. Keyboard input remains available when the controller API is absent or blocked.

Messages, Inventory, Save/Load, Settings, Debug controls, and travel recovery can be controlled without a mouse. Future dialogue choices still require their own acceptance. These bindings use what the browser exposes. Independent Elite paddle inputs, firmware profile editing, and rumble are not promised. See [input behavior, configuration, and verification](docs/INPUT.md).

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

## Public playtest and manual Pages release

Open the [GitHub Pages playtest](https://fromariel.github.io/RPGameworks/) in a browser; players do not need npm. The first verified deployment serves commit `87e45383d9f45b5e3f7a7ec48b2ef3df9e2adf66` from [manual run 35676907503](https://github.com/FromAriel/RPGameworks/actions/runs/35676907503). The build ID shown in Debug/Settings identifies the version actually served, which may lag behind `main` until the next manual release.

The repository's Pages source is **GitHub Actions**. A maintainer releases reviewed `main` by running `gh workflow run pages.yml --repo FromAriel/RPGameworks --ref main`, then waits for the build and deploy jobs to succeed and checks the live URL and build ID. [The dedicated workflow](.github/workflows/pages.yml) runs source/content/unit checks and the full Chromium suite before uploading only the tested `dist/` game. Ordinary pushes do not deploy; the existing three-platform CI is separate. Do not describe a new commit as deployed until its own Pages run and live URL are verified.

Browser storage belongs to its origin. Saves made on `localhost` do not appear automatically on Pages: export a slot locally and import it on the public site if you want to carry progress over. This site is a public playtest, not certification of the complete JRPG, physical controllers, or mobile devices.

### Installation troubleshooting

`EBADENGINE` with Node 24 on the original foundation revision was caused by the project's former Node-22-only restriction. Pull the repaired `main` before installing. The runtime range and lockfile root metadata are now synchronized, while strict engine checking remains enabled.

`tsc` or `vite` not being recognized after a failed installation means the project's local build tools are not available. Complete `npm ci --include=dev` successfully before running build, preview, or dev. Do not install these tools globally, delete the lockfile, or upgrade npm merely because an update notice appears. See [the Windows repair instructions and verification record](docs/TOOLCHAIN.md).

## Check a change

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:browser
```

`check` runs strict TypeScript/checked-JavaScript checking, unit tests, content validation, and a production build. Browser tests run against a production build under `/RPGameworks/`, not just the Vite development server. The first Pages deployment passed **315 unit/content tests and 135 functional browser scenarios**; eight benchmark workloads remain a separate, earlier baseline rather than a deployment gate. Coverage includes bounded conditions, atomic facts/items/placements, the plaque and migrated chest, versioned fixtures, three-slot save/load, export/import, stale tabs, storage failures, in-place rollback, repeated save/load, and a twelve-distinct-map residency tour; earlier suites retain controller/modal ownership and the 40-transfer room tour. See [current status](docs/STATUS.md) for exact completed gates and publication boundaries. Controller readings are simulated in browser tests, not captured from physical hardware. Historical detail remains in [WINDOW-SKIN.md](docs/WINDOW-SKIN.md), [PLAYER-SHELL.md](docs/PLAYER-SHELL.md), [INTERACTIONS.md](docs/INTERACTIONS.md), [MOUSEJOY-PARITY.md](docs/MOUSEJOY-PARITY.md), [CONTROLLER-RECOVERY.md](docs/CONTROLLER-RECOVERY.md), [INPUT.md](docs/INPUT.md), [MAPS.md](docs/MAPS.md), [FOUNDATION.md](docs/FOUNDATION.md), and [TOOLCHAIN.md](docs/TOOLCHAIN.md).

GitHub Actions checks Linux with Node 22.16.0 and Node 24.15.0, plus Windows with Node 24.15.0. Node 24 jobs use npm 11.6.2. Each matrix leg retains a `browser-build-<label>` artifact and `browser-evidence-<label>` report. Those artifacts are build/test outputs, not a deployed website. The standard workflow has read-only repository permissions.

The manual Pages workflow has [exact-commit hosted evidence](https://github.com/FromAriel/RPGameworks/actions/runs/35676907503) for its first deployment. This does not substitute for the separate three-platform CI matrix, which has not been rerun for that commit. See [current status](docs/STATUS.md) for the distinct local, hosted, deployment, and playtest boundaries.

## Record the foundation baseline

```sh
npx playwright install --with-deps chromium
npm run benchmark
```

The benchmark owns a production preview on port 4173, records seven warmed ten-second workloads plus forty real door crossings, and writes JSON to `benchmark-results/` and `benchmark-report/`. It uses the same displayed game size with Debug open/closed. Instrumentation exists only in test pages, not normal gameplay. No new dependency or lockfile change is required; Git must be available for source identity. Each CI leg uploads a `baseline-evidence-<label>` artifact with 14-day retention.

Read [the reproduction and acceptance record](docs/BASELINE.md) and [the selected baseline data](docs/benchmarks/M1-2026-09-18.json). Reported animation-callback pacing is not CPU/GPU execution time, a heap measurement or real-phone certification. Resource/correctness checks are hard assertions; shared-runner frame timing is recorded without an arbitrary FPS gate. The game view, controller preferences and source artwork are unchanged by this measurement packet.

## Edit and preview maps

Edit the canonical records in `content/games/demo/maps/`, and register maps in `content/games/demo/game.json`. Run `npm run validate` for schema and cross-reference checks. `npm run content` rebuilds map payloads; refresh the development page afterward. Development startup and production builds run this automatically. Live file watching for content compilation is not implemented yet.

Map IDs are independent of filenames. `?map=demo:map.gallery&spawn=from-workshop` selects a registered map/spawn for preview, relative to the app's existing URL. The selector is in **Menu → Debug** and performs a full page load; gameplay doors do not. Initial startup fetches the compact manifest and selected map. Door use fetches only its registered destination payload; neighbouring room data is not downloaded eagerly.

Generated JSON payloads, standalone validators, and schema-derived TypeScript declarations are ignored build outputs. Do not edit them. [Map authoring and verification](docs/MAPS.md) describes units, boundaries, and the earlier map slice. [Interaction authoring](docs/INTERACTIONS.md) covers the added messages and working doors.

## Source boundaries

| Location | Responsibility |
| --- | --- |
| `src/domain/` | Pure movement, collision, facing interactions, finite messages, session inventory/placement transactions, exit-entry guards, and viewport arithmetic |
| `src/runtime/transition.ts` | Single pending transfer, cancellation, and stale-result rejection |
| `src/runtime/session-controller.ts`, `save-service.ts` | Current-session publication, dependency subscriptions, validated checkpoints, slot/import orchestration and atomic candidate activation |
| `schemas/`, `src/content/` | Canonical schemas, generated validators/types, and shared semantic checks |
| `src/platform/map-loader.ts`, `save-repository.ts` | Bounded cancellable map/checkpoint loading and optimistic current/previous IndexedDB records |
| `src/platform/input.ts` | One abortable keyboard/pointer/controller input owner per scene lifetime |
| `src/platform/gamepad-model.ts`, `src/platform/gamepad.ts` | Validated bindings, neutral/edge handling, and one app-owned browser controller adapter |
| `src/presentation/ui/controller-settings.ts` | Semantic controller configuration and bounded-rate telemetry |
| `src/presentation/foundation.ts`, `map-view.ts` | Reusable scene, explicit room visual ownership, safe transitions, camera, and cosmetic particles |
| `src/presentation/ui/player-shell.ts` | Inventory-first player menu, Settings/Debug routes, direct semantic navigation and optional touch overlay |
| `src/presentation/skin/`, `src/presentation/ui/windowskin.ts` | Bounded source-pixel composition, live title measurement, lazy atlas loading and disposal |
| `assets/source/ui/base/` | Exact edited skin, full tile manifest, connector/alpha audit and provenance |
| `src/presentation/ui/interaction-dialog.ts` | Native modal presenter; authored strings remain literal text |
| `src/main.ts`, `src/style.css`, `index.html` | Accessible controls, diagnostics, errors, and responsive page layout |
| `assets/source/` | Original placeholder pixel patterns and provenance |
| `tools/` | Asset generation, schema generation, and validated map compilation |
| `tests/` | Domain, asset, package-policy, map, loader, controller, and production-browser checks |

W1 base-skin integration and M2 state, Inventory, saves, hardening, and residency work are complete locally; optional extra tile renderers and a theme editor remain deferred. Maps, items, facts, placements, conditions, actions, and simple messages are data, not new scene subclasses. M1.6 diagnostics/performance acceptance is recorded; the next packet is U1.1 visual references and semantic UI tokens, followed by the remaining UI foundation and then G1 conditional access.

## Documentation

| Document | Purpose |
| --- | --- |
| [Foundation baseline](docs/BASELINE.md) | Reproduction, measured results, metric limits and consolidated M1 acceptance |
| [Base windowskin](docs/WINDOW-SKIN.md) | Runtime integration, complete tile format, preserved source, known seams and verification |
| [UI visual language and system](docs/UI-DESIGN-SYSTEM.md) | Workshop-fantasy direction, tokens, component/input contracts, responsive rules and staged full-JRPG UI growth |
| [Approved next slices](docs/NEXT-SLICES.md) | Shared state, conditional access, menu navigation and branching-dialogue contracts |
| [Full JRPG build-out strategy](docs/JRPG-BUILDOUT.md) | Detailed route through state, quests, battle, economy, a finishable chapter, scale and release |
| [M2 state and save contract](docs/M2-STATE-SAVES.md) | Implemented conditions/actions, envelope/repository behavior, ownership, failure policy and manual route |
| [Player interface](docs/PLAYER-SHELL.md) | Full-viewport play, black letterboxing, optional tools, input boundaries and verification |
| [Interaction and room travel](docs/INTERACTIONS.md) | Current messages, controls, door lifecycle, compatibility, and tests |
| [Controller recovery](docs/CONTROLLER-RECOVERY.md) | Page-error isolation, activation, diagnostics, and verification |
| [Input and controller configuration](docs/INPUT.md) | Launch focus, controller mappings, safety gates, preferences, and test limits |
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

Browser checks use Chromium on hosted Linux and Windows runners, including software WebGL and Canvas. Narrow viewport checks are not proof of Android/iOS device support. The Phaser-containing chunk is about 1.38 MB minified with a roughly 362 KB Vite-reported gzip estimate; its size warning is deliberately not hidden. Real-device performance, heap/GPU profiling, and other browser engines remain unverified.

**RPGameworks** is the working name; complete naming availability and search performance are not guaranteed. A project license has not been selected. Original placeholder artwork is documented in `assets/source/README.md`; third-party dependencies retain their own licenses. Do not interpret this repository as granting a license to future code or assets.
