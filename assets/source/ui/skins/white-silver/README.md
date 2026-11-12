# White and Silver window skin

The game's default window skin for every surface (dialogue, inventory, saves, settings, confirmation, battle), chosen by Ariel on November 12, 2026.

- `recipe.json` is the source: a white frame ramp, a darker cool silver accent ramp, and the carved corner drawn in the accent colours (`"material": "accent"`). `corner.png` is the 10 × 10 corner art made for this project in decision 0013 B1, in Pixel Frame's colour conventions (grey brightness = height).
- `Window.png`, `Window.manifest.json` and `Window.audit.json` are **baked** by `npm run skins` (decision 0013 B3). Change the recipe and re-bake rather than editing them by hand; `npm run skins -- --check` fails if they no longer match the recipe. A hand-edited atlas is possible, but then remove `recipe.json` so the bake does not overwrite the edit.
- All of it was made in this project; no external or commercial art was used. Licensed with the project (Apache-2.0).
