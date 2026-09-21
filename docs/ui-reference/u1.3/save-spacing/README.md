# U1.3 Save/Load spacing fix captures — accepted

Ariel reviewed and accepted these captures on 2026-09-21.

Captures of the Save/Load screen after Ariel's 2026-09-20 test-feedback fix for the cramped bottom half: the slot list now clears the section divider, the bottom action row uses a dedicated `.save-toolbar` (center-aligned, 16px column gaps) instead of sharing the per-slot `.save-actions` class, the import label aligns its native file control with the buttons, and slot rows gained vertical padding. No behavior, navigation, or storage logic changed; all 9 functional save scenarios and the full capture suite pass.

These captures supplement the [U1.3a dialogue candidates](../dialogue/README.md). Together, 7 of the 12 accepted U1.1 captures currently differ from the working tree: the 2 dialogue captures (component migration) and these 5 (spacing fix). The accepted U1.1 files remain untouched until Ariel reviews both sets.

## Source identity

- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts` against a fresh `npm run pretest:browser` build
- Capture date: 2026-09-20
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)

## Captures

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-save-empty-1100x850.png` | 1100×850, keyboard | Three empty slots, spaced bottom toolbar |
| `u1-save-populated-1100x850.png` | 1100×850, keyboard | Slot 1 populated from live Gallery progress |
| `u1-save-storage-unavailable-1100x850.png` | 1100×850, keyboard | IndexedDB unavailable with recovery explanation |
| `u1-save-empty-390x844.png` | 390×844, keyboard | Narrow empty Save / Load |
| `u1-save-forced-colors.png` | 1100×850, forced colors | Focus and adjacent disabled reasons retained |

Ariel's visual review of these captures was part of the U1.3 working-candidate acceptance gate and passed on 2026-09-21.
