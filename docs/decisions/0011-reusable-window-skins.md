# Decision 0011 — One reusable, skinnable window system (W1 lineage), skinned Final Fantasy-like

**Status:** Proposed by Claude on November 9, 2026, at Ariel's request. **Not approved. Nothing in this plan may start until Ariel has answered the decisions in §6 and approved the plan.** When approved, it supersedes [decision 0010](0010-baked-pixel-frame-windows.md) (baked Pixel Frame windows).

## 1. Why this plan exists

Ariel wanted the battle screen to look like a classic JRPG instead of the dialogue box with battle stats in it, with Final Fantasy as the North Star: **Final Fantasy-like, in Ariel's own design, not a copy.** The project already had the window system for that: W1, a reusable, skinnable, editable frame compositor driven by Ariel's `Window.png` atlas and its manifest ([WINDOW-SKIN.md](../WINDOW-SKIN.md)).

Claude instead built parallel systems three times without asking:

- M5.3c drew the battle windows with hard-coded `PANEL_STYLE` panels.
- W2.1 redesigned the window fill instead of raising the problem.
- W2.3 switched W1 off before the planned parity check, and replaced W1's title area with a bespoke nameplate placed inside the window.

This plan returns every window to the W1 system and extends that system where it is missing capabilities, instead of replacing it.

## 2. What Ariel requires (November 9, 2026)

- **R1 Reusable.** One window system for every window: dialogue, menus, inventory, Save/Load, Settings, confirmations, dividers and battle windows. No bespoke window drawing anywhere.
- **R2 Skinnable.** A look is data: an atlas image plus its manifest. Changing or adding a skin needs no code change.
- **R3 Editable border shapes.** A skin can have thin borders or big, thick, chunky ones. Corner pieces can be decorated and can be larger than the edge band.
- **R4 Patterns and medallions.** Patterns can run along the sides, top and bottom. Medallions can sit at the middle of an edge to add glint.
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
- repeating top, side and bottom rails, with a mirrored terminal tile fit rule (`spanParts` in [layout.ts](../../src/presentation/skin/layout.ts));
- a **title gap** in the top edge (`title.open`, `title.fill`, `title.close`), placed around the measured live title, falling back to a header when the title does not fit;
- side and bottom midpoint medallions (`mid.left`, `mid.right`, `mid.bottom`; `mid.top` exists in the atlas but is unused);
- a tiled interior fill (`fill.plain`, repeated, never stretched);
- dividers with label brackets.

The atlas manifest has 64 named tiles, including unused fill variants, junctions, control nine-slices and icons. Lifecycle, fallback, timeout and disposal are already handled in [windowskin.ts](../../src/presentation/ui/windowskin.ts).

**Missing, which blocks R2, R3 and R6:**

1. **One fixed tile size.** `TILE = 16` is hard-coded in `layout.ts` and `paint.ts`. Every corner, edge and title piece must be exactly 16 × 16, so a thin 4-pixel border or a 32-pixel chunky corner is impossible.
2. **One fixed atlas shape.** `windowskin.ts` rejects anything but a 192 × 192 image, and `tools/audit-windowskin.mjs` only accepts 192 × 192 with an 8 × 8 grid at a 24-pixel pitch.
3. **Content insets are ignored.** The manifest already declares `frame.band` and `frame.contentInsets`, but nothing reads them. Each window's padding is hard-coded in CSS: the dialogue uses `16px 24px 24px`, or `20px 40px 36px` at 2×; inventory and Save/Load use `--ui-frame-clearance`. Title width limits are also hard-coded (`max-width: calc(100% - 64px)`). A thicker skin would cover text; a thinner one would leave gaps.
4. **One skin, imported directly.** `Window.png` is a static import; there is no way to choose a skin per window or per game.
5. **Page windows only.** The compositor paints element backgrounds. Battle windows on the Phaser canvas cannot use it.
6. **Title placement is fixed.** The title gap's vertical position comes from the title text's centre and a fixed 8-pixel half band. It cannot follow a skin with a different title band height or with corners larger than the band.

