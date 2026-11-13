# Stone Soup monster library

The public-domain monster art RPGameworks ships with ([decision 0015](../../../../docs/decisions/0015-stone-soup-creatures.md)). Dungeon Crawl Stone Soup's tiles are CC0 1.0, so they are the one exception to [decision 0007](../../../../docs/decisions/0007-public-repo-external-art-assets.md)'s "no third-party art in git" rule; LPC and other external art stay local-only.

- `dcss/monster/**.png`: all 1,282 monster tiles, 32 × 32 RGBA. A monster's ID is its path without `.png`, for example `dcss/monster/undead/skeletal_warrior_new`, the same IDs Ariel's Splurt and DanJen Delver projects use.
- `library.json`: one SHA-256 per monster ID. `node tools/import-stone-soup.mjs --check` verifies the folder against it (a unit test runs the same check).
- `CREDITS.md` and `licences/`: the CC0 text, both pack readmes, and the artist credits.

**Provenance.** Imported on November 12, 2026 from Ariel's Splurt project (`assets/tiles/library/`), which copied it on November 10 from Ariel's DanJen Delver project (`J:\Dungeonminusdelver`); the import checked all 1,282 files byte-for-byte against DanJen Delver's copy. DanJen Delver took them from the Stone Soup releases above and re-encoded them as plain RGBA PNGs (visible pixels unchanged; fully transparent pixels have their hidden colour set to zero).

Do not edit these images in place: they are the reference copy. Derived art (posed animation frames, atlases) is baked by tools into other folders.
