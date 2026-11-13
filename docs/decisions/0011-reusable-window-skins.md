# Decision 0011 — One reusable, skinnable window system (W1 lineage), skinned Final Fantasy-like

**Status:** Proposed by Claude on November 9, 2026. **Ariel answered every decision (§6) and approved this text on November 9, 2026.** Work starts after the faster-tests packets in [decision 0012](0012-faster-local-tests.md), which Ariel chose to do first. This note supersedes [decision 0010](0010-baked-pixel-frame-windows.md) (baked Pixel Frame windows).

## 1. Why this plan exists

Ariel wanted the battle screen to look like a classic JRPG instead of the dialogue box with battle stats in it, with Final Fantasy as the North Star: **Final Fantasy-like, in Ariel's own design, not a copy.** The project already had the window system for that: W1, a reusable, skinnable, editable frame compositor driven by Ariel's `Window.png` atlas and its manifest ([WINDOW-SKIN.md](../WINDOW-SKIN.md)).

Claude instead built parallel systems three times without asking:

- M5.3c drew the battle windows with hard-coded `PANEL_STYLE` panels.
- W2.1 redesigned the window fill instead of raising the problem.
- W2.3 switched W1 off before the planned parity check, and replaced W1's title area with a bespoke nameplate placed inside the window.

**Extending W1 with new abilities was always fine; building a parallel system beside it was the mistake.** This plan returns every window to W1 and extends it where it lacks capabilities.

## 2. What Ariel requires (November 9, 2026)

- **R0 A framework for other people's games.** RPGameworks is a public repository for building many games, not one. Someone else must be able to recomposite the whole look around different art, sizing and frame shapes, and the window system must adjust intelligently. Optional features (medallions, edge patterns, weathered looks) are tools that are ready when content wants them, for example a rusted, medallioned window when a deep-dungeon chest opens. Most windows will not use most of them.
- **R1 Reusable.** One window system for every window: dialogue, menus, inventory, Save/Load, Settings, confirmations, dividers and battle windows. No bespoke window drawing anywhere.
- **R2 Skinnable.** A look is data: an atlas image plus its manifest. Changing or adding a skin needs no code change.
- **R3 Editable border shapes.** A skin can have thin borders or big, thick, chunky ones. Corner pieces can be decorated and can be larger than the edge band.
- **R4 Patterns and medallions.** Patterns can run along the sides, top and bottom, and are never cut off part-way. Medallions can sit at the middle of an edge to add glint. Both are optional per skin.
- **R5 Title area in the frame.** The top edge has a specific area set aside for the window title, built into the frame shape: title open, title fill, title close. W1 already does this as the "title gap".
- **R6 Automatic adjustment.** Geometry follows the skin:
  - With big corner pieces, the title floats to the middle and fits between them.
  - Thick edges never cover text or controls.
  - Thin edges leave a correspondingly small margin.
  - It works at every window size.
- **R7 Final Fantasy-like skin.** A new skin for this system, in Ariel's design style with a Final Fantasy-like feel. It is skin art, not code that imitates Final Fantasy.

## 3. What W1 already does, and what it lacks (read from the code on November 9)

**Already there.** [paint.ts](../../src/presentation/skin/paint.ts) composes, per window:
- four corners;
- repeating top, side and bottom rails (`spanParts` in [layout.ts](../../src/presentation/skin/layout.ts)): whole 16-pixel repeat tiles, then a plain remainder piece, then one whole mirrored end tile, so a pattern tile is never cut, but the leftover space sits as one plain gap just before the last tile rather than being spread evenly;
- a **title gap** in the top edge (`title.open`, `title.fill`, `title.close`), placed around the measured live title, falling back to a header when the title does not fit;
- side and bottom midpoint medallions (`mid.left`, `mid.right`, `mid.bottom`; `mid.top` exists in the atlas but is unused);
- a tiled interior fill (`fill.plain`, repeated, never stretched);
- dividers with label brackets.

The atlas manifest has 64 named tiles, including unused fill variants, junctions, control nine-slices and icons. Lifecycle, fallback, timeout and disposal are already handled in [windowskin.ts](../../src/presentation/ui/windowskin.ts).

