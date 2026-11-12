# Foundation placeholder assets

`foundation.json` is the canonical source for the first rendering test: small pixel patterns and an RGBA palette. These placeholder patterns were authored specifically for this repository in the September 17, 2026 foundation work. The September 18 interaction slice adds an original caretaker recoloring of our own hero, a doorway, and a brass plaque; the M2 conditional-state slice adds a repository-authored glowing/read variant of that plaque. The original nine frame names are preserved. They are not copied from commercial games, and no external images, fonts, music, or asset packs are included.

**32-pixel conversion (November 8, 2026, S1.4):** the world moved to 32-pixel tiles ([decision 0008](../../docs/decisions/0008-32px-world-scale.md)). `foundation.json` now declares `"cellSize": 32`, and every frame was converted once by exact 2× pixel doubling of the previous 16-pixel originals (the 2 × 2 spark became 4 × 4). Nothing was redrawn, so the look is unchanged; frames can now be detailed natively at 32 pixels, and new symbols can be added as content needs them. This set is the committed **fallback** that keeps fresh clones and public builds playable without external art ([decision 0007](../../docs/decisions/0007-public-repo-external-art-assets.md)).

`npm run assets` uses the original source and Node's built-in zlib to generate a PNG atlas and Phaser atlas JSON under `public/generated/`. Generated files are ignored by Git and rebuilt for development, production, and browser tests. The generator validates symbols, frame sizes, and bounds. It has no third-party image-processing dependency.

These are placeholders, not a final art-direction decision. They are original project art and are covered, like the rest of the repository, by the [Apache License 2.0](../../LICENSE); see [NOTICE](../../NOTICE) for the third-party exceptions.

## Imported UI skin

The selected user-edited base skin is preserved separately under [ui/base](ui/base/README.md). The foundation-atlas generator does not regenerate or overwrite it. See [WINDOW-SKIN](../../docs/WINDOW-SKIN.md) for its format and explicit connector audit.
