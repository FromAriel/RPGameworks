# Decision 0013 — Skin recipes and a bake tool that writes ordinary W1 skins

**Status:** Proposed by Claude and **approved by Ariel on November 9, 2026, with every §7 recommendation accepted** (baked skins committed beside their recipes; the studio page before W3.6; the core lit path first, then wear and rust; each recipe beside its skin). Not started; it follows W3.4 and W3.5. It changes how [decision 0011](0011-reusable-window-skins.md) W3.6 (the Final Fantasy-like skin) is made, and turns 0011 §7's "skin studio" into a planned track.

## 1. Why

Ariel's Pixel Frame demonstrator (local reference copy under `external/reference/pixel-frame-demonstrator/`) can composite a wide range of frame designs from a few settings: bevel profile, corner and ornament art, palette themes, light angle, wear. RPGameworks is a reusable framework, so its developers should be able to make many window skins quickly, bake them, and use them like any other skin.

**W2 was the wrong way to use it:** it put the Pixel Frame engine inside the game as a second window system, and its 9-slice bake threw away the title shape and the medallions. **This plan is the opposite:** the engine becomes an *authoring tool* whose only output is an ordinary v2 window skin (an atlas PNG plus its manifest, [WINDOW-SKIN.md](../WINDOW-SKIN.md), decision 0011 W3.1). The game never knows a skin was baked.

## 2. Principles

