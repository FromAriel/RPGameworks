# 0003 — Character pack v1 binary format

**Date:** September 22, 2026. **Status:** implemented for synthetic pixels (CA1 slice); real-pixel adoption is separately gated on Ariel's approval of the selected derived pack.

## Context

The character integration plan (docs/CHARACTER-ASSET-INTEGRATION.md, CA1) requires selected Cute Fantasy player cells to ship as one versioned binary blob fetched by the static game — never as `.aseprite` files, source PNGs, ZIPs, or base64 in JS. The format must be reproducible from tracked inputs, strictly validated before any pixel is exposed, bounded against hostile input (decompression bombs, truncation, digest lies), and extensible to the layer/animation catalog without a second format.

## Decision

One pack format, "character pack v1", implemented by three files:

- **Framing + pure rules:** `src/platform/character-pack-format.mjs` (shared by tool and reader).
- **Offline encoder:** `tools/build-character-pack.mjs` — validates a JSON pack source (schema `schemas/character-pack-source.schema.json`), encodes deterministically (deflate level 9, canonical walk order, no timestamps), and emits `<packId>.rpgpack` plus a generation report (`--check` validates without writing). It is an explicit command, never part of routine `npm run build`; `.import/` stays an optional regeneration input.
- **Strict runtime reader:** `src/platform/character-pack.ts` — verifies framing, strict UTF-8 JSON manifest (schema `schemas/character-pack-manifest.schema.json`, ajv-standalone generated like the content validators), cross-field structure, then decodes payloads lazily through `DecompressionStream` with a hard decoded-length cap and per-payload SHA-256 verification.

### Wire layout (all integers big-endian)

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | magic `RPGP` |
| 4 | 1 | format version (1) |
| 5 | 1 | reserved (0) |
| 6 | 4 | manifest byte length (bounded 2..256 KiB) |
| 10 | N | UTF-8 JSON manifest |
| 10+N | … | payload bodies, zlib-compressed raw RGBA, in manifest `payloads` order |

### Manifest

`packId`, `formatVersion: 1`, uniform `cell {widthPx, heightPx}`, ordered `layers` (bottom-to-top render roles), `animations` (name, direction `down|side|up|null`, frameCount ≤ 16, loop), `payloads` (offset, length, decodedLength, digest — offsets are strictly sequential and the body must end exactly at the last payload), and `cells` (one binding per animation×direction×frameIndex×layer to a deduplicated payload index). Every payload decodes to exactly `cell.widthPx × cell.heightPx × 4` bytes; identical pixels share one payload (digest-keyed). Every animation frame must bind at least one layer; a layer may appear on a subset of frames.

### Bounds (fail closed)

Manifest ≤ 256 KiB; decoded payload ≤ 128×128×4; total decoded ≤ 8 MiB; payload body ≤ 8 MiB; ≤ 65 535 payloads; ≤ 65 536 cells; ≤ 16 layers; ≤ 256 animations; ≤ 16 frames per animation. The reader validates all of these before inflation (declared) and during inflation (actual vs declared, chunk-wise).

## Consequences and limits

Cells are addressed by `animation|direction|frameIndex` + layer, so CA2 can map actor state to frames and CA3 can extend the catalog without changing the format. Deduplication keeps identical cells (e.g. repeated idle pixels) single-copy while remaining byte-reproducible. Not covered by v1, deliberately: per-cell trimming (cells are fixed-size rectangles; trimming would need v2 if real-pixel measurement demands it), chunk-level selective fetch (payload offsets make this possible later without a format change), side-mirroring, timing, and any real licensed pixels — the current committed evidence is synthetic-only. The reader exposes no execution surface: it is data-only by construction (no eval, no path handling, no network).