**Missing, which blocks R0, R2, R3 and R6:**

1. **One fixed tile size.** `TILE = 16` is hard-coded in `layout.ts` and `paint.ts`. Every corner, edge and title piece must be exactly 16 × 16, so a thin 4-pixel border or a 32-pixel chunky corner is impossible.
2. **One fixed atlas shape.** `windowskin.ts` rejects anything but a 192 × 192 image, and `tools/audit-windowskin.mjs` only accepts 192 × 192 with an 8 × 8 grid at a 24-pixel pitch.
3. **Content insets are ignored.** The manifest already declares `frame.band` (16) and `frame.contentInsets` (16, 16, 20 top, 16), but nothing reads them. Each window's padding is hard-coded in CSS: the dialogue uses `16px 24px 24px`, or `20px 40px 36px` at 2×; inventory and Save/Load use `--ui-frame-clearance`. Title width limits are also hard-coded (`max-width: calc(100% - 64px)`). A thicker skin would cover text; a thinner one would leave gaps.
4. **One skin, imported directly.** `Window.png` is a static import; there is no way to choose a skin per window or per game.
5. **Page windows only.** The compositor paints element backgrounds. Battle windows on the Phaser canvas cannot use it.
6. **Title placement is fixed.** The title gap's vertical position comes from the title text's centre and a fixed 8-pixel half band. It cannot follow a skin with a different title band height or with corners larger than the band.

**Useful reference.** Ariel's Pixel Frame demonstrator, where these ideas started, is kept as a local, git-ignored copy under `external/reference/pixel-frame-demonstrator/`. Its composer already treats band thickness as data (the bevel profile's length), lets corner art reach past the band with an anchor, spreads motifs evenly between the corners so none is cut (`placeAlong`), and draws a medallion only when it fits between the corners. W3.1–W3.3 take those **geometry rules**; no Pixel Frame code is used.

## 4. The plan

Each packet keeps the existing behaviour for Ariel's current skin byte-for-byte unless a step says otherwise, and adds tests. **Any execution question not settled here stops the work until Ariel answers.** Tests use the tiers from decision 0012.

### W3.0 — Undo the W2 detour (D1, D2)

- Revert `9b1017b` (W2.3), `7cc6cb5` (W2.2) and `43546a9` (W2.1) with `git revert`, newest first, which keeps history. The game mounts W1 again on every page window, with the title gaps.
- Battle windows go back to M5.3c's hard-coded `PANEL_STYLE` panels until W3.5. Ariel accepted that temporary look.
- The Pixel Frame port leaves the game entirely (`src/presentation/pixel-frame/`, `tools/bake-frames.ts`, the UI theme file and schema, the frame manifest code and their tests).
- Where the revert conflicts with the 0012 test packets (tags, `package.json` scripts), keep 0012's changes and tag the restored W1 specs. Add the restored W1 titled-window scenario to `@smoke`, and remove `window-frames.spec.ts` from the untagged-spec exemption in `tools/check-test-tags.mjs`.
- Mark decision 0010 superseded by this note.

**Acceptance:**
- `npm run validate` and `npm run check` pass.
- The restored W1 window spec, and the inventory, save, dialogue-scroll, UI gallery and battle specs pass.
- STATUS records the revert.

### W3.1 — Skin manifest format v2: the shape is data

Extend the manifest so a skin declares its own geometry instead of the code assuming 16 × 16:

