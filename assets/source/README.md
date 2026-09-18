# Foundation placeholder assets

`foundation.json` is the canonical source for the first rendering test: twelve small pixel patterns and an RGBA palette. These placeholder patterns were authored specifically for this repository in the September 17, 2026 foundation work. The September 18 interaction slice adds an original caretaker recoloring of our own hero, a doorway, and a brass plaque. The original nine frame names are preserved. They are not copied from commercial games, and no external images, fonts, music, or asset packs are included.

`npm run assets` uses the original source and Node's built-in zlib to generate a PNG atlas and Phaser atlas JSON under `public/generated/`. Generated files are ignored by Git and rebuilt for development, production, and browser tests. The generator validates symbols, frame sizes, and bounds. It has no third-party image-processing dependency.

These are placeholders, not a final art-direction decision. No license is assigned by this file; the project owner has not selected a project/asset license.

## Imported UI skin

The selected user-edited base skin is preserved separately under [ui/base](ui/base/README.md). The foundation-atlas generator does not regenerate or overwrite it. See [WINDOW-SKIN](../../docs/WINDOW-SKIN.md) for its format and explicit connector audit.
