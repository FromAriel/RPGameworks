# HANDOFF — working notes through G1 acceptance

**Written:** September 22, 2026, after G1.1 acceptance and the character-art documentation packets. [STATUS](STATUS.md) remains the handoff of record with exact evidence per packet; this file is the narrative companion: what we did, what remains, and what we learned. Read it top to bottom before starting the next packet.

## 1. Where the project stands

**Implemented, locally verified, and accepted (latest first):**

| Milestone | Result | Evidence |
| --- | --- | --- |
| G1.1 accepted | Conditional access contract: per-state `solid`, `interaction.prerequisites`, dynamic collision view + occupied-cell deferral, checkpoint save/load validation against resolved views, and the first chat-authored demo content (brass key, lever, choke-point gate, key crate, storeroom door) with end-to-end browser proof | ROADMAP checkbox marked; [STATUS §G1.1c](STATUS.md); commits `75b9bd6`…`846ca06` |
| Ad-hoc playtest delivery | Manual, **build-only** GitHub Pages workflow; live playtest serves `fb17a1c` (includes the second accepted windowskin) | run 35685752229; [STATUS §delivery](STATUS.md) |
| Art: second windowskin | Ariel's second `Window.png` (3,112 bytes, 32 partial-alpha pixels) is canonical; provenance, audit and pinned tests updated; two `mid.right:N/S` adapter seams recorded, retained | `df7dfc2`; `Window.audit.json` |
| U1.1–U1.3 | Shared token layer + components; all player screens normalized (dialogue, Inventory, Save/Load, Settings) | [STATUS §U1.x](STATUS.md) |
| M2 spine | Facts/transactions/placements, three-slot IndexedDB saves, inventory menu | [status §M2](STATUS.md) |
| Research docs | Cute Fantasy sprite layout (schema + 56-row Ariel map) + license decision; CA1–CA4 plan | [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md), [asset-analysis/](asset-analysis/README.md) |

**Test floor at handoff:** 315 unit/content tests, 135 Chromium scenarios, clean `npm run check`, exact windowskin audit recomputed for the second edit, `npm audit` clean.

**Deployment posture:** Pages deploys **only** by manual dispatch of the build-only workflow for an approved commit; ordinary pushes never publish. Public-repo builds are free of the runner-quota problem that exhausted the old matrix; the three-platform CI stays separately manual.

## 2. What is left (ordered)

1. **CA1 — pack-v1 proof with synthetic pixels** (next up): binary format spec (magic/version, bounded manifest, per-payload digests, decompression-bomb bounds), deterministic offline encoder, strict reader, round-trip/corruption tests, golden fixture, generation report. No licensed pixels involved.
2. **CA2 — one animated hero**, gated on Ariel's selections: starter appearance paths, hair-or-helmet, hands policy, side-mirroring (leaning: mirror one authored side row in code), foot anchor (measured from art), animation timings/loop rules (Aseprite's 100 ms outer frames are placeholders, not timing). Browser gates: blocking/alignment equality with the old hero, failure fallback, lifecycle.
3. **CA3 — variants + the 56-entry action catalog** with explicit availability policy (an action exists only if content enables it); held-tool/mount composites; test-only preview route.
4. **CA4 — production review**: `dist/` allowlist (no `.aseprite`/source PNGs/ZIP/`.import/`), texture-residency checks, cold/warm load comparison, `dist/` only ships the approved pack, and a separately authorized manual Pages release.
5. **G1.2 — travel integration** (denial-once with no destination fetch, existing prepare/validate/activate path, two locks in one proof), then the M3 quest per NEXT-SLICES §8. Sequenced after CA1 per Ariel's ordering — the character plan does not replace it.
6. Longer route: M3 conversations/quests → M4 PixelFX → M5 battle → M6 world → M7 release hardening ([JRPG-BUILDOUT](JRPG-BUILDOUT.md)).

## 3. What we learned (alpha of the handbook)

**Engine facts that bit or bonded:**
- **`safeDelta` clamps frame deltas to 50 ms** (`src/domain/movement.ts`): movement math written for big frames silently stays mid-motion; tests must step in ≤50 ms slices exactly like the runtime.
- **Turn and move share one gesture:** a walkable adjacent tile means "face" is also "start walking"; only blocked directions give a pure turn. Interaction targeting is face-adjacent, so non-solid interactables on walkable floors cannot be faced from a standstill — author them solid, or account for step-through semantics.
- **Dynamic collision deferral semantics:** unblocks apply immediately; solidify defers while the actor occupies the standing/mid-step target cells; stale queued closes must be cancelled by fresher resolutions (keyed per placement); checkpoints validate against the deferral-free canonical view both at save (refuse an unrestorable tile, visible reason, before any confirm) and load (candidate-session view).
- **SaveMenu ordering:** capture the checkpoint once before any overwrite confirmation, refuse invalid ones pre-dialog, recheck the captured payload immediately before writing (confirmation can't authorize an invalidated payload).
- **Content validation pays for itself:** every access contract edge (unknown fact/item/placement in `prerequisites`, missing `rejectionMessageId` on gated interactions, duplicate state IDs, fallback-last ordering) is a validation error, not a runtime surprise.
- **Derived-on-content tests:** save tests now build their state index from the authored pack so content additions can't strand them on a hand-copied index.

**Process lessons:**
- **`git add -A` swept the `.import/` asset drop into a pushed commit once** (`846ca06`). Fixed forward (untracked + gitignored; the artifacts remain only in history, retained on purpose per Ariel). Future rule: state the intended path list before staging, and never `add -A` while an untracked drop sits in the tree.
- **`[skip ci]` remains the convention**; the Pages workflow now costs seconds and is build-only — publication stays a deliberate act with a verified build ID on the live URL.
- **Reference capture:** per-pixel comparison is the only reliable visual check when Chromium PNG re-encoding differs between runs; SHA-256 equality is recorded as method-sensitive for captures. G1.1 content landed without capture acceptance because the reference screenshots are dialog/window elements, not the world canvas.
- **Recording Ariel's decisions beats asking twice:** the recipe (`read_me` terms + receipt) and pay-tier resolution are now written into the license decision; the 56-entry animation map (including her 9/9/9 fish-cast correction) is the schema-validated authority — pixel-occupancy counts are cross-checks, never authority.
- **Receipts stay ignored:** `.import/` evidence (order PDF/DOCX) is cited by path/identity in tracked docs; buyer personal data (IP, account email) never transcribes into tracked files.

## 4. Conventions that held up

- One bounded slice per session ending at a clean `npm run check` (+ browser suite when presentation changes), STATUS updated each time, `[skip ci]`.
- Prefer data edits; record any genuinely required engine primitive as a `docs/decisions/*` note (dynamic collision got 0002).
- Reviewer comments are reconciled with their own fix commits and corrected docs, claimed only for what actually ran; browser fixtures always follow fixes that touched runtime paths.
- Provenance edits (art, licenses, source identity) update: PNG/manifest/audit, unit-test pins, `docs/STATUS.md`, `WINDOW-SKIN.md`, and `assets/source/ui/base/README.md` together.

## 5. First steps for the very next agent

1. Read [STATUS](STATUS.md) top-to-bottom, then [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md) (CA1).
2. Start CA1 with synthetic pixels only; write `docs/decisions/0003-*` when the pack format lands.
3. Before CA2 visuals, collect Ariel's remaining picks: appearance selection, mirror policy, anchor, timing.
4. Keep `HANDOFF.md` and `STATUS.md` aligned: this file is the narrative, STATUS is the evidence ledger.