## 4. The plan

Each packet keeps the existing behaviour for Ariel's current skin byte-for-byte unless a step says otherwise, and adds tests. **Any execution question not settled here stops the work until Ariel answers.**

### W3.0 — Undo the W2 detour (scope per decision D1)

- Revert `9b1017b` (W2.3) with `git revert`, which keeps history. The game then mounts W1 again on every page window, with the title gaps.
- Then, per D1, either revert `7cc6cb5` (W2.2) and `43546a9` (W2.1) now, or keep battle windows on W2.2 only until W3.5 replaces them.
- Mark decision 0010 superseded by this note.

**Acceptance:**
- `npm run validate` and `npm run check` pass.
- The window, inventory, save, dialogue-scroll and UI gallery browser specs pass on W1, using the W1 specs from before W2.3.
- STATUS records the revert.

### W3.1 — Skin manifest format v2: the shape is data

Extend the manifest so a skin declares its own geometry instead of the code assuming 16 × 16:

- **Atlas and tiles:** atlas size; per-tile rectangles of any size (already listed per tile); no fixed grid or pitch required.
- **Band thickness per side:** top, right, bottom, left.
- **Corner piece sizes,** independent of the band, so corners can overhang inward or outward.
- **Rail periods,** taken from each repeat tile's own length.
- **Title area:** sizes of `title.open`, `title.fill` and `title.close`; the title band height; and where the title text's centre line sits in that band.
- **Midpoint rules:** minimum edge length before a medallion appears.
- **Content insets:** either declared, or derived from bands, corners and title band (D5).

Rules:
- Version 1 manifests stay valid. A v1 manifest is read as v2 with today's values, so Ariel's current skin keeps working unchanged.
- Add a JSON schema and a validator, generated like the content schemas.
- Generalise `audit-windowskin.mjs` to the v2 shape. It keeps the strict checks for Ariel's current file.

**Acceptance:**
- The current `Window.png` and manifest validate as v1 and as their v2 reading.
- Invalid v2 manifests fail with precise messages: overlapping tiles, tiles outside the atlas, missing required roles, impossible corner and band combinations.
- Unit tests cover all of the above.

### W3.2 — Geometry from the skin, not from `TILE = 16`

- `layout.ts` and `paint.ts` take every size from the skin's v2 geometry: corners, band per side, rail periods, title pieces and midpoints.
- `spanParts` takes the tile's period instead of 16.
- Oversized corners are drawn over the rails at their declared anchors, and rails start and stop where the corners end.

**Acceptance:**
- **Golden test:** for Ariel's current skin, composed bitmaps are identical to today's at a fixed set of sizes and titles.
- **Fixture skins:** small synthetic test skins (thin 4-pixel band, thick 24-pixel band, 32-pixel chunky corners, wide title pieces) compose with no gaps, overlaps or stretched ornaments at odd and even sizes.
- Unit tests cover all of the above.

### W3.3 — Automatic content and title fitting

- The compositor computes, per window, the **content rectangle** (inside the bands, corners and title band) and the **title slot** (between the corner pieces and title brackets).
- It publishes both as CSS custom properties on the element, in CSS pixels including `--skin-scale`.
- Window CSS uses those properties for padding and title width, instead of hard-coded padding and `calc(100% - 64px)`.
- When the title does not fit its slot, the existing header fallback is used, with the header placed below the content-top inset.

**Acceptance (browser):**
- With each fixture skin, no text or control box overlaps any frame pixel. This is checked from element geometry against the published insets.
- The title is centred between the corners and inside the title area.
- Long titles fall back cleanly.
- Narrow phone widths and 2× scale both work.

### W3.4 — Choosing skins in content

