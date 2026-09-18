# Base windowskin source — Ariel edit

This directory contains the selected base skin, not the earlier generated sample.

- `Window.png` is Ariel's exact edited attachment, 192 × 192 RGBA, 3,862 bytes; SHA-256 `2c81d15a1217059fd7c5177b92fffb3a78ca07c0edb305770083e396f645552a`. Its 141 partial-alpha pixels are preserved. No recoloring, repainting, resizing, alpha thresholding, or optimization rewrite was applied.
- The original Midnight Silver design kit was generated for this project in chat; Ariel reduced its decorative emphasis and selected that edit. Commercial reference screenshots were visual references, not extracted artwork.
- `Window.manifest.json` retains every tile/coordinate/role from the companion. Its theme/status/alpha metadata describes the edit; `sourceManifestSha256` identifies the original. Current manifest hash: `c2968d1ed7b7c93c60eaf55b045e0d93217debd141de151940609396ccc29056`.
- Original companion manifest SHA-256: `42fc5a3df1b0efff3f285aa83c1f9efca2f85022ff7b83ad3f17e7817da27a76`; original format explainer SHA-256: `76106326ab8c7db9f2072f68c371f247d62ff6784c6ea0d2ef598701d7f78ae5`. Those identify the conversation kit, not additional required runtime files.
- `Window.audit.json` records known original-profile/shoulder differences. Its checks are specific to this image; old sample validation does not certify the edit. The explicit right-edge connector adapter is documented, and the incompatible right divider attachment is not used in W1.

See [the full production format, coordinate table and implementation](../../../../docs/WINDOW-SKIN.md). Run `node tools/audit-windowskin.mjs` from the repository root to recompute the report. The optional `--write` flag changes only the report. The old Python kit generator regenerates the old sample and MUST NOT overwrite this source. The game does not require Python.

The PNG is canonical source. Vite emits a hashed copy; do not edit generated files. `.gitattributes` preserves binary/manifest/audit identities across Windows and Linux checkouts. Intentional future changes must update provenance, audits, fixtures and any needed metadata together; a changed flourish alone is not a new packing format.

No general redistribution license for project code/art is granted by this import. Licensing remains Ariel's explicit project decision. No font files are bundled here.
