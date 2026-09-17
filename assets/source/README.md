# Foundation placeholder assets

`foundation.json` is the canonical source for the first rendering test: nine small pixel patterns and an RGBA palette. These placeholder patterns were authored specifically for this repository in the September 17, 2026 foundation work. They are not copied from commercial games, and no external images, fonts, music, or asset packs are included.

`npm run assets` uses the original source and Node's built-in zlib to generate a PNG atlas and Phaser atlas JSON under `public/generated/`. Generated files are ignored by Git and rebuilt for development, production, and browser tests. The generator validates symbols, frame sizes, and bounds. It has no third-party image-processing dependency.

These are placeholders, not a final art-direction decision. No license is assigned by this file; the project owner has not selected a project/asset license.
