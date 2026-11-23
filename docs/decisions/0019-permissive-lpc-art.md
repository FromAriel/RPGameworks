# 0019 — Permissive LPC art in the repository

**Status:** Approved by Ariel on November 19, 2026. Planning only; no LPC file has been imported yet. It amends [decision 0007](0007-public-repo-external-art-assets.md) for LPC character art, as [decision 0015](0015-stone-soup-creatures.md) did for Stone Soup creatures. Everything else in 0007 stands.

## Context

- **Why 0007 kept external art out:** it was a precaution for the project's start. It kept anything from being baked in by accident while dependencies arrived and the direction settled (Ariel, November 19).
- **Today's party art:** the party is still drawn with tiny 32 × 32 placeholder figures, in battle (at 2×), in the turn timeline and in the menu portraits.
- **The art the plan calls for:** [Decision 0006](0006-battle-system-direction.md) plans animated LPC party battlers, and [decision 0008](0008-32px-world-scale.md) chose the reduced LPC set: 64-pixel cells reduced to 41 pixels inside a 48 × 48 frame by Ariel's PixiPPL reducer. Each figure is about 29–32 pixels tall, with its feet near (24, 40).
- **Licences:** LPC parts carry their own licences, often several options per file, for example "OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0".
  - **At the pinned revision:** 517 of the 657 parts offer a non-share-alike option for every file.
  - **Licences vary inside a part:** the base body offers OGA-BY 3.0 for the male, female, teen and child bodies, but only CC-BY-SA 3.0 or GPL 3.0 for the muscular and pregnant ones.
  - **Polearms:** every LPC polearm is CC-BY-SA only: spear, long spear, halberd, trident, dragon spear, scythe and cane.

## Decision

1. **Allowed licences.** An LPC source file may be committed when it offers at least one of these: **CC0, CC-BY 3.0, CC-BY 4.0, OGA-BY 3.0 (or 3.0+)**. We choose that option for the file. A file whose only options are CC-BY-SA or GPL is never committed or baked.
2. **Checked per file, by the tool.** The import tool checks every source file a recipe uses (body type, animation, variant), not the part as a whole, and refuses anything outside the list. Content validation repeats the check.
3. **Only what we use.** We commit only the source sheets our recipes need, at the pinned revision `4963a69795255fb15a934c47f478a8bdcf3668f5`, never the whole library. A committed manifest records each file's path, SHA-256, chosen licence, authors and source URLs.
4. **Credits.** A generated credits file lists every file used: its authors, the licence chosen, its URLs, and "modified: composited, recoloured, reduced". It is committed, shown in the in-game Credits screen next to Stone Soup's, and shipped in every build.
5. **Our tools, reproducible output.**
   - **The port:** DanJen Delver's LPC generator (recipe rules, recolouring, layer compositing) and the PixiPPL reducer adapter, both Ariel's code, move into this repository's tools.
   - **The bake:** the content build makes the party art from the committed sources, as it does the creature art.
   - **The settings:** the same as DanJen's: layer alpha preserved, final alpha threshold 128, offset (3, 0).
   - **The check:** output is verified against DanJen's existing reduced cache for the same files.
6. **Original art goes in as project art.** Layers Ariel draws are original work and are committed under the project's terms; the first is the Lancer's spear. They must be drawn new, not edited or traced from a share-alike sheet. The permissive body sheets (OGA-BY) are fine to draw on and to use for timing.
7. **The Lancer's weapon, for now.** Until Ariel's spear is ready, the Lancer is drawn with the arming sword and the slash animation, like the Hero. The rules do not change: the Lancer's weapon is still the Spear (pierce, reach). The art is swapped when the spear layer arrives.
8. **Public builds.** These characters are committed, so GitHub Pages builds show them, with their credits. This settles roadmap S1.7 for them. Any other external art still waits on S1.7.

## Animations for battle

Facing left and right (both are needed in a pincer). Most use the standard 64-pixel LPC cells, reduced to 48. **Correction (S1.5a):** a sword's attacks exist only as oversized actions. The arming sword's slash is `slash_128`, 128-pixel cells reduced to 96. So the Hero, and the Lancer for now, need 96-pixel frames placed by the feet. The bow's shoot and the staff's spellcast are standard. LPC's hurt animation has a single row.

