# U1.1 Workshop Astral real-screen reference set

This folder contains the post-refactor candidate captured from the production build by `tests/browser/ui-reference.spec.ts`. These are real application screens, not generated concept art. The Workshop Night, Brass Observatory, and Luminous Archive images remain directional references only; none of their invented characters, environments, portraits, icons, or layouts were imported.

## Source identity

- Candidate base commit: `224efbbe721ceb798bb81eefa50059266c746eb9`
- Exact implementation/reference commit: `0cade5ae7632f22bede9323989acbcfc2e472c9c`
- Acceptance: approved by Ariel on 2026-09-20.
- Build path: optimized Vite production build served at `/RPGameworks/`
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts`
- Capture date: 2026-09-20
- Skin state: repository windowskin loaded with `data-skin-state="ready"`, except that forced-colors mode deliberately removes the decorative image.
- Content time: fixed at `2026-09-20T19:00:00.000Z` so save metadata is reproducible.
- Input state: keyboard unless the filename says `touch` or `forced-colors`; the token assertion also exercises controller-selected focus with a synthetic standard gamepad.

Hosted exact-commit CI evidence remains deferred while GitHub Actions quota is exhausted. Both the implementation and acceptance commits use the repository's agreed `[skip ci]` publication boundary.

## Captures

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-dialogue-1100x850.png` | 1100×850, keyboard | Mara dialogue |
| `u1-inventory-lens-1100x850.png` | 1100×850, keyboard | Inventory with one Polished lens selected |
| `u1-save-empty-1100x850.png` | 1100×850, keyboard | Three empty slots with disabled Load and Export reasons |
| `u1-save-populated-1100x850.png` | 1100×850, keyboard | Slot 1 populated from live Gallery progress |
| `u1-settings-1100x850.png` | 1100×850, keyboard | Settings panel; Debug remains separate |
| `u1-save-storage-unavailable-1100x850.png` | 1100×850, keyboard | IndexedDB unavailable with recovery explanation |
| `u1-dialogue-390x844.png` | 390×844, keyboard | Narrow Mara dialogue |
| `u1-inventory-390x844.png` | 390×844, keyboard | Narrow empty Inventory |
| `u1-save-empty-390x844.png` | 390×844, keyboard | Narrow empty Save / Load |
| `u1-inventory-touch-390x844.png` | 390×844, touch | Touch-opened Inventory |
| `u1-inventory-forced-colors.png` | 1100×850, forced colors | Inventory with visible focus |
| `u1-save-forced-colors.png` | 1100×850, forced colors | Save / Load with focus and adjacent disabled reasons |

## Review boundary

Automated checks verify source values, contrast, focus semantics, forced-colors structure, reduced-motion state retention, and capture equivalence. Ariel reviewed and approved this reference set as the U1.1 baseline. Later deliberate visual changes must create a separately reviewed reference rather than silently replacing these files.
