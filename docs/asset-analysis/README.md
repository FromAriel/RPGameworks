# Cute Fantasy player sheet: reconstruction map

This is the durable, read-only map for reconstructing a character from the ignored third-party asset drop. The actual machine-readable instance is [cute-fantasy-player.layout.json](cute-fantasy-player.layout.json); its structural contract is [sprite-sheet-layout.schema.json](sprite-sheet-layout.schema.json). Neither file is a runtime importer or permission to bundle the art.

## Provenance and method

- Source master, relative to the repository: `.import/Player_Aseprite_Files/Player_Main_All.aseprite`. SHA-256 is pinned in the layout instance. The companion ZIP contains only this same source file.
- PNG root: `.import/Cute_Fantasy/Player/`. The local pack has 143 Player PNGs (717 PNGs overall); 129 Player PNGs use the full 576×3584 canvas and 14 are smaller specialized sheets. The only local text document is `.import/Cute_Fantasy/read_me.txt`.
- Parsed according to Aseprite's [official binary format specification](https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md): little-endian file/frame/chunk headers, layer chunks `0x2004`, compressed cel chunks `0x2005`, and zlib RGBA pixels. File and frame lengths were checked. Selected cels were reconstructed into the full canvas and compared byte-for-byte after decoding the pack PNGs.
- The master is 576×3584, 32-bit RGBA, eight Aseprite frames at 100 ms, 10 image layers, 74 compressed cels, no groups, no linked cels, no tilemaps, no animation tags, and no slices. The eight Aseprite frames select example appearance combinations; they are **not** eight sequential player-animation frames. The bare body and bare-hands cels are identical across all eight, while clothing/head cels vary.
- Every nonempty cell in the exemplar smaller sheets matched the mapped master row and layer exactly: iron sword 27/27, wooden bow 18/18, iron tools 72/72, fishing rod 51/51, brown horse 24/24. These checks support the row offsets and tool front/behind assignments. Ariel subsequently supplied the animation names, directions, row numbers, and playback frame counts; those labels are not embedded in the Aseprite file.

## Schema semantics for an assembler

All coordinates are zero-based from the top-left. The alignment grid is **64×64 pixels**, nine columns by 56 rows. A full-size PNG shares the master coordinates. Its cell rectangle is `(column×64, row×64, 64, 64)`. This is an export/alignment cell, **not** a 64×64 body or a collision tile: the bare-body pixels across the master occupy about x=24–43 and y=13–40 *within* a cell. Our game currently uses 16×16 gameplay tiles; anchor and depth must be chosen for the game separately, without changing its one-tile collision footprint by accident.

`layers` are in bottom-to-top render order. Preserve the source spelling `accesory` when reading the Aseprite file. `hair` is a mutually chosen hair **or helmet** layer in the observed examples. `hands` has a cel in all eight master frames but its layer is hidden; enabling an extra hands overlay is a deliberate equipment/pose decision, not the master default. `tool_under` and `tool_top` are separate occlusion positions around the body.

`rowBands` partition every row 0–55 and record observed occupied columns in the base cel. Their labels and `labelStatus` retain the original source-analysis evidence: `unlabeled-in-source` means the Aseprite file has no tag or slice naming the band, not that its animation is still unknown. The separate `animations` array is Ariel's supplied playback map. Each entry gives the action name, facing direction (or `null` for directionless actions), master row, and number of frames to play from columns `0..frameCount-1`. Its 56 entries cover every row exactly once. The observed occupied-column counts are a cross-check, not the authority for playback behavior.

The map's `side` direction is a single side-facing row. Whether to mirror it for the opposite horizontal direction is still a runtime/art decision. The Aseprite outer-frame duration of 100 ms describes appearance presets, **not** the speed of these row animations; playback timing and loop/one-shot rules remain to be chosen.

`assetFamilies` use forward-slash paths relative to `source.exportRoot`. `master-grid` means use the PNG row directly. `row-offset` means `masterRow = exportRow + masterRowOffset`; the column stays unchanged. `layerRowRuns` is essential for a split tool: choose the draw layer by its **export** row. Do not render the same tool sheet once behind and once in front, which would duplicate it. For example, `Iron_Sword.png` export rows 0–5 draw at `tool_top` and rows 6–8 at `tool_under`, all offset by +6 into master rows 6–14. The bow, iron-tool, and fishing-rod runs are enumerated in JSON. The brown horse PNG matched master rows 50–55 with a +50 row offset. `unmappedAssets` lists the remaining five special-hand/lantern/torch PNGs, with dimensions but no invented pose or depth mapping; they are not assembler-ready.

`evidence: verified-exemplar` means at least one named sample or the listed specialized sheet matched Aseprite pixels; it does **not** assert that every color variant under a glob was individually compared. `folder-and-dimensions` records a pack family and shared grid without claiming every variant has been pixel-verified. `examplePresets` lists exact full-canvas cel-to-PNG matches for each Aseprite frame. `unmatchedLayerIndices` means no exact **full-canvas** PNG match was found for that cel; smaller tool/mount exports can still match its cells. An absent layer is not the same as an unmatched present cel: `accesory` is absent in frames 1 and 3–7.

## Animation row map and observed spatial blocks

