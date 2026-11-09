# Decision 0008 — 32-pixel tiles and a 640 × 360 logical view

**Status:** Direction set by Ariel on November 8, 2026. Planning only: the game still runs at 320 × 192 with 16-pixel tiles, and no migration has started.

## Context

The current world uses 16-pixel tiles in a 320 × 192 logical view (`WIDTH`/`HEIGHT` in `src/presentation/foundation.ts`, `TILE` in `src/presentation/map-view.ts`, and `"tileSize": 16` in each map). The planned art is 32-pixel:

- **Stone Soup** tiles and creatures are 32 × 32.
- **LPC characters** reduced by Ariel's PixiPPL pipeline (64-pixel cells × 0.64) give about 41 pixels of content in a **48 × 48 frame**, with the figure itself about 29–32 pixels tall and feet near (24, 40). Oversized attack frames become 96 or 144 pixels.
- 32 × 32 is also the most widely available open tile size, which matters for a framework others will use.

At 32-pixel tiles, the current 320 × 192 view would show only 10 × 6 tiles, and a side-view battle with a party of four in three rows plus several enemies would not fit.

## Decision

- The world moves to **32-pixel tiles**.
- The logical view becomes **640 × 360** (16:9): 20 × 11¼ tiles. It enlarges by whole numbers to 1280 × 720 (×2) and 1920 × 1080 (×3), keeping pixels crisp under the existing integer-scaling policy.
- Exploration and battle share the same logical resolution.
- Characters use 48 × 48 frames anchored at the feet on 32-pixel tiles. Taller-than-tile characters are normal and are drawn by foot anchor and row, not clipped to the tile.

## Consequences

- **Movement, collision, interaction and saves are tile-based**, so map coordinates, spawns, exits and saved checkpoints keep their meaning. The migration should not need a save-format change; that must be confirmed by the existing save fixtures.
- **Existing demo maps** declare `"tileSize": 16`. They need either re-authored 32-pixel art or a defined transitional rule. Workshop is 20 × 12 tiles, which becomes 640 × 384: slightly taller than the view, so the camera follows vertically.
- **The generated foundation atlas** (16-pixel frames) and the PixelFX recipes and caps were tuned at the old scale and need review.
- **The Cute Fantasy starter hero** was tuned for 16-pixel tiles. Its anchor, scale and its future relative to LPC characters need a visual decision.
- **DOM UI** (windowskin, menus, dialogue) is separate from the canvas resolution and should be unaffected apart from layout checks at the new size.
- **Character pack format:** the v1 reader caps frames at 128 × 128. 48- and 96-pixel frames fit; 144-pixel oversized attacks would need a deliberate, versioned format change ([0003](0003-character-pack-v1.md)).
- **Performance:** four times the pixels per view. Existing benchmarks are the M1.6 baseline at 320 × 192 and must be re-measured after the change, not assumed.
- **Captures:** U1 reference screenshots of the canvas will change; DOM-only captures should not.

## Migration outline (separate packets, after review)

1. Make tile size and logical view configurable from content/game data instead of constants, keeping 16-pixel behavior passing.
2. Switch the logical view to 640 × 360 with the existing letterboxing and integer scaling, and rerun layout and browser checks.
3. Introduce 32-pixel tiles with fallback/original art that can be committed, so the public build keeps working without external assets ([0007](0007-public-repo-external-art-assets.md)).
4. Migrate the demo maps and confirm old saves still load to the same tiles.
5. Re-baseline benchmarks and UI captures at the new scale.

## Not decided here

- Whether the demo maps are redrawn at 32 pixels or replaced by new maps.
- The committed fallback tile set used when external art is absent.
- Whether the Cute Fantasy hero is kept alongside LPC characters.