- A UI theme entry in the game content names the skin used by each window surface (dialogue, menu, inventory, saves, Settings, confirmation, battle). The format is to be approved with this packet.
- Skins live as source assets beside the current one, each with provenance.
- The loader loads only the skins in use, once each, with the existing fallback and timeout.

**Acceptance:**
- Changing the theme entry re-skins the named surfaces with no code change.
- An unknown skin, missing image or invalid manifest fails validation at build time, or falls back at runtime with the existing notice.

### W3.5 — Battle windows on the same system

- The same compositor composes battle windows for the Phaser canvas.
- One canvas texture per distinct window size and title is cached for the battle and released when the battle ends.
- Battle windows use the same skin data, title area and content insets as page windows.
- This replaces M5.3c's `PANEL_STYLE`, or W2.2 if it was kept.
- Text placement inside battle windows uses the published content rectangle instead of the fixed `PAD`.

**Acceptance:**
- The battle browser spec passes unchanged.
- Display-object and texture counts return to their baseline after battles.
- Screenshots with Ariel's current skin and with a fixture skin are shown to Ariel.

### W3.6 — The Final Fantasy-like skin (art)

- A new `Window.png` and manifest for this system, in Ariel's design style with a Final Fantasy-like feel: for example a thin pale bevel and a blue interior.
- It uses the title area, corners, rails and medallions like any other skin.
- Who draws it is decision D3. The fill style is decision D4.
- The art follows the same provenance, audit and source-preservation rules as the current skin.

**Acceptance:** Ariel accepts the art in play. It becomes the default for the surfaces she chooses (D6).

### W3.7 — Clean-up

- Remove whatever W2 code remains, or keep it only as an offline art tool (decision D2).
- Update [WINDOW-SKIN.md](../WINDOW-SKIN.md) to describe format v2, fitting rules and skin selection.
- Update [UI-DESIGN-SYSTEM.md](../UI-DESIGN-SYSTEM.md) and STATUS.
- Mark ROADMAP W2 as superseded by W3.

## 5. Working rules for W3

- Each packet is done exactly as written here. If the text does not decide something, or a step proves impossible, Claude stops and asks Ariel before writing code.
- No parallel or bespoke window drawing.
- Ariel's current `Window.png` stays canonical and byte-identical.
- Tests run locally only (no GitHub Actions). Each packet runs the checks named in its acceptance list and reports exact results.

## 6. Decisions Ariel needs to make before W3 starts

| | Question | Claude's recommendation |
| --- | --- | --- |
| **D1** | Revert scope: revert W2.3 only, keeping battle on W2.2 until W3.5; or revert W2.1–W2.3 now, so battle goes back to M5.3c's hard-coded panels until W3.5? | Revert all three now. It leaves one window system in the code, and the temporary battle panels are already known. |
| **D2** | Pixel Frame afterwards: remove its port from the game entirely, or keep it only as an offline tool for drafting atlas tiles? | Remove it from the game; keep pixelstudio as Ariel's separate tool. |
| **D3** | Who draws the Final Fantasy-like skin: Ariel; Claude drafts tiles for Ariel to edit; or a generated draft from Pixel Frame for Ariel to edit? | Claude drafts in the exact v2 format, Ariel edits, as with the current skin. |
| **D4** | The fill: a repeating banded tile (stripes that repeat down the window), a plain tile, or an addition to W1's fill step that blends from a top colour to a bottom colour across the whole window? | A repeating banded tile: it needs no new code. |
| **D5** | Content insets: declared by each skin in its manifest, or derived from its bands, corners and title band, with optional overrides? | Derived, with optional per-skin overrides. |
| **D6** | Which surfaces use the Final Fantasy-like skin by default, and should Ariel's silver-and-midnight skin stay available as a choice? | All surfaces Final Fantasy-like; silver-and-midnight kept as a second skin. |
| **D7** | Do battle windows show titles (for example "Items" on the item list), or only frames? | Frames only for now, with titles available later. |
