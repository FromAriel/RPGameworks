# RPGameworks — Research, Naming, and Decision Notes

**Checked:** September 17, 2026.

This file distinguishes inspected documentation from proposed project decisions. Sources explain available technology and constraints; they do not establish that RPGameworks has implemented or benchmarked any feature.

## 1. Repository baseline

The connected GitHub API identified `FromAriel/RPGameworks` as a public repository with default branch `main` and write access for the active connection. Its initial root contained only `README.md`, whose content was `# RPGameworks`.

The inspected initial commit was `69cf63ee53662c0e7ddbb988200ac428c4a1bbc9`; its tree was `86ec2534fd03e47b054df1c03beeef7b159986ff`. The planning change expands that README and adds documentation. It does not inherit an existing engine implementation.

Verification method: authenticated GitHub repository metadata, contents, file, branch-ref, and Git-commit reads. Do not treat this dated baseline as the current state after later contributions; inspect the latest branch.

## 2. Technical sources

All linked pages below were opened through web retrieval and returned readable page content on the checked date. This verifies access to those documents, not successful installation, API execution, or a permanent guarantee that a URL will remain available. Some conceptual Phaser pages retain Phaser 3 wording; the installed package and version-specific migration material must settle API details.

### S1 — Phaser release baseline

[Official Phaser download page](https://phaser.io/download) and [Phaser 4.2.1 release page](https://phaser.io/download/release/v4.2.1).

The download page listed 4.2.1. The release page dated that version to July 9, 2026. The plan uses it as an inspected candidate, not an installed dependency. Verify and pin the actual selected package during M1.

### S2 — Phaser 4 renderer and effects changes

[Official Phaser 3 versus Phaser 4 comparison](https://phaser.io/news/2026/05/phaser-3-vs-phaser-4).

This May 13, 2026 article describes the render-node architecture, unified filters, GPU-oriented layers, and breaking changes from older custom pipelines. It supports checking current APIs and considering stock GPU facilities before custom rendering. Vendor performance descriptions are not RPGameworks benchmark results.

### S3 — Scene ownership

[Phaser scenes concepts](https://docs.phaser.io/phaser/concepts/scenes).

The guide distinguishes local scene facilities from shared/global managers. Project implication: define asset and listener ownership explicitly; do not assume stopping a map releases all shared textures or sounds. Verify the exact lifecycle behavior on the pinned release.

### S4 — Particles and textures

[Phaser particle concepts](https://docs.phaser.io/phaser/concepts/gameobjects/particles) and [Phaser texture concepts](https://docs.phaser.io/phaser/concepts/textures).

These describe emitter controls, particle limits, reservation/configuration concepts, and texture management. PixelFX should wrap existing facilities first. Recipe semantics, quality tiers, and budget values are our design, not supplied performance guarantees.

### S5 — Vite static deployment

[Vite static deployment guide](https://vite.dev/guide/static-deploy.html).

The guide explains production builds and repository-subpath configuration for GitHub Pages. The planned project-path base is `/RPGameworks/`; a root/custom-domain deployment needs its own configuration. This planning commit does not create a Vite project or deploy it.

### S6 — WebGL resource/performance guidance

[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Relevant topics include graphics-resource estimates, draw batching, smaller backing buffers, system limits, and avoiding blocking readbacks. The plan's chosen budgets, benchmark scenes, and ownership rules are project proposals. Exact memory reporting and hardware behavior vary.

### S7 — Browser save mechanism

[MDN IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

IndexedDB provides asynchronous, transactional browser storage suitable for the proposed save adapter. Transaction success is not a substitute for exportable backups.

### S8 — Storage limitations

[MDN storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Storage quotas and eviction differ across browsers and circumstances. This supports explicit error handling, optional persistence requests, versioned backups, and user-controlled export/import rather than an absolute durability promise.

### S9 — Hidden-tab lifecycle

[MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

Visibility changes and background throttling matter to the timing design. RPGameworks proposes pausing active gameplay rather than interpreting a hidden tab as a reliable simulation clock.

### S10 — Optional map interchange

[Tiled JSON map format](https://doc.mapeditor.org/en/stable/reference/json-map-format/).

The documented map/tileset representation is an interchange candidate. An importer must define and validate its supported subset. Tiled is not a required editor, and compatibility with every Tiled feature is not promised.

### S11 — GitHub Pages workflows

[GitHub documentation for custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

This provides the hosting/workflow reference. Necessary workflow permissions and repository settings must be verified separately. Repository write access does not prove that Pages is configured or that every administrative operation is available to the connector.

### S12 — Schema validation

[Ajv official documentation](https://ajv.js.org/).

Ajv is the selected candidate for JSON Schema validation. Pick a supported schema dialect and matching versions during implementation; the plan does not include an installed validator.

### S13 — Domain test runner

[Vitest getting-started guide](https://vitest.dev/guide/).

Vitest is the proposed unit/integration test runner. Verify its requirements against the chosen Node/Vite versions and generate real test output.

### S14 — Browser testing

[Playwright installation and introduction](https://playwright.dev/docs/intro).

Playwright is the proposed browser-flow test tool. Automated browser engines and emulated touch/device profiles do not replace tests on the actual phones claimed as supported.

## 3. Naming: RPGameworks

**Working name:** RPGameworks.

Ariel chose the name because it combines recognizable RPG/game elements and appears distinctive. Preserve this capitalization consistently in the repository, documentation, and any future landing page. A proposed descriptive line is: **A browser-native JRPG framework with expressive pixel effects.**

### 3.1 What the search did and did not establish

Exact-name and variant searches were run for `RPGameworks`, including searches excluding GitHub and a search paired with `engine`. The results did not establish a clearly verified competing engine with the exact name.

However, search surfaced a YouTube-indexed result titled `Butchers: Mental Hospital Trailer` displaying `@RPGameWorks`. That spelling differs only in capitalization from the proposed name. The retrieved result resolved only to a generic YouTube URL, and a direct attempt to open the handle failed with a retrieval-disabled error. The channel, ownership, activity, and its relationship to any project were not independently confirmed.

This is an unresolved search-index observation, not proof of a live competing engine, a trademark conflict, or legal rights. It is also sufficient reason not to state that the name is conclusively unused. No domain, package-registry, social-handle, or trademark availability clearance was completed. Do not use an unverified result as a factual claim about another developer.

The technical project can proceed under the chosen working name while preserving the option to revisit branding before wider release. No domain purchase, registration, package publication, or license change is authorized by this planning note.

### 3.2 SEO assessment

A distinctive name can be a useful branding direction, but the embedded strings `RPG` and `game` do not establish an automatic ranking advantage. That is a marketing hypothesis, not a measured outcome.

[S15: Google site-name guidance](https://developers.google.com/search/docs/appearance/site-names) recommends distinctive, concise, consistently used names. It also explains that the site-name feature applies at domain/subdomain level, not arbitrary subdirectories. Therefore a GitHub Pages project subpath is not equivalent to a dedicated root-domain brand site for that feature.

[S16: Google ranking-systems guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide) describes controls against giving excessive credit to exact-match domain wording. This is not a claim that words never matter; it is a reason not to sell keyword fragments as guaranteed search performance.

[S17: Google Search Essentials](https://developers.google.com/search/docs/essentials) is the baseline for crawlable, useful public content. The project's search plan should center on an actual helpful product and documentation, not only its coined name.

### 3.3 Proposed discovery work, after a playable slice

Create a crawlable HTML landing page and documentation, separate from the game canvas. Use a clear title such as `RPGameworks — Browser-Native 2D JRPG Framework`, accurate feature descriptions, and visible links to a demo and source.

Publish a small number of genuinely useful tutorials: adding a map, writing a branching conversation, defining a quest, composing a pixel effect, and understanding the save format. Add screenshots, controls, and text explanations of the demo. Do not advertise unimplemented editors or performance numbers.

Use consistent branding, meaningful page titles, internal navigation, canonical URLs appropriate to the actual deployment, and a sitemap when a real documentation site exists. Consider site-name structured data only where the deployment supports it. Check any domain or account availability at the time of a concrete registration decision.

Measure indexed pages, branded-query discovery, relevant nonbranded queries, demo visits, and useful engagement after launch. None of those measurements exist yet. A recognizable name plus a real demo and clear documentation is the proposed strategy; exceptional ranking is not promised.

## 4. Decisions requiring evidence or owner choice

The following remain open: final project license, final demo narrative/art style, actual supported-device list, exact implementation dependency set, final performance budgets after measurement, deployment configuration, public domain/account choices, and the level of browser-editor investment.

Do not resolve those by fabricating facts. Use the defaults in the plan to build the first slice, document observed constraints, and escalate only decisions that genuinely require the owner's choice.
