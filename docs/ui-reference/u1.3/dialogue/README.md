# U1.3a dialogue migration captures — accepted

Ariel reviewed and accepted these captures on 2026-09-21. Together with [the save-spacing candidates](../save-spacing/README.md) they form the accepted post-U1.3a visual baseline for the migrated surfaces; the U1.1 set remains the historical pre-migration reference.

Post-migration captures of the only visually changed surface in U1.3a. These are real production-build screens captured by `tests/browser/ui-reference.spec.ts` at the same states, viewports, input modes, fixed content time, and windowskin state as the accepted [U1.1 reference set](../u1.1/README.md). The U1.1 files are untouched and remain the accepted baseline; this folder exists because deliberate visual changes must be separately reviewed (see the U1.1 review boundary).

## Source identity

- Base state: `main` at `f346bed` plus the uncommitted U1.3a dialogue migration working tree
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts`
- Capture date: 2026-09-20
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)
- Windowskin: repository source loaded with `data-skin-state="ready"`; exact-art audit unchanged

## Captures

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-dialogue-1100x850.png` | 1100×850, keyboard | Mara dialogue, wide |
| `u1-dialogue-390x844.png` | 390×844, keyboard | Mara dialogue, narrow |

## Deliberate visual changes (component normalization)

`#dialog-advance` and `#dialog-cancel` now use the shared `ui-action-button` treatment instead of the pre-U1.3 dialogue-specific rules:

- Label text uses the component type role: 600-weight 14px `--ui-text-body` instead of inherited 13px `--ui-text-label`
- Buttons meet the shared 44px `--ui-touch-target` (previously 42px), which makes each dialog 2px taller
- Component padding `--ui-space-2`/`--ui-space-4` (8px/16px) replaces 10px/14px
- The pre-U1.3 rest-state inner ring (`inset 0 0 0 2px var(--ui-surface)`) is not part of the component treatment; the flat raised fill matches the accepted gallery component
- Hover, focus-visible, active, secondary-intent, and disabled treatments are unchanged in kind; disabled opacity normalizes from .55 to the component's .62 when a dialogue button is ever disabled

## Comparison against the accepted U1.1 set

- Compared files: 12
- Byte-identical files: 10 at the time of the dialogue migration (all Inventory, Save/Load, Settings, touch, and forced-colors states)
- Changed files: 2 (both dialogue captures, the only migrated surface)
- Method: SHA-256 equality plus per-pixel diff of the two changed pairs
- Measured change: both dialogs grow exactly 2px taller; 8.51% (wide) / 6.16% (narrow) of shared-region pixels differ, consistent with the global 2px shift plus the button treatment above
- Scroll affordance: not visible in either capture because Mara's captured page does not clip; "More above"/"More below" indicators appear only when content overflows

Update, later the same day: Ariel's test feedback produced a separate Save/Load spacing fix, so the working tree now differs from the accepted U1.1 set in 7 captures: these 2 dialogue captures plus the 5 recorded in [the save-spacing candidates](../save-spacing/README.md). The dialogue comparison above still describes only the dialogue migration.

Ariel's separate visual review of these two captures was the U1.3a acceptance gate and passed on 2026-09-21.