| Master rows | Base occupied columns | Known overlay / status |
|---|---:|---|
| 0–2; 3–5 | 6; 6 | `idle`; `walk`, each down/side/up |
| 6–14 | 4 | `attack_1`/`attack_2`/`attack_3`, first down, then side, then up; iron sword front rows 6–11 and behind-body rows 12–14 |
| 15; 16; 17–19 | 4; 6; 8 | `collapse`; `climb_ladder`; `dodge` down/side/up |
| 20–22; 23–25; 26–28 | 1; 5; 6 | `hold_idle`; `hold_walk`; `jump`, each down/side/up |
| 29–31 | 6 | `ranged_weapon` down/side/up; bow front 29–30, behind-body 31 |
| 32–43 | 6 | `tool_axe`, `tool_pickaxe`, `tool_hoe`, `tool_watercan`, each down/side/up; iron tools repeat two front rows, one behind-body row |
| 44–46; 47–49 | 9; 8 | `fish_cast` down/side/up; `fish_reel` side/down/up; fishing rod repeats two front rows, one behind-body row |
| 50–52; 53–55 | 2; 6 | `mount_idle`; `mount_walk`, each down/side/up |

These labels and direction orders come from Ariel's supplied map, not binary tags. All three `fish_cast` rows (44–46) have a ninth occupied base-layer cell. A pixel comparison of columns 7 and 8 found the **body cells identical in all three rows**. The `Wooden_Fishing_Rod.png` overlay is *not* identical: each pair differs by four pixels, all in a small cyan detail (three pixels disappear and one changes color). Thus the layered frame has a tiny visual change even though the body repeats. Ariel chose to retain that final frame in every cast direction: down=9, side=9, up=9; play columns 0–8.

The larger PNG pack maps to the layer roles as follows: `Player_Base`→`base`; `Feet`→`shoes`; `Legs`→`pants`; `Chest`→`shirt`; `Head/Hair_*` and `Head/Plate_Helmet_*`→the shared `hair` slot; `Accessories`→`accesory`; `Hands/Hands_1_Bare.png`→`hands`; `Player_Mounts/Horse`→`horse`; named sword/bow/iron tools/fishing rod sheets→the specified `tool_under`/`tool_top` row runs. The separate lantern, torch, and special-hand sheets were inventoried but did **not** receive an exact master alignment, so they are intentionally outside the verified row map.

## Reconstruction recipe and remaining gate

1. Select an `animations` entry and a frame column less than its `frameCount`, plus a set of aligned PNG variants. Use the same 64×64 cell rectangle for every full-canvas body/clothing/head layer. Do not advance the Aseprite frame index as if it were animation time.
2. For a smaller mapped tool or mount sheet, subtract its `masterRowOffset` from the master pose row to find its export row. Draw only if that export row and column exist in the selected sheet. Use `layerRowRuns` to place tool pixels behind or in front; use the layer index order for the remaining pieces.
3. Choose hair *or* a helmet for layer 6, optional accessory for layer 7, and decide whether the hidden hands layer is needed for that action. Do not assume every option in the PNG pack exists as an Aseprite example preset.
4. Before wiring a runtime animator, decide side-row mirroring, art-foot anchor, playback durations and loop/one-shot behavior. Test composite ordering on a character with a held item and a mount. These are unresolved authoring decisions, not values supplied by the row map.

The local `read_me.txt` describes use and modification rights for a premium pack but prohibits redistribution or resale of the assets. That is a source claim, not independent proof of purchase or project distribution rights. Keep `.import/` ignored and do not copy the PNGs or `.aseprite` into production assets or a public build until Ariel approves provenance and permitted distribution. This research record contains metadata only.

## License decision (Ariel, September 22, 2026)

- **Pack:** “Cute Fantasy RPG – 16×16 top down pixel art asset pack”, creator **Kenmi** (sold via `kenmiart.carrd.co`; store page `https://kenmi-art.itch.io/cute-fantasy-rpg`).
- **Purchase evidence:** itch.io order **#39717750**, completed **2026-09-22 01:09:55 UTC**, **$2.99 USD** grand total via PayPal. The receipt exists locally as `Details for order #39717750.pdf`/`.docx` inside the ignored drop; the exact rendered receipt is the evidence of record, not this transcription. (Buyer IP/account details from the receipt stay out of tracked metadata.)
- **Recorded terms (from the pack's `read_me.txt`, “License – Premium Version”):** use in commercial or non-commercial projects is allowed, modification is allowed, and **redistribution or resale is prohibited even if modified**. The delivered drop was labelled `Cute_Fantasy_Free.zip` in the receipt, while the paid premium license text above governs it; this naming gap is recorded rather than resolved silently, in case the pack updates its terms with future updates.
- **Reflection for CA-slices:** committing a **derived, game-use pack** (selected cells inside the game's own versioned blob, served as part of the playable game) is treated as project use, not pack redistribution — this is Ariel's recorded position under her purchased license. The source sheets, the Aseprite file, and the ZIPs themselves must never ship in the repository, `dist/`, or the Pages bucket. If any future want rises to redistributing derived art by itself or in a template, that needs an explicit permission re-check with the creator. Attribution will be added to the game's credits work in later packets.
