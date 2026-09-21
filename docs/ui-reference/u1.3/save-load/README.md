# U1.3d Save/Load normalization captures — accepted

Ariel reviewed and accepted these captures and the confirmation interaction on 2026-09-21, closing U1.3. They join the accepted U1.3 reference sets under this folder; the U1.1 set remains the historical pre-migration baseline.

Post-migration captures of the Save/Load screen and its new confirmation dialog, the final U1.3 surface. These are real production-build screens captured by `tests/browser/ui-reference.spec.ts` at fixed content time and windowskin-ready state.

## Source identity

- Base state: `main` at `4ecca84` plus the uncommitted U1.3d working tree
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts` against a fresh fixture build
- Capture date: 2026-09-21
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)
- Confirmation state: 1100×850, keyboard, populated Slot 1, occupied-slot Save requested, Cancel focused

## Captures

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-save-empty-1100x850.png` | 1100×850, keyboard | Three empty slots, shared buttons and status presenter |
| `u1-save-populated-1100x850.png` | 1100×850, keyboard | Slot 1 populated from live Gallery progress |
| `u1-save-confirmation-1100x850.png` | 1100×850, keyboard | Occupied-slot Save confirmation, Cancel focused || `u1-save-storage-unavailable-1100x850.png` | 1100×850, keyboard | IndexedDB unavailable with failure status |
| `u1-save-empty-390x844.png` | 390×844, keyboard | Narrow empty Save / Load |
| `u1-save-forced-colors.png` | 1100×850, forced colors | Focus and adjacent disabled reasons retained |

## Deliberate changes

- Slot and toolbar buttons use the shared `ui-action-button` treatment; danger intent marks actions that replace existing progress (occupied-slot Save, Load, Import here, Recover previous, Load validated import), primary marks non-destructive Save to an empty slot and Return to Inventory
- Slot entries use the shared inset-region classes; slot titles take the brass outlined title role
- `#save-status` is a mounted status presenter; every message keeps its readable text with a semantic kind prefix and indicator border
- Every press-again path is replaced by one shared confirmation dialog that names the exact slot and consequence, focuses Cancel, requires a fresh press, restores opener focus, and clears held input at both modal boundaries; Save to an empty slot, Export, and Refresh remain single-action
- The confirmation frame is created before the windowskin compositor mounts, so it is registered and painted (`data-skin-state="ready"`, `data-skin-paints` ≥ 1) with a plain-art fallback path covered

## Reconciliation (2026-09-21, pre-acceptance review fixes)

Ariel's first pre-acceptance review produced five reconciliations, folded into this candidate without expanding scope: (1) successful writes restore focus to the corresponding new control after rerender (same action, then same slot, then a visible fallback), while a successful Load leaves exploration focus in charge — both outcomes tested; (2) the confirmation binds the previewed import envelope identity (revision and save time appear in the dialog body), so a delayed import read landing mid-dialog cannot change the confirmed payload — verified by a delayed-file-read race test; (3) every asynchronous menu path carries post-await ownership checks, and the broad late-result claim was narrowed to what is actually protected — a disposal-mid-read test pins it; (4) controller X confirmation after release/rearm and the Load validated import route are now covered; (5) a duplicated STATUS heading was removed.

Ariel's second review round scoped the input-gate exception (a pending confirmation supersedes the modal gate only for the dialog that owns it; an unrelated open confirmation never unlocks polling — pinned by a gate-scoping test) and added labeled-group semantics to the slot rows (`role="group"` + `aria-labelledby`); the STATUS claims about the selector query frequency and late-result scope were corrected.

Recapture after reconciliation: per-pixel comparison of all six states against the earlier candidate shows **zero differing pixels**. SHA-256 additionally held for the confirmation capture, but the other five re-encoded with different PNG bytes over identical pixels this session (screenshot encoder nondeterminism), so byte equality is recorded as method-sensitive and pixel equality is the meaningful reconciliation result.

## Comparison against the accepted baselines

- Compared files: 12 accepted references + 1 new candidate
- Byte-identical: all 7 dialogue, Inventory, and Settings accepted references
- Changed: the 5 Save/Load references (this surface)
- New: `u1-save-confirmation-1100x850.png` (candidate addition, not yet accepted)
- Method: SHA-256 equality of each matched PNG; this reconciliation adds per-pixel equality (zero differences across all six states)
- Functional coverage: 15 Save/Load scenarios — keyboard, pointer, and controller confirmation including controller X confirmation after release/rearm and the Load validated import route; safe initial focus, post-write focus restoration, and post-load exploration focus; held-X and held-B isolation across both modal boundaries; cancellation; delayed-import race with the previewed envelope identity bound into the dialog; disposal-mid-read late result; gate scoping (an unrelated open confirmation never unlocks polling; the owner's does); slot groups labeled via `role="group"` + `aria-labelledby`; stale-tab overwrite; invalid import; unavailable storage; failed destination preparation; repeated open/close/load cycles; narrow bounds, forced colors, and skin-failure fallback; full suite 133 scenarios

Ariel's separate visual review of these candidates is the U1.3d acceptance gate.