- **Atlas and tiles:** atlas size; per-tile rectangles of any size (already listed per tile); no fixed grid or pitch required.
- **Band thickness per side:** top, right, bottom, left.
- **Corner piece sizes,** independent of the band. Corners may overhang **inward** only (D10); a manifest with outward overhang fails validation with a clear message until a skin needs it.
- **Rail periods,** taken from each repeat tile's own length.
- **Rail spacing mode per rail (D8):** `mirrored-end` (today's rule, the default) or `even` (whole pattern tiles spread evenly between the corners, with the leftover space shared out between them, never a partial tile).
- **Title area:** sizes of `title.open`, `title.fill` and `title.close`; the title band height; and where the title text's centre line sits in that band.
- **Midpoints (medallions):** optional per side, including `mid.top` on windows without a title (D9); each has a minimum edge length before it appears and is drawn only when it fits between the corners.
- **Content insets (D5):** derived from bands, corners and title band, plus a small margin; a skin may override them. Ariel's current skin declares its existing values (top 20) as overrides so it stays byte-identical.

Rules:
- Version 1 manifests stay valid. A v1 manifest is read as v2 with today's values, so Ariel's current skin keeps working unchanged.
- Add a JSON schema and a validator, generated like the content schemas.
- Generalise `audit-windowskin.mjs` to the v2 shape. It keeps the strict checks for Ariel's current file.

**Acceptance:**
- The current `Window.png` and manifest validate as v1 and as their v2 reading.
- Invalid v2 manifests fail with precise messages: overlapping tiles, tiles outside the atlas, missing required roles, impossible corner and band combinations, outward overhang.
- Unit tests cover all of the above.

### W3.2 — Geometry from the skin, not from `TILE = 16`

- `layout.ts` and `paint.ts` take every size from the skin's v2 geometry: corners, band per side, rail periods, title pieces and midpoints.
- `spanParts` takes the tile's period instead of 16, and implements both spacing modes.
- Oversized corners are drawn over the rails at their declared anchors, and rails start and stop where the corners end.

**Acceptance:**
- **Golden test:** for Ariel's current skin, composed bitmaps are identical to today's at a fixed set of sizes and titles.
- **Fixture skins:** small synthetic test skins (thin 4-pixel band, thick 24-pixel band, 32-pixel chunky corners, wide title pieces, an even-spaced pattern rail) compose with no gaps, overlaps, cut patterns or stretched ornaments at odd and even sizes.
- Unit tests cover all of the above.

### W3.3 — Automatic content and title fitting

- The compositor computes, per window, the **content rectangle** (inside the bands, corners and title band, plus the margin) and the **title slot** (between the corner pieces and title brackets).
- It publishes both as CSS custom properties on the element, in CSS pixels including `--skin-scale`.
- Window CSS uses those properties for padding and title width, instead of hard-coded padding and `calc(100% - 64px)`.
- When the title does not fit its slot, the existing header fallback is used, with the header placed below the content-top inset.

**Acceptance (browser):**
- With each fixture skin, no text or control box overlaps any frame pixel. This is checked from element geometry against the published insets.
- The title is centred between the corners and inside the title area.
- Long titles fall back cleanly.
- Narrow phone widths and 2× scale both work.
- **Look test:** captures of the same windows with the thinnest and the thickest fixture skin are shown to Ariel.

### W3.4 — Choosing skins in content

- A UI theme entry in the game content lists the available skins by ID and names the default skin for each window surface (dialogue, menu, inventory, saves, Settings, confirmation, battle).
- **A single window can ask for a skin by ID** (for example a chest popup in a deep dungeon asking for a rusted skin), overriding its surface default.
- Only content authors choose skins for now; an in-game choice is a later feature (§7).
- The exact format is brought to Ariel for approval at the start of this packet, before code.
- Skins live as source assets beside the current one, each with provenance.
- The loader loads only the skins in use, once each, with the existing fallback and timeout.

**Acceptance:**
- Changing the theme entry re-skins the named surfaces with no code change; a per-window skin request shows that skin only on that window.
- An unknown skin, missing image or invalid manifest fails validation at build time, or falls back at runtime with the existing notice.

### W3.5 — Battle windows on the same system

- The same compositor composes battle windows for the Phaser canvas.
- One canvas texture per distinct window size and title is cached for the battle and released when the battle ends.
- Battle windows use the same skin data and content insets as page windows. They show frames only, no titles, for now (D7); titles stay available.
- This replaces M5.3c's `PANEL_STYLE`.
- Text placement inside battle windows uses the published content rectangle instead of the fixed `PAD`.

**Acceptance:**
- The battle browser spec passes unchanged.
- Display-object and texture counts return to their baseline after battles.
- Screenshots with Ariel's current skin and with a fixture skin are shown to Ariel.

### W3.6 — The Final Fantasy-like skin (art)

> **Outcome (November 12, 2026, Ariel):** the baked **White and Silver** skin is this skin. Ariel asked for a soft blue that bands smoothly across the window, settable and baked in. That added one W1 ability, `geometry.fill.stretch` (approved by Ariel), and a `gradient` recipe fill (top to bottom by default; up, left and right settable). It is the default on all six surfaces; Midnight Silver stays available. Acceptance in play is Ariel's.

> **Changed (November 9, 2026, [decision 0013](0013-skin-recipes-and-bake-tool.md), approved by Ariel):** make this skin as a recipe baked by a skin bake tool (packets B1–B3, optionally a studio page B4) instead of a hand-written drawing script. The output is still an ordinary v2 skin, Claude still drafts, Ariel still edits, and the acceptance below is unchanged.

- A new atlas and manifest for this system, in Ariel's design style with a Final Fantasy-like feel: a thin pale bevel over a blue interior.
- **Claude drafts it with a small Node drawing script** (using `pngjs`, already a dev dependency, so no new toolchain): 16-pixel corner pieces and notches, longer bands for the bigger parts, composited into one sprite sheet in the v2 format. **Ariel edits the result.** The script and the edited PNG are both kept, and the edited PNG becomes canonical, as with the current skin.
- Fill: a repeating banded tile to start (D4). Richer fills are a later W1 addition (§7).
- It uses the title area, corners, rails and medallions like any other skin.
- The art follows the same provenance, audit and source-preservation rules as the current skin.

**Acceptance:** Ariel accepts the art in play. It becomes the default for every surface, and silver-and-midnight stays available as the second skin (D6).

### W3.7 — Clean-up

- Confirm no W2 code remains.
- Update [WINDOW-SKIN.md](../WINDOW-SKIN.md) to describe format v2, fitting rules, spacing modes and skin selection.
- Update [UI-DESIGN-SYSTEM.md](../UI-DESIGN-SYSTEM.md) and STATUS.
- Mark ROADMAP W2 as superseded by W3.

## 5. Working rules for W3

- Each packet is done exactly as written here. If the text does not decide something, or a step proves impossible, Claude stops and asks Ariel before writing code.
- No parallel or bespoke window drawing. New abilities go into W1.
- Ariel's current `Window.png` stays canonical and byte-identical.
- Tests run locally only (no GitHub Actions). Each packet runs the checks named in its acceptance list and reports exact results.

## 6. Ariel's answers (November 9, 2026)

| | Question | Answer |
| --- | --- | --- |
| **D1** | Revert scope | Revert all of W2 (W2.1–W2.3) now. Battles may use the old hard-coded panels until W3.5. |
| **D2** | Pixel Frame code afterwards | Remove it from the game. The demonstrator stays Ariel's separate tool; a local reference copy is kept, untracked. |
| **D3** | Who draws the Final Fantasy-like skin | Claude drafts it with a simple drawing script and composites the sprite sheet; Ariel edits it. |
| **D4** | The fill | Start simple with a repeating banded tile. Extending W1's fill is welcome later (§7). |
| **D5** | Content insets | Derived from the skin's geometry plus a small margin, with optional overrides. Look-test between the smallest and largest skins. |
| **D6** | Default skin | Final Fantasy-like on every surface; silver-and-midnight kept as the second skin. |
| **D7** | Battle window titles | Frames only for now; adjust when battle work resumes. |
| **D8** | Pattern spacing | Keep today's rule as the default; add even spacing as a per-rail option. Patterns are never cut. |
| **D9** | Medallions and the title | Medallions are optional per skin and per side; a top medallion appears only on windows without a title. |
| **D10** | Corner overhang | Inward only for now; outward as soon as a skin needs it. |
| **D11** | Skin choice | Per-surface defaults in content, plus a per-window skin request. Content authors only for now. |

### Decided during W3.1 (Ariel, November 9, 2026)

- **Content margin:** derived insets are the deepest inward reach of any frame piece on a side (band, corners, title band at the top, an enabled medallion) **plus a 4-pixel default margin**; a skin may set `contentMargin` or exact `contentInsets`.
- **Reusing art:** a tile may say `"same": "<id>"` instead of a rectangle. Overlap checks consider only real rectangles, so an accidental overlap is still an error.
- **Gap fill is data:** each rail declares how plain gaps are filled, either a plain tile (`gapFill.tile`) or a stretch of its own first or last pixel row or column (`gapFill.railEdge`). Ariel's right edge declares `railEdge: "start"`, which is today's derived connector in `paint.ts`.
- **Runtime unchanged in W3.1:** the format, reader, validator, audit and tests land first; the compositor starts reading v2 in W3.2 behind its byte-identical golden test.
- **Shared module language:** the reader is plain JavaScript with JSDoc types (`src/presentation/skin/skin-manifest.mjs`), so the audit tool runs under plain Node 22 and 24 and TypeScript still checks it.

### Decided during W3.3 (Ariel, November 9, 2026)

- **Padding = the skin's inset + each window's own spacing.** Side and bottom padding is `--skin-inset-*` plus the extra each window already had over Ariel's insets (dialogue +8, or +8 sides and +4 bottom at 2×; confirmation and gallery +16; compact layouts +2; inventory, Save/Load and the Settings panel +0, with +4 at the Settings bottom). Ariel's windows look exactly as before; a thicker skin pushes content in and a thinner one lets it out.
- **Fixture skins in the browser** use a skin parameter on `mountWindowskin(root, skin)`; the game passes Ariel's skin, and the test-only UI gallery mounts each fixture skin through it. No test hook enters the game.
- **Implementation notes** (no new decision): the top padding still places the title on the frame's top edge, so with the title in the gap the loader measures where content would start and publishes `--skin-title-clearance`, which each window heading adds below itself (0 for Ariel's skin); insets are measured in whole skin pixels from the element's edges, because the bitmap stops less than one scale step short of the right and bottom edges.

