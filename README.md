# RPGameworks

**A browser-native JRPG framework with expressive pixel effects.**

RPGameworks is a planned, data-driven 2D RPG construction framework: small rooms and maps, a persistent world, ordinary web source files, and a composable pixel-art effects layer. Build a playable piece, test it, and expand without keeping the entire world alive in memory.

**Current status: design and planning.** This repository currently contains the written project plan, not an implemented engine or playable demo. There is no installation command, test suite, CI pipeline, or deployment to advertise yet.

## The idea

Describe a change in conversation, edit a clear GitHub project, validate the change, and play a browser build. The repository is the initial authoring environment; visual tools can grow over the same formats when they become useful.

The intended foundation is TypeScript/JavaScript, Phaser, Vite, validated JSON content, HTML/CSS interface elements, and browser-local saves. No paid coding agent, proprietary RPG editor, runtime AI service, or game server is required by the design. Development and CI may use Node/npm; players just use a supported browser.

## Design priorities

- **Large persistent world, small active simulations.** Load rooms/regions on demand, keep distant state as data, and make resource ownership explicit.
- **Content that is safe to edit.** Stable IDs, schemas, reference checks, versioned saves, and readable files make incremental authoring manageable.
- **A tight runtime with room for spectacle.** Event-driven RPG rules, bounded caches, and a separate PixelFX layer reserve resources for attractive visual feedback.
- **Playable milestones over engine-first expansion.** Start with two rooms, movement, a conversation, and a small effect. Add persistence, quests, battle, and tools only through tested steps.

These are project goals, not claims of completed capabilities or measured performance.

## Documentation

| Document | Purpose |
| --- | --- |
| [Master plan](docs/PLAN.md) | Product scope, architecture, data model, world lifecycle, RPG rules, saves, performance, and delivery |
| [PixelFX design](docs/PIXELFX.md) | Recipe-based effects, pixel presentation, quality tiers, masks/fragments, and the FX laboratory |
| [Implementation roadmap](docs/ROADMAP.md) | Ordered work packets with observable outcomes and acceptance gates |
| [Current status](docs/STATUS.md) | Actual implementation state and the next task |
| [Research and naming notes](docs/RESEARCH.md) | Verified documentation, dependency baseline, naming caveats, and discovery strategy |
| [Contributor/assistant rules](AGENTS.md) | How to make bounded, testable changes without losing project continuity |

## Next build

Create the first pinned TypeScript/Vite/Phaser application and a crisp logical-resolution scene with a placeholder actor, input, a tiny bounded effect, and build/version diagnostics. Establish real build and test evidence before generating a large subsystem tree.

See [M1 in the roadmap](docs/ROADMAP.md) for the full first-slice acceptance criteria.

## Name and licensing

**RPGameworks** is the working project name. Naming availability and search performance are not guaranteed; the research note records the checks and unresolved observations.

A project license has not yet been selected. This planning commit does not assign a license to future code or artwork. Any third-party assets/dependencies need their own provenance and license records.
