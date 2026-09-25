# HANDOFF — working notes through M3.5 source delivery

**Written:** September 25, 2026, after M3.5 source delivery. [STATUS](STATUS.md) remains the evidence ledger. M3.5 is locally verified and pushed to `main` as `8fc7b05`; no new Pages run occurred. The public game remains G1.3 plus the quest UI correction from `00a568b`, deployed in manual [run 36108392434](https://github.com/FromAriel/RPGameworks/actions/runs/36108392434). Specific hosted gameplay feedback remains open.

## 1. Where the project stands

**Implemented and locally verified (latest first; acceptance and release are marked per row):**

| Milestone | Result | Evidence |
| --- | --- | --- |
| M3.5 source delivered | Deterministic authored-definition/referrer inventory, advisory orphan and structural route findings, precise fatal diagnostics and broken fixtures | `8fc7b05`; [STATUS §M3.5](STATUS.md); 369 unit/content and 26 focused browser tests; Pages decision open |
| Quest UI released | Completion dialogue returns keyboard focus to a live button; Journal Close returns to exploration and the next Inventory opening starts at Inventory | `00a568b`; [STATUS §ad-hoc quest completion](STATUS.md); Ariel approved local correction; hosted Journal close smoke passed |
| G1.3 released | Separate Workshop key and persistent west lock, sparse supply room with return door, additive v2 content IDs, corrected Workshop/Gallery arrival spacing | `00a568b`; [STATUS §G1.3](STATUS.md); 148/148 local Chromium checks, live room smoke; specific hosted route feedback separate |
| M3 locally accepted; source delivered and hosted | Reusable authored dialogue and item hand-ins for Mara's lens and the archive clerk's ledger; Journal, lit Gallery, v1 save migration, corrected normal acceptance and already-held item routes | Source `6c17550`, hosted in `00a568b`; [STATUS §M3](STATUS.md); 356 unit/content and 146 browser tests; Ariel said “looks good” |
| G1.2 source delivered and hosted | Conditional exits, Ariel-approved locked/unlocked door images, set-back arrival spawns, sparse Storeroom and Gallery return; local gameplay accepted | Source `070234a`, hosted in `00a568b`; [STATUS §G1.2](STATUS.md) |
| CA1/CA2 game-art release (published) | Hash-pinned real-pixel `starter-hero` pack and six-layer idle/walk view in Workshop and Gallery; derived game-use pack and provenance only | [STATUS §animated hero](STATUS.md); build `05705b9`, Pages run 35789345759 |
| CA1 synthetic foundations | Character pack v1 format (decision 0003), deterministic offline encoder, strict runtime reader, committed golden fixture | [STATUS §CA1](STATUS.md); decision `0003-character-pack-v1.md` |
| G1.1 accepted | Conditional access contract: per-state `solid`, `interaction.prerequisites`, dynamic collision view + occupied-cell deferral, checkpoint save/load validation against resolved views, and the first chat-authored demo content (brass key, lever, choke-point gate, key crate, storeroom door) with end-to-end browser proof | ROADMAP checkbox marked; [STATUS §G1.1c](STATUS.md); commits `75b9bd6`…`846ca06` |
| Ad-hoc playtest delivery | Manual, **build-only** GitHub Pages workflow; live playtest serves `fb17a1c` (includes the second accepted windowskin) | run 35685752229; [STATUS §delivery](STATUS.md) |
| Art: second windowskin | Ariel's second `Window.png` (3,112 bytes, 32 partial-alpha pixels) is canonical; provenance, audit and pinned tests updated; two `mid.right:N/S` adapter seams recorded, retained | `df7dfc2`; `Window.audit.json` |
| U1.1–U1.3 | Shared token layer + components; all player screens normalized (dialogue, Inventory, Save/Load, Settings) | [STATUS §U1.x](STATUS.md) |
| M2 spine | Facts/transactions/placements, three-slot IndexedDB saves, inventory menu | [status §M2](STATUS.md) |
| Research docs | Cute Fantasy sprite layout (schema + 56-row Ariel map) + license decision; CA1–CA4 plan | [CHARACTER-ASSET-INTEGRATION.md](CHARACTER-ASSET-INTEGRATION.md), [asset-analysis/](asset-analysis/README.md) |

**Current verification:** M3.5 passed `npm run validate`, `npm run check` with 369 unit/content tests, typecheck and production build, a project-path build, and 26 focused browser checks. G1.3 and the quest UI correction previously passed a full 148/148 local Chromium suite. Pages run 36108392434 deployed game commit `00a568b`; a bounded live smoke verified the served content and Journal focus. No M3.5 Pages run has occurred.

**Deployment posture:** Pages deploys **only** by manual dispatch of the build-only workflow for an approved commit; ordinary pushes never publish. Public-repo builds are free of the runner-quota problem that exhausted the old matrix; the three-platform CI stays separately manual.

## 2. What is left (ordered)

1. **Review M3.5 findings.** Inspect `.tmp/m3.5-demo-report.json` and its four advisory findings; decide whether the unused records are intentional. Source is delivered, the report is development-only, and runtime content remains unchanged.
2. **Hosted play feedback.** Record Ariel's experience with the supply-room route and completed quests separately from the passing deployment and smoke. The live site serves game commit `00a568b`.
3. **Next gameplay packet.** Plan and then deliver minimum owned/fallback PixelFX with one battle cue, followed by M5 battle and preparation, M6.1's finishable chapter, and M7 hardening. Fuller FX laboratory, region scale, world clock, and large-map proofs may follow.
4. **Separate character-art path.** CA1/CA2 are published in `05705b9`. CA3's variants/tools/mounts and CA4's broader review can be scheduled when content needs them; art anchor/timing changes require a new visual check if Ariel requests them.

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

1. Read [STATUS](STATUS.md) and the M3.5/M4 rows in [ROADMAP](ROADMAP.md), then inspect the current tree. M3.5 source is on `main` as `8fc7b05`; the public game is still `00a568b` from Pages run 36108392434.
2. Ariel approved the local hero candidate and Pages serves it. Record any hosted playtest feedback separately; changes to mirror, anchor, or timing require a new candidate and visual check.
3. The approved derived pack and provenance are published; do not stage the local `.import/` source drop in later packets. The current tracked tree excludes it, although the earlier `846ca06` commit remains reachable in history. G1.2 and M3 content are included in game commit `00a568b`; record hosted playtest feedback separately.
4. Keep `HANDOFF.md` and `STATUS.md` aligned: this file is the narrative, STATUS is the evidence ledger.
