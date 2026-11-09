# external/ — local third-party art (never committed)

This folder holds third-party art on your own machine: fetched library sources (for example LPC character components and Dungeon Crawl Stone Soup tiles) and anything derived from them (reduced sheets, baked packs, atlases, caches).

Everything here except this README is ignored by git. RPGameworks is a public repository and does not redistribute third-party art, in original or derived form. See [decision 0007](../docs/decisions/0007-public-repo-external-art-assets.md).

- **Getting the art:** pinned fetch scripts that download each library from its original source are planned ([ROADMAP S1.2](../docs/ROADMAP.md#s1--world-scale-and-external-art-planned)). They do not exist yet.
- **Licenses still apply:** you obtain the art under its upstream terms. A build that contains this art distributes it, so check attribution and share-alike obligations before publishing one.
- **Without this folder:** the repository builds, tests and plays with fallback art.
- **Guard:** `npm run check:external-art` fails if any file under `external/`, `public/external/` or `.import/` is tracked or staged. It runs as part of `npm run check`.
