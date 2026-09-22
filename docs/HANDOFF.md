# HANDOFF — working notes through local starter-hero preview

**Written:** September 22, 2026, after G1.1 acceptance and Ariel's approved animated starter-hero release. [STATUS](STATUS.md) remains the evidence ledger. The derived game-use pack shipped in `05705b9` and its manual Pages release was verified in run 35789345759; Ariel's hosted playtest remains separate.

## 1. Where the project stands

**Implemented, locally verified, and accepted (latest first):**

| Milestone | Result | Evidence |
| --- | --- | --- |
| CA1/CA2 game-art release (published) | Hash-pinned real-pixel `starter-hero` pack and six-layer idle/walk view in Workshop and Gallery; derived game-use pack and provenance only | [STATUS §animated hero](STATUS.md); build `05705b9`, Pages run 35789345759 |
| CA1 synthetic foundations | Character pack v1 format (decision 0003), deterministic offline encoder, strict runtime reader, committed golden fixture | [STATUS §CA1](STATUS.md); decision `0003-character-pack-v1.md` |
| G1.1 accepted | Conditional access contract: per-state `solid`, `interaction.prerequisites`, dynamic collision view + occupied-cell deferral, checkpoint save/load validation against resolved views, and the first chat-authored demo content (brass key, lever, choke-point gate, key crate, storeroom door) with end-to-end browser proof | ROADMAP checkbox marked; [STATUS §G1.1c](STATUS.md); commits `75b9bd6`…`846ca06` |
| Ad-hoc playtest delivery | Manual, **build-only** GitHub Pages workflow; live playtest serves `fb17a1c` (includes the second accepted windowskin) | run 35685752229; [STATUS §delivery](STATUS.md) |
| Art: second windowskin | Ariel's second `Window.png` (3,112 bytes, 32 partial-alpha pixels) is canonical; provenance, audit and pinned tests updated; two `mid.right:N/S` adapter seams recorded, retained | `df7dfc2`; `Window.audit.json` |
| U1.1–U1.3 | Shared token layer + components; all player screens normalized (dialogue, Inventory, Save/Load, Settings) | [STATUS §U1.x](STATUS.md) |
| M2 spine | Facts/transactions/placements, three-slot IndexedDB saves, inventory menu | [status §M2](STATUS.md) |
| Research docs | Cute Fantasy sprite layout (schema + 56-row Ariel map) + license decision; CA1–CA4 plan | [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md), [asset-analysis/](asset-analysis/README.md) |

**Current local verification:** `npm run check` passes with 344 unit/content tests, typecheck, and production build. The focused 33-scenario Chromium run and full 139-scenario browser suite pass. The original synthetic format, windowskin asset, and public Pages release are unchanged.

**Deployment posture:** Pages deploys **only** by manual dispatch of the build-only workflow for an approved commit; ordinary pushes never publish. Public-repo builds are free of the runner-quota problem that exhausted the old matrix; the three-platform CI stays separately manual.

## 2. What is left (ordered)

1. **CA1/CA2 — published animated hero** — synthetic foundations and the recorded appearance feed an explicit real-pixel encoder. The selected pack is mounted in Workshop/Gallery with full side-view mirroring, (32,41) foot anchor, 180 ms idle / 120 ms walk, fallback, and shared texture ownership. Ariel approved the local preview; the derived pack and provenance shipped in `05705b9`. The manual Pages run succeeded, and exact served build and pack bytes plus both rooms were verified. Leave Ariel's own hosted playtest open.
2. **CA2 follow-up** — adjust art anchor or timing only if Ariel requests it, regenerate and repeat the relevant visual checks.
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

1. Read [STATUS](STATUS.md) top-to-bottom, then [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md) (CA1). CA1's synthetic foundation is done, reconciled against Ariel's four review findings, and her starter appearance is recorded (`docs/asset-analysis/starter-appearance.json`): pack format `0003`, `tools/build-character-pack.mjs`, `src/platform/character-pack.ts`, `src/platform/character-selection.mjs`, committed golden fixture under `tests/fixtures/character-pack/`, 27 unit tests.
2. Ariel approved the local hero candidate and Pages serves it. Record any hosted playtest feedback separately; changes to mirror, anchor, or timing require a new candidate and visual check.
3. The approved derived pack and provenance are published; do not stage the local `.import/` source drop in later packets. The current tracked tree excludes it, although the earlier `846ca06` commit remains reachable in history. G1.2 travel is next; hosted playtest feedback is a separate input.
4. Keep `HANDOFF.md` and `STATUS.md` aligned: this file is the narrative, STATUS is the evidence ledger.
