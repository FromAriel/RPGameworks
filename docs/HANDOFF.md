# HANDOFF — working notes through M3 local acceptance

**Written:** September 24, 2026, after Ariel accepted the corrected local M3 quest flow. [STATUS](STATUS.md) remains the evidence ledger. G1.2 source is on `main` at `070234a`; the public Pages playtest still serves approved hero build `05705b9` from run 35789345759. M3 source delivery is pending; Pages release and hosted playtest feedback remain separate.

## 1. Where the project stands

**Implemented and locally verified (latest first; acceptance and release are marked per row):**

| Milestone | Result | Evidence |
| --- | --- | --- |
| M3 local gameplay accepted; source delivery pending | Reusable authored dialogue and item hand-ins for Mara's lens and the archive clerk's ledger; Journal, lit Gallery, v1 save migration, corrected normal acceptance and already-held item routes | [STATUS §M3](STATUS.md); 356 unit/content and 146 browser tests; Ariel said “looks good” |
| G1.2 source delivered | Conditional exits, Ariel-approved locked/unlocked door images, set-back arrival spawns, sparse Storeroom and Gallery return; local gameplay accepted, Pages release open | `070234a`; [STATUS §G1.2](STATUS.md) |
| CA1/CA2 game-art release (published) | Hash-pinned real-pixel `starter-hero` pack and six-layer idle/walk view in Workshop and Gallery; derived game-use pack and provenance only | [STATUS §animated hero](STATUS.md); build `05705b9`, Pages run 35789345759 |
| CA1 synthetic foundations | Character pack v1 format (decision 0003), deterministic offline encoder, strict runtime reader, committed golden fixture | [STATUS §CA1](STATUS.md); decision `0003-character-pack-v1.md` |
| G1.1 accepted | Conditional access contract: per-state `solid`, `interaction.prerequisites`, dynamic collision view + occupied-cell deferral, checkpoint save/load validation against resolved views, and the first chat-authored demo content (brass key, lever, choke-point gate, key crate, storeroom door) with end-to-end browser proof | ROADMAP checkbox marked; [STATUS §G1.1c](STATUS.md); commits `75b9bd6`…`846ca06` |
| Ad-hoc playtest delivery | Manual, **build-only** GitHub Pages workflow; live playtest serves `fb17a1c` (includes the second accepted windowskin) | run 35685752229; [STATUS §delivery](STATUS.md) |
| Art: second windowskin | Ariel's second `Window.png` (3,112 bytes, 32 partial-alpha pixels) is canonical; provenance, audit and pinned tests updated; two `mid.right:N/S` adapter seams recorded, retained | `df7dfc2`; `Window.audit.json` |
| U1.1–U1.3 | Shared token layer + components; all player screens normalized (dialogue, Inventory, Save/Load, Settings) | [STATUS §U1.x](STATUS.md) |
| M2 spine | Facts/transactions/placements, three-slot IndexedDB saves, inventory menu | [status §M2](STATUS.md) |
| Research docs | Cute Fantasy sprite layout (schema + 56-row Ariel map) + license decision; CA1–CA4 plan | [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md), [asset-analysis/](asset-analysis/README.md) |

**Current local verification:** The accepted M3 candidate passed `npm run validate` and `npm run check` with 356 unit/content tests, typecheck and production build. The full 146-scenario Chromium suite passed, including both hand-ins, declined already-held offers, save migration, travel and ownership. This is local evidence; the public Pages release remains at approved hero build `05705b9`.

**Deployment posture:** Pages deploys **only** by manual dispatch of the build-only workflow for an approved commit; ordinary pushes never publish. Public-repo builds are free of the runner-quota problem that exhausted the old matrix; the three-platform CI stays separately manual.

## 2. What is left (ordered)

1. **M3 — deliver accepted source.** Review the full uncommitted quest diff, rerun release checks, stage explicit paths, commit and push to `main` without dispatching Pages. Keep hosted behavior and feedback separate.
2. **G1.3 — second independent lock.** Author a Workshop west supply room and its own key and persistent door marker. Prove neither key opens the other lock; inspect Workshop/Gallery return exits and switch gate for visual/re-entry confusion. Retain G1.2 failure and 40-transfer regressions. Present a local route for Ariel's review; source push and Pages remain separate decisions.
3. **M3.5 — authoring reports.** Finish orphan/reference reports and deliberately broken fixtures after G1.3, before M4.
4. **Chapter path.** Deliver minimum owned/fallback PixelFX with one battle cue, then M5 battle and preparation, M6.1's finishable chapter, and M7 hardening for its exact release artifact. Fuller FX laboratory, region scale, world clock, and large-map proofs may follow.
5. **Separate character-art path.** CA1/CA2 are published in `05705b9`. CA3's variants/tools/mounts and CA4's broader review can be scheduled when content needs them; art anchor/timing changes require a new visual check if Ariel requests them.

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

1. Read [STATUS](STATUS.md) and the M3/G1.3 rows in [ROADMAP](ROADMAP.md), then inspect the current tree. Ariel accepted the corrected local M3 quest flow. Recheck and deliver its source separately from any Pages deployment.
2. Ariel approved the local hero candidate and Pages serves it. Record any hosted playtest feedback separately; changes to mirror, anchor, or timing require a new candidate and visual check.
3. The approved derived pack and provenance are published; do not stage the local `.import/` source drop in later packets. The current tracked tree excludes it, although the earlier `846ca06` commit remains reachable in history. G1.2 source is on `main`; its Pages deployment remains separate. Record hosted playtest feedback separately.
4. Keep `HANDOFF.md` and `STATUS.md` aligned: this file is the narrative, STATUS is the evidence ledger.