1. **The game only consumes v2 skins.** No game code imports the bake tool, and no lighting or compositing runs at play time. W1 (`skin-manifest.mjs`, `layout.ts`, `paint.ts`) stays the one window system.
2. **Hand-made skins are first-class.** An artist can draw an atlas in any pixel editor, write or edit its manifest, and check it with `tools/audit-windowskin.mjs`, without ever touching the bake tool. Ariel's current skin is exactly that.
3. **The tool is swappable.** A developer can replace it, extend it, or ignore it; the contract between tool and game is the v2 format and its validator, nothing else.
4. **Recipes are the source for baked skins.** A baked skin must be reproducible from its recipe. If someone hand-edits a baked atlas, the edited PNG becomes the canonical source (like Ariel's current skin), and its recipe is kept only as history.
5. **Every baked skin passes the same gates** as a hand-made one: `readSkinManifest` and the audit tool. A bad bake fails before it ships.
6. **Deterministic and dependency-free.** The same recipe gives the same bytes; no new dependency (Node, the existing zlib PNG writer or `pngjs`, already a dev dependency).
7. **Provenance and licence.** The Pixel Frame code is Ariel's own work and takes the repository's licence (decision 0010 §2, Ariel November 9). The port records its origin.

## 3. Extension points this leaves open (not planned)

- **Artist skins:** any atlas plus manifest; the tool is optional.
- **Animated skins:** a future manifest version could list frame sequences per tile (a glinting medallion, a pulsing title bracket), with the compositor choosing a frame by time. Nothing in this plan blocks that; it would be its own decision, because it adds a frame loop to the window system.
- **Other bake tools:** a developer's own generator only has to write a valid v2 skin.

## 4. The packets

### B1 — Recipe format

- A versioned, schema-validated **skin recipe** (JSON) describing a skin as settings, not pixels: band thickness per side, bevel profile (heights from the outer edge inward, as in Pixel Frame), corner art and its size, optional edge motif (pattern) with its period and spacing mode, optional medallions per side, title piece widths, colours (a named theme or one base colour generating hue-shifted ramps), light angle and elevation, palette steps, outline and shadow, interior fill (flat or a repeating banded tile), divider style, and the content margin.
- Corner, motif and medallion art come from a small built-in library ported from Pixel Frame (notch, rivet boss, square boss, plate corner, gem boss, rosette, fleur, scroll, medal, rivet) **or from a PNG** using Pixel Frame's documented colour conventions (transparent = empty, magenta = cut, grey brightness = height, red = gem, orange or yellow = accent, blue or teal = dark inlay).
- Schema and generated validator like the content schemas; recipes live as source files beside the skins they produce.
- *Addendum (November 12, 2026, at Ariel's request):* `colors.frame` and `colors.accent` ramps override the starting theme's frame and accent colours, and a corner, motif or medallion can set `material: "accent"` so the whole piece is drawn in the accent colours (for example a white frame with silver corners).

**Acceptance:** example recipes validate; invalid recipes fail with precise messages (unknown art, a profile thicker than the band, corner art larger than allowed, impossible colours); unit tests.

### B2 — Bake core

- Port the Pixel Frame core to strict, DOM-free code under `tools/skin-bake/`, **as tool code, never imported by the game**: profile sweep, art stamps and corners, normals, lit shading, palettes and one-colour themes, PNG art import. The earlier W2 port (git history, `43546a9`) and the reference copy are the starting points.
- Instead of a 9-slice frame, bake **each W1 role as its own tile**: the four corners lit individually (light from one side makes them differ), rail tiles per side at their pattern period, plain gap tiles, `title.open`, `title.fill`, `title.close`, medallions per enabled side (top and bottom separately), divider pieces, and the interior fill tile.
- Pack the tiles into an atlas with transparent gutters and write a v2 manifest (rects, band, title centre and gap, rail spacing and gap fill, medallions, insets), then run `readSkinManifest` and the audit on the result.

**Acceptance:** every example recipe bakes to a skin that passes the reader and the audit; baking twice gives identical bytes; baked skins compose cleanly at odd and even sizes with the W3.2 fixture checks; the relevant Pixel Frame engine checks are carried over as unit tests.

### B3 — Batch bake command

- `npm run skins` bakes every recipe in the skins folder in one run and reports each result; `--check` bakes in memory and fails if a committed or generated output differs (where outputs live is §7 Q1).
- A baked skin can then be named in the W3.4 theme entry like any other skin.

**Acceptance:** one command bakes all recipes; a broken recipe fails with its file and message and leaves the other outputs untouched; `--check` catches a stale output.

### B4 — Skin studio page

- A separate page, built like the test-only UI gallery and never part of the game build: pick a recipe, change its settings with controls modelled on Pixel Frame's (theme, base colour, light dial, flair, ornament size, profile, wear), and **see real windows composed by W1** (dialogue, menu, Save/Load, divider, a battle-sized panel) at 1× and 2×, through `mountWindowskin(root, skin)`.
- Save the recipe as JSON; baking stays the B3 command, so the page never writes into the repository.

**Acceptance:** browser checks that changing a setting re-bakes and re-composes the preview, that a saved recipe bakes identically with B3, and that the page is absent from the game build.

### Then: W3.6 through the tool

W3.6 (the Final Fantasy-like skin) becomes a recipe: a thin pale bevel over a blue interior, tuned by Ariel in the studio (or by editing the recipe), baked by B3, then hand-edited by Ariel if wanted. This replaces 0011 D3's "Claude draws tiles with a script" while keeping its intent (Claude drafts, Ariel edits). W3.6's acceptance is unchanged: Ariel accepts the art in play.

## 5. Order

W3.4 (skin choice in content) and W3.5 (battle windows on W1) first, as planned in 0011, so baked skins have somewhere to go and battles use the same system. Then B1 → B2 → B3 → B4 (the studio, before W3.6 per §7 Q2), then W3.6 through the tool. W3.7 (clean-up and docs) closes both tracks and documents the recipe format beside v2.

## 6. Working rules

Same as 0011 §5: each packet exactly as written; any undecided step stops for Ariel; no bespoke window drawing in the game; tests run locally and each packet reports exact results.

## 7. Questions for Ariel

| | Question | Claude's recommendation |
| --- | --- | --- |
| **Q1** | Where do baked skins live: committed beside their recipes (reviewable, like any art), or generated at build time into ignored output? | **Committed.** Skins are art: a developer or artist should see, diff and hand-edit them, and the game build should not need the bake tool. `--check` keeps them in step with their recipes. |
| **Q2** | Studio page (B4) before W3.6, so you can tune the Final Fantasy-like skin interactively, or after it? | **Before W3.6.** Tuning colours and light by editing JSON is slow; the studio pays for itself on the first skin. |
| **Q3** | How much of Pixel Frame's lighting comes in B2: the core lit path (profile, normals, shading, palettes, one-colour themes), or also wear and rust, gem glow and brushed metal? | **Core lit path first**, with wear and rust as the next small addition (they are what makes a weathered dungeon skin), and gem glow and brushed metal later. |
| **Q4** | Recipe location: beside the canonical skins (`assets/source/ui/skins/<name>/recipe.json` with the baked `Window.png` and manifest), or a separate recipes folder? | **Beside each skin**, so a skin's recipe, atlas, manifest and audit sit together. |

## 8. B4 execution answers (Ariel, November 12, 2026)

| | Question | Answer |
| --- | --- | --- |
| **B4-Q1** | The studio's wear control needs a recipe setting; add wear to the format in B4? | **Yes.** Optional `light.wear` (0–1, default 0) and `light.tarnish` (default true), using the restored shading's existing wear pass. Existing skins are unchanged. |
| **B4-Q2** | Pixel Frame's flair (full, subtle, off): a recipe field, or a studio shortcut? | **Studio shortcut only.** It edits the recipe's own corner, motif and medallion fields; the saved recipe stays explicit and the format gains no flair field. |
| **B4-Q3** | Bake in the page, or through a local bake server? | **In the page.** File reading and PNG writing move out of the bake and reader into Node wrappers, so one bake core runs in `npm run skins` and in the studio; tests compare their pixels. |
| **B4-Q4** | Where does the studio run? | **Locally only**, `npm run studio`, on its own port like the UI gallery. Never in the game build and never published. Saving downloads `recipe.json`; `npm run skins` bakes it. |
