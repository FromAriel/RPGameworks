# S1.4 reference captures — 640 × 360 view with 32-pixel tiles

These are the current UI reference screenshots after the world moved to a 640 × 360 view with 32-pixel tiles ([decision 0008](../../decisions/0008-32px-world-scale.md)). They are real production-build screens captured by `tests/browser/ui-reference.spec.ts`, at the same states, viewports, input modes, fixed content time and windowskin state as the earlier sets. The [U1.1](../u1.1/README.md) and [U1.3](../u1.3/) folders are kept unchanged as the historical references.

## Acceptance

On November 8, 2026, Ariel reviewed the 640 × 360, 32-pixel build in the running game, said it looks good and that everything transitioned to the new size fine, and asked for these captures to become the reference. Her review was of the live build; these exact PNG files were not individually reviewed.

## Source identity

- Source: `main` at `6799441` (S1.4), with no uncommitted runtime changes
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts` against the fixture build of that tree
- Capture date: 2026-11-08
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)
- Windowskin: repository source loaded with `data-skin-state="ready"`, except forced-colors mode, which deliberately removes the decorative image

## Captures

File names follow the earlier sets with the `s1.4-` prefix.

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `s1.4-dialogue-1100x850.png` | 1100×850, keyboard | Mara dialogue |
| `s1.4-dialogue-390x844.png` | 390×844, keyboard | Narrow Mara dialogue |
| `s1.4-inventory-lens-1100x850.png` | 1100×850, keyboard | Inventory with one Polished lens selected |
| `s1.4-inventory-390x844.png` | 390×844, keyboard | Narrow empty Inventory |
| `s1.4-inventory-touch-390x844.png` | 390×844, touch | Touch-opened Inventory |
| `s1.4-inventory-forced-colors.png` | 1100×850, forced colors | Inventory with visible focus |
| `s1.4-save-empty-1100x850.png` | 1100×850, keyboard | Three empty slots with disabled Load and Export reasons |
| `s1.4-save-empty-390x844.png` | 390×844, keyboard | Narrow empty Save / Load |
| `s1.4-save-populated-1100x850.png` | 1100×850, keyboard | Slot 1 populated from live Gallery progress |
| `s1.4-save-confirmation-1100x850.png` | 1100×850, keyboard | Occupied-slot Save confirmation, Cancel focused |
| `s1.4-save-storage-unavailable-1100x850.png` | 1100×850, keyboard | IndexedDB unavailable with recovery explanation |
| `s1.4-save-forced-colors.png` | 1100×850, forced colors | Save / Load with focus and adjacent disabled reasons |
| `s1.4-settings-1100x850.png` | 1100×850, keyboard | Settings panel; Debug remains separate |

## What changed from the U1.3 references

Every capture keeps the same dimensions as its U1.3 counterpart. The windows, text, buttons and focus treatments are unchanged; no UI code changed in S1.3 or S1.4. Pixel comparison shows differences only where the game world shows through: above the dialogue frame and through the windowskin's transparent edges, the world behind is now drawn with 32-pixel tiles in a 640 × 360 view instead of 16-pixel tiles at 320 × 192. Differing pixels range from 1,161 of 104,000 (save confirmation) to 191,916 of 343,520 (forced-colors Inventory, where more of the world is visible behind the panel). A spot check of the wide dialogue pair confirmed the window itself is identical.

As with earlier sets, PNG bytes are encoder-sensitive, so per-pixel comparison, not file hashes, is the reliable check for future recaptures.
