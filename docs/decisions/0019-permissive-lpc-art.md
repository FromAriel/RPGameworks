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

All use the standard 64-pixel LPC cells (reduced to 48), facing left and right (both are needed in a pincer). The oversized-frame question from S1.5 is avoided for now.

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

## Still open

- **The map hero:** the walking hero on the map is the Cute Fantasy starter pack. Should it become the LPC Hero too, or stay as it is?
- **Looks:** body types, colours and hair are chosen from the S1.5b previews.
- **The project's licence,** which also covers Ariel's original art: still Ariel's choice, as before.

## Reference: the spear and combat animations

The pinned revision of the generator's repository:
- **Spear (CC-BY-SA, look only, don't trace):** [folder](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/tree/4963a69795255fb15a934c47f478a8bdcf3668f5/spritesheets/weapon/polearm/spear). It has `foreground/` and `background/` layers, each with `thrust/`, `walk/` and `hurt/`, one sheet per colour variant.
- **Body animations (OGA-BY):** the [male body folder](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/tree/4963a69795255fb15a934c47f478a8bdcf3668f5/spritesheets/body/bodies/male) holds `thrust.png`, `combat_idle.png`, `slash.png`, `shoot.png`, `spellcast.png`, `hurt.png` and `walk.png`.
- **Sheet layout:** cells are 64 × 64, with one row per direction (up, left, down, right) and one column per frame.
- **Local copies:** `J:\Dungeonminusdelver\assets\lpc\source\spritesheets\` (same revision).
- **Live generator:** the [online generator](https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/) previews any combination animated. It runs a newer revision than the pinned one.