| Use | LPC animation |
| --- | --- |
| Standing | idle (or combat idle, chosen in the previews) |
| Stepping in | walk |
| Hero, and the Lancer for now | slash |
| Lancer, with Ariel's spear | thrust |
| Archer | shoot |
| Mage | spellcast |
| Hit, and fallen | hurt |

## Packets (roadmap S1.5)

- **S1.5a — Import and tools:**
  - the allowed-licence check per file;
  - importing the selected sheets with their manifest and credits;
  - the generator and reducer ported;
  - output checked against DanJen's cache;
  - tests.

  No change in the game.
- **S1.5b — Designs:** preview sheets of candidate looks for the four members, for Ariel to choose from. The chosen recipes (part IDs and colours) are committed as content.
- **S1.5c — Bake and credits:**
  - the content build bakes battle sheets and portraits;
  - the Credits screen lists the LPC credits;
  - a member without baked art falls back to today's placeholder.
- **S1.5d — Battle and menus:**
  - animated party battlers (idle, stepping in with the weapon's action, hurt, fallen, facing either way);
  - timeline icons;
  - portraits on the hub cards, Status and Formation.
- **S1.5e — The Lancer's spear:** Ariel's original spear layer (thrust, plus walk and hurt if needed) replaces the temporary sword.

## Execution notes (S1.5a, November 19)

- **Resolve at import (Ariel's choice):** the generator's part definitions (layers, paths, z-order, colour options) are GPL-3.0, so they stay in the local LPC checkout. DanJen's recipe rules (`tools/lpc/rules.mjs`, unchanged) run only in the import tool. The repository keeps what our recipes resolve to: each action's ordered layers, the colour ramps (lists of hex colours), and per-file credits.
- **Import:** `npm run lpc:import` reads a prepared LPC folder in DanJen Delver's layout (default `J:/Dungeonminusdelver/assets/lpc` or `$LPC_SOURCE`) and `assets/source/lpc/recipes.json`.
  - **Licence check:** every file must have an allowed licence in the generator's per-file `CREDITS.csv`, or nothing is written.
  - **Credit lookup:** a file's own row; else, for a colour variant, its animation sheet's row; else, for an oversized action's variant, its folder's rows, only when they all agree.
  - **Source check:** each file is checked against DanJen's pinned import hashes.
  - **Output:** `sheets/` (byte for byte), `manifest.json` and `CREDITS.md`.
- **Ports:**
  - **Reducer:** `src/content/lpc/pixippl-reducer.mjs` is DanJen's esbuild bundle of the PixiPPL reducer, byte for byte below a provenance header. It is excluded from type checking and must not be edited here.
  - **Bake:** `src/content/lpc/bake.mjs` ports DanJen's bake worker (sheet reduction, frame reuse, oversized cells and their offsets), recolouring, compositing, binary alpha, and the generator's frame assembly for standard and oversized actions.
- **Verification:** the import records references from DanJen's own reduced cache (per file, the RGBA hash) and generator (every frame of each action, left and right). The tests reduce and composite from the committed files alone and match every reference. The probe gives 28 files and 40 reference frames: idle, walk, hurt and the oversized slash, with a recoloured body and pants.
- **The probe:** a test character (male body, head, leather armour, pants, boots, arming sword). It is replaced by the party's designs in S1.5b.

## Execution notes (S1.5b, November 22)

- **Previews:** `npm run lpc:preview` (`tools/lpc/preview.mjs`) renders the designs in `assets/source/lpc/candidates.json`.
  - **The same checks as the import:** the shared `tools/lpc/resolve.mjs` applies the recipe rules and the per-file licence check.
  - **Output:** a single self-contained `external/lpc-preview/index.html` (ignored by git), showing the animations at battle size.
  - **Choices offered:** three designs per member.
- **Ariel's choices**, now `recipes.json`:

| Member | Design |
| --- | --- |
| Hero | C, the Captain: black hair, maroon tabard over white, dark trousers, arming sword |
| Archer | A, the Ranger: green hood, green shirt under leather armour, leggings, quiver, bow |
| Lancer | A, the Guard: full steel plate and armet helm, blue tabard, arming sword until Ariel's spear |
| Mage | B, the Sorceress: white hair, purple dress, purple celestial moon hat, simple staff |

- **What the catalog allows:**
  - **No idle:** many older parts (belts, tunics, tabards, the quiver) have no idle animation, and each chosen design wears one. So all four stand on their walk's first frame; the actions are a walk, the attack and hurt.
  - **Bow:** it walks only as the oversized `walk_128`.
  - **Staffs:** only the simple staff (CC0) has a spellcast.
  - **Tunic:** female only.
- **A bug in DanJen's cache, worked around here:**
  - **The fault:** the bow's `walk_128` sheets are 128-pixel frames, but DanJen's cache records and reduces them as 64-pixel cells. That scatters the bow above the archer's head, and DanJen's generator draws them the same way.
  - **The fix here:** the import now takes a file's cell size from the action that uses it, not from DanJen's record.
  - **References:** where the two disagree there is no DanJen reference, and the manifest says why. The tests check that sheet's geometry instead, and that the archer's walk keeps the bow close to the body.
  - **DanJen itself** is unchanged (read only).
- **Result:**
  - **Files:** 113 sheets (559 KB, all OGA-BY 3.0, OGA-BY 3.0+, CC0 or CC-BY 3.0) and 10 colour ramps.
  - **Checks:** 111 sheets reduce exactly as DanJen's cache did, and 136 frames match DanJen's generator.
  - **The probe** is gone.

## Execution notes (S1.5c, November 22)

- **Portraits (Ariel's choice):** upper body, front-facing. Each is the walk's first frame facing the viewer, cut to a 28-pixel square from just above the figure's top. A tall hat is trimmed instead of pushing the face out: the crop never starts above row 8.
- **Linking members to art:** a party member names its LPC character with `art` (`party.json`; the demo's four do). Battle rules never see it: `battleEncounter` drops it, and presentation looks it up by member ID.
- **The bake** (`src/content/party-atlas.mjs`): the content build bakes, for each such member:
  - **walk and attack:** facing left and right;
  - **hurt:** a single row in LPC;
  - **standing:** a frame each way, the walk's first, since there is no idle;
  - **portrait:** as above.

  **Output:**
  - **Files:** one hashed `party-art.<hash>.png` and frame table `party-art.<hash>.json`, named in `game.json` as `partyArtFile`. That is 158 frames for the demo.
  - **Layout:** frames are shelf-packed by size, with a 1-pixel gutter.
  - **Placement:** each animation records its frame size, frame time and feet anchor, (24, 40) in a 48-pixel frame, centred the same way in larger ones.
  - **Integrity:** every sheet is checked against its manifest hash before it is reduced.
- **Credits:**
  - **Credits screen:** gains an LPC tab: an About entry (licences used, never share-alike, the source) and the 23 artists. It is built from `assets/source/lpc/CREDITS.md`, which the import now writes with an introduction, a source link and an `## Artists` list above the per-file list.
  - **Builds:** every build ships the per-file credits as `generated/content/lpc-credits.md`.
  - **NOTICE:** lists the LPC sheets as third-party material.
- **Build time:** a content build now takes about 3 seconds (it reduces all 113 sheets). The authoring-report test, which runs three builds, has a 30-second limit.
- **Not yet:** nothing draws the art yet. Battles, the timeline and the menus still show the placeholders, which stay the fallback when a member has no art or the atlas fails to load. S1.5d draws it.

## Execution notes (S1.5d, November 22)

Ariel's choices:
- **Attacking:** a member steps in and strikes. The existing lunge stays, and the weapon's animation plays over it.
- **A fallen member:** lies down (the hurt animation's last frame) and is dimmed, as defeated foes are.
- **Portrait crop:** 20 pixels, not 28, so the 40-pixel menu boxes draw it at exactly 2×.

What was built:
- **Loading:** `src/platform/party-art-loader.ts` loads and checks the frame table and image once per build and caches them.
  - **Menus:** draw from the image.
  - **Battles:** add a texture they own and remove when they end.
  - **Fallback:** if the art cannot load, or a member has no `art`, the member keeps its placeholder frame. The scene loads the art when it starts, so the menus have it before the first battle.
- **Battle:**
  - **Placement:** each frame stands its feet 28 pixels below the battler's centre, where the placeholders' feet are, using the anchor the bake records. Oversized frames (the sword's slash, the bow's walk) line up the same way.
  - **Facing:** a member faces left, or right in a pincer when it last fought the rear flank, using LPC's own right-facing rows rather than a mirror image.
  - **Animations:**
    - **Attack and skills:** the attack animation plays over 70% of the step, the area skills included.
    - **Hits:** a hit shows a flinch for a moment; a fall plays the hurt animation to lying down, then dims.
    - **Move:** walks to the new cell.
    - **Run:** walks away to the right.
  - **Skipping playback:** ends the animations and shows each member's resting frame.
- **Turn timeline:** a member with art shows its portrait, at 1×.
- **Menus:**
  - **Hub cards and Status:** the head-and-shoulders portrait at 2×.
  - **Formation grid:** a 40-pixel cut of the standing figure facing the enemies, centred on its feet, so the bow's 96-pixel walk frame works too.
- **Runtime snapshot:** the art `source` is `'lpc'` for these members.

## Execution notes (S1.5f, November 23)

The map hero question is answered. Ariel's choices:
- **The Cute Fantasy starter hero is retired.** The LPC party leader walks the map.
- **Size:** the same reduced 41-pixel figure as in battle, about the old hero's height, so one bake serves both.
- **Standing frame:** LPC's at-rest walk column (feet together), on the map **and** for battlers at rest. The bake had left it out, because a standard walk's stepping cycle skips it, so S1.5d's battlers stood mid-stride.
- **Next characters:** Mara and the Gallery archive clerk get LPC looks chosen from previews (S1.5g), and turn to face the hero while you talk.

What was built:
- **Bake:** the party atlas adds each member's walk facing up and down and a standing frame each way (`<id>/stand/<way>`), and cuts the portrait from the front standing frame. The bow's oversized walk already lists its at-rest frame first, so its standing frames match its walk's first. 240 frames, up from 158.
- **Map:** `src/presentation/map-hero-view.ts` draws the party's first member.
  - **Standing:** its standing frame for the way it faces.
  - **Walking:** that way's own row, at one stride per tile (an LPC walk cycle is two strides). A 50 ms grace keeps the walk going across tiles while a direction is held.
  - **Placement:** feet on the bottom edge of the tile, where the old hero's were.
- **Textures:** `addPartyTexture` takes an owner. The map's texture lives as long as the app (reused across scene restarts); a battle's is its own and removed when it ends, so leaving a battle never takes the map hero's art.
- **Fallback:** a game without a party roster or party art, or whose art fails to load, keeps the placeholder hero. A failure shows the old warning ("Character art could not load; the original hero remains playable").
- **Removed:**
  - `public/character/starter-hero.rpgpack`;
  - the character pack v1 format of [decision 0003](0003-character-pack-v1.md): its reader, format rules and schemas, encoder and starter-hero tools, appearance-selection validator, fixtures and tests;
  - the old layered hero view;
  - the Starter hero credit and its NOTICE entry.

  The pack stays in git history, and the Cute Fantasy analysis docs under `docs/asset-analysis/` remain as a record.
- **Snapshot:** `heroArt` is `'static' | 'lpc'`; `heroFrame` names the atlas frame; `heroMirrored` is gone, since nothing is mirrored.

## Still open

- **Looks:** body types, colours and hair are chosen from the S1.5b previews.
- **The project's licence,** which also covers Ariel's original art: still Ariel's choice, as before.

## Reference: the spear and combat animations

The pinned revision of the generator's repository:
- **Spear (CC-BY-SA, look only, don't trace):** [folder](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/tree/4963a69795255fb15a934c47f478a8bdcf3668f5/spritesheets/weapon/polearm/spear). It has `foreground/` and `background/` layers, each with `thrust/`, `walk/` and `hurt/`, one sheet per colour variant.
- **Body animations (OGA-BY):** the [male body folder](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/tree/4963a69795255fb15a934c47f478a8bdcf3668f5/spritesheets/body/bodies/male) holds `thrust.png`, `combat_idle.png`, `slash.png`, `shoot.png`, `spellcast.png`, `hurt.png` and `walk.png`.
- **Sheet layout:** cells are 64 × 64, with one row per direction (up, left, down, right) and one column per frame.
- **Local copies:** `J:\Dungeonminusdelver\assets\lpc\source\spritesheets\` (same revision).
- **Live generator:** the [online generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) previews any combination animated. It runs a newer revision than the pinned one.
