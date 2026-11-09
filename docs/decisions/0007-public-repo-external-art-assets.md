# Decision 0007 — Public repository, private external art

**Status:** Policy set by Ariel on November 8, 2026. Planning only: no external asset has been imported, no fetch script exists, and no `.gitignore` change has been made. Execution follows the import plan below after Ariel reviews it.

## Context

RPGameworks is a **public** GitHub repository and is meant to become a free framework others can use. The planned art comes from third-party libraries:

- **LPC character components** (Universal LPC Spritesheet Character Generator). Each component carries its own authors and license options, commonly OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0; a few are CC-BY-SA 3.0 only (for example the spear and recurve bow) or CC-BY 3.0 only.
- **Dungeon Crawl Stone Soup 32×32 tiles**, dedicated to the public domain under CC0 1.0; the pack asks for credit as a courtesy.

Ariel's DanJen Delver project (`J:\Dungeonminusdelver`, private) already has a working LPC import, recipe rules, the PixiPPL reducer (Ariel's own code), a Stone Soup tile library and a sprite-motion system. Its own license review (November 3, 2026) found real credit-packaging gaps: alternative licenses merged into one line, missing component credits, and no record of which license option was chosen.

RPGameworks already has a precedent: `.import/` is ignored and source sheets never enter `dist/`. It also has an exception: the derived Cute Fantasy `starter-hero.rpgpack` is tracked and deployed, and historical commit `846ca06` briefly contained the `.import/` drop.

## Policy

1. **No third-party art in git.** Neither source files nor derived output (reduced sheets, baked packs, atlases, contact sheets, caches) from LPC, Stone Soup or other external libraries is committed to this repository. This applies even where a license would allow it, so contributors do not need to evaluate each file.
2. **We rely on them locally, but we do not redistribute them through the repository.** Ariel's working copy keeps them in ignored folders.
3. **Contributors fetch their own copies.** The repository provides scripts that download each library from its original source at a pinned revision, verify it, and run our offline tools. Anyone who wants the full art fetches it themselves under the upstream terms.
4. **What is committed:** our own code and tools, schemas, recipes and selections (which components a character uses, by ID), pinned revisions and expected file hashes, credit and license-selection metadata, and original or synthetic test fixtures.
5. **The repository must work without external art.** Fresh clones and checks run with placeholder or original fallback art. Tests that need external assets skip with an explicit message and are never reported as passed.
6. **Every derived file records its chosen license per source file**, its authors, and that it was modified (composited, recolored, reduced). Alternatives are never merged into one license line.

## Important boundary: deploying the game is still distribution

Keeping art out of git does **not** remove license obligations when a built game is published. A Pages build or itch.io upload that contains LPC-derived sprites distributes those sprites. That is permitted, but it requires correct attribution, the chosen license per component, and share-alike treatment for derived art where CC-BY-SA was chosen (I am not a lawyer; this records the working understanding, not legal clearance).

This also changes the current hosting design. The manual Pages workflow builds from the repository on a GitHub runner, so it **cannot see private assets**. Before any LPC or Stone Soup art reaches a public build, Ariel must choose one of:

- **A.** Public builds keep using fallback/original art; full art is local-only for now.
- **B.** Build locally with the private assets and deploy that verified artifact, with a generated credits/licenses file shipped inside the build.
- **C.** Let the workflow fetch assets from upstream during the build using the same pinned scripts, with no secrets required.

No option is chosen here. Until one is, public deployments contain no external art beyond what is already deployed.

## Existing exceptions to review (not changed by this note)

- `public/character/starter-hero.rpgpack` (derived from the paid Cute Fantasy pack) is tracked and deployed under the earlier license decision. Whether to keep it tracked, move it behind the same fetch-and-bake flow, or retire it when LPC characters replace it is Ariel's decision.
- Commit `846ca06` remains in history by Ariel's earlier choice. This policy does not rewrite history.

## Import plan (to execute after review)

1. **Ignore rules first.** Add ignored roots before any file is copied, for example `external/` for fetched sources and `generated/external/` (or similar) for derived output, and keep `.import/`. Verify with `git check-ignore` and `git status` that a dry-run copy shows no untracked art.
2. **Pinned manifests.** Commit small JSON manifests per library: upstream URL, revision (LPC: `4963a69795255fb15a934c47f478a8bdcf3668f5`, the revision DanJen pinned), expected per-file SHA-256 hashes for the files we use, and license metadata. Per-file hashes are preferred over archive hashes because hosted archive ZIPs are not guaranteed byte-stable.
3. **Fetch scripts.** Cross-platform Node scripts (`tools/assets/fetch-*.mjs`), runnable on Windows and Unix, with a thin shell wrapper if useful. They download from the original sources only, verify hashes, write only to ignored folders, and refuse to overwrite on mismatch.
4. **Bake tools.** Port DanJen's LPC recipe resolution and reducer adapter to this repository's tools as offline commands, writing only to ignored output. Changing reducer settings requires a new cache version.
5. **Credits generation.** Generate a credits/licenses file from the recipes and selected license options, per source file, with authors and modification notices.
6. **Guards.** A check that fails if tracked files include anything under the external roots or match known external hashes, and a production-build check that only approved outputs enter `dist/`.
7. **Docs.** A contributor guide explaining how to fetch, bake and run with full art, and what works without it.

## Not decided here

- Which hosting option (A/B/C) to use.
- Whether original or CC0 art should ever be committed as the built-in fallback set, and which set.
- The project's own license, which remains Ariel's choice.