### Decided for W3.4 (Ariel, November 9, 2026)

- **Theme entry:** `game.json` gains `uiThemeFile` (like `itemsFile`). That versioned file lists skins by ID (`<game>:skin.<name>`) with the path to each skin's manifest, relative to `assets/source/ui/` and never leaving it, and names a default skin for each surface. The content build validates every skin (the v2 reader and the atlas size), copies each atlas and manifest into the generated content under hashed names, and the game loads only the skins in use, once each. A game without `uiThemeFile` uses Ariel's skin everywhere.
- **Six surfaces:** `dialogue`, `inventory` (the window the Menu button opens), `saves`, `settings` (the Settings panel and its section divider), `confirmation`, `battle` (validated now, used from W3.5). A future menu screen adds its own surface name.
- **Per-window skin:** a map message or a dialogue graph may name a skin (`"skin": "<skin id>"`); the dialogue window uses it while showing that message or dialogue, then returns to its surface default. An unknown skin ID fails the content build.

### Decided for W3.5 (Ariel, November 9, 2026)

- **Help line grows to fit the skin:** the help window is as tall as one text line inside the battle skin's insets (52 px with Ariel's skin: 20 + 16 + 16; Claude first misstated this as 40), never less than 24, and the turn timeline moves down with it.
- **Bottom band grows to fit:** it keeps 136 px when the skin leaves room for five 20-pixel rows (Ariel's does exactly), and grows upward for a thicker skin.
- **Fallback:** if the battle skin cannot load, M5.3c's blue panels and exact layout are drawn instead, and the battle stays playable.

## 7. Future directions (recorded, not scheduled)

- **Richer fills in W1:** a stencil or texture pattern repeated across the interior; a two-point gradient (point 1 and point 2 with their colours), so a blend can run at any angle, corner to corner or corner to the middle of the bottom.
- **A skin studio:** a screen with most of the Pixel Frame demonstrator's controls (colour, light angle, wear and rust) that **bakes a new skin atlas** the window system then uses like any other skin. Weathering and lighting stay baked into art, never computed per frame. Until then, weathered looks are separate skins.
- **Outward corner overhang,** when a skin needs it.
- **In-game skin choice** in Settings, for players.
- **Layout recomposition for other games:** moving or resizing whole screens (where battle windows sit, menu structure) from content. This is a separate, larger feature than skin geometry.
