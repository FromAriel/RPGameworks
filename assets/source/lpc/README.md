# LPC character art

The LPC character sheets this project uses, under [decision 0019](../../../docs/decisions/0019-permissive-lpc-art.md).

## What is here

- `recipes.json`: the party as LPC parts and colours, chosen by Ariel (S1.5b), then the map characters Mara and the Gallery archive clerk (S1.5g), who have only a walk. This is the file to edit. A map object stands as one of these characters with `"character": "<id>"`.
- `candidates-map.json`: the S1.5g candidates for the map characters, previewed with `npm run lpc:preview -- --candidates assets/source/lpc/candidates-map.json`.
- `candidates.json`: design candidates for `npm run lpc:preview`, which renders them into `external/lpc-preview/index.html` (ignored) with the same recipe and licence checks as the import.
- `sheets/`: the source sheets those recipes use, byte for byte from the [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) at revision `4963a69795255fb15a934c47f478a8bdcf3668f5`. Only these files are kept, never the whole library.
- `manifest.json`: written by the import tool.
  - **Per file:** its hash, its cell size, the licence we use and its authors.
  - **Per character and action:** the layers and colour ramps it resolves to.
  - **References:** values from DanJen Delver's reduced cache, which the tests compare against.
- `CREDITS.md`: the credits for every file, also written by the import tool.
- `reduction.json`: the PixiPPL reducer settings (64 to 41 pixels in a 48-pixel frame; decision 0008).

## The licence rule

Every file must offer CC0, CC-BY 3.0/4.0 or OGA-BY 3.0. We use that licence, and credit every author.
- **Never:** a file whose only options are CC-BY-SA or GPL.
- **Checked per file:** the import tool checks each file a recipe uses and refuses the whole import otherwise, so nothing is written.
- **Spears:** every LPC polearm is share-alike only, so the Lancer's spear will be original art.

## Changing a character

The import needs a local, prepared LPC folder in DanJen Delver's layout: the generator source, its part index and its reduced cache. The generator's part definitions are GPL-3.0, so they stay there; only what our recipes resolve to is kept here.

```bash
npm run lpc:import -- --lpc J:/Dungeonminusdelver/assets/lpc
```

`$LPC_SOURCE` can name the folder instead. Then run `npx vitest run tests/unit/lpc.test.ts`. It checks every sheet's hash, licence and credit, and that our reducer and compositing match DanJen's pixel for pixel. It reads only the files in this folder.
