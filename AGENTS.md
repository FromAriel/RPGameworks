# RPGameworks — Contributor and Assistant Working Rules

## Start with current reality

Read `docs/STATUS.md`, the relevant sections of `docs/PLAN.md`, and the current work packet in `docs/ROADMAP.md` before editing. Inspect the actual repository branch and files; do not infer implementation from aspirational documentation or an old conversation.

As of the initial planning change, this repository contains documentation only. Planned npm commands, tests, source folders, hosting, and editor routes do not yet exist.

Ariel sets the project direction. The intended workflow supports ordinary chat-assisted GitHub edits; it must not require a particular paid coding agent or desktop editor.

## Architectural boundaries

1. Keep domain rules and persistent state independent of Phaser, the DOM, storage APIs, audio, and device wall-clock time.
2. Keep authored definitions, persistent deltas, transient simulation, and presentation objects distinct.
3. Make scenes the first loading/simulation boundary. Cached or prefetched content is not active simulation.
4. Give listeners, timers, particles, assets, and async operations explicit ownership, cancellation, and cleanup.
5. Keep PixelFX cosmetic. Effects may not apply damage, grant rewards, advance quests, or consume gameplay random state.
6. Prefer the smallest registered condition/action vocabulary that serves current content. Never evaluate arbitrary JavaScript from JSON.
7. Use stable namespaced IDs and versioned schemas. Renames and save changes need compatibility decisions and fixtures.
8. Reuse the selected framework's tested facilities before replacing them with a custom renderer, ECS, pool, or worker system.

## Work in bounded packets

Choose one player-visible outcome or independently testable subsystem change. Add the relevant content, validation, tests, and failure behavior together. Do not generate dozens of empty classes or introduce an abstraction solely because it might be useful someday.

Prefer data edits when existing semantics express the request clearly. Add a focused engine primitive when that is cleaner than contorting content into a workaround.

Preserve unrelated work. Re-read branch state before writing, use non-forced updates, and reconcile concurrent changes. Follow requested branch/commit handling and existing protections; do not bypass protection or force-push to manufacture success.

Do not silently change framework versions, dependencies, licensing, project scope, or public availability claims. Record a substantial architectural change in a short decision note under `docs/decisions/` when that folder becomes necessary.

## Source and package discipline

Use strict TypeScript and readable, small source files. Pin actual tested dependency versions and generate a real lockfile. Check current version-specific documentation before implementing unfamiliar Phaser APIs; old custom renderer examples may not apply.

Canonical JSON/source assets are the source of truth. Generated bundles and normalized outputs must be reproducible. Validate schemas and cross-file references. Reject unsupported import features explicitly.

Track asset provenance. Do not copy commercial game assets because they are convenient placeholders. A project license remains an explicit owner choice until one is actually selected.

## Testing and reporting

Run the checks available for the packet: source checks, content validation, domain tests, browser flows, production build, and lifecycle/performance fixtures where relevant. Never claim a placeholder script, unexecuted command, or guessed deployment passed.

A GitHub commit is not evidence of a successful build. A successful build is not evidence of deployment or playtesting. Report those outcomes separately, including exact failures and access limitations.

For optimization, retain correctness tests and compare equivalent workloads. Record device/browser, build, scene, quality, and measurement method. Provisional budgets in the plan are targets, not benchmark results.

Preserve old-save fixtures. Test reward idempotence, failed transactions, rapid transitions, cancellation, and resource cleanup. Static dialogue reachability does not prove all quest conditions are satisfiable.

When presenting source-code changes in chat, provide complete changed files rather than fragments when requested by the user. Keep commit summaries focused on actual modifications.

## End each meaningful packet with continuity

Update `docs/STATUS.md` with what works, what was tested, what failed or remains unverified, migration implications, and the next concrete task. Update roadmap checkboxes only when acceptance evidence exists.

Do not rewrite the master plan on every minor change. Keep it a stable architectural reference while STATUS captures current reality.

Default priorities: playable result, correct state, safe persistence, predictable lifecycle, readable content, then additional spectacle. Attractive features that do not serve the current slice belong in the optional backlog.
