# U1.3b Inventory migration candidate captures

Post-migration captures of the Inventory screen, the second real surface normalized onto the shared U1.2 components. These are real production-build screens captured by `tests/browser/ui-reference.spec.ts` at the same states, viewports, input modes, fixed content time, and windowskin state as the accepted baselines. The accepted U1.1 and U1.3 dialogue/save references are untouched.

## Source identity

- Base state: `main` at `c181c80` plus the uncommitted U1.3b Inventory migration working tree
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts` against a fresh fixture build
- Capture date: 2026-09-21
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)

## Captures

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-inventory-lens-1100x850.png` | 1100×850, keyboard | Inventory with one Polished lens selected |
| `u1-inventory-390x844.png` | 390×844, keyboard | Narrow empty Inventory |
| `u1-inventory-touch-390x844.png` | 390×844, touch | Touch-opened Inventory |
| `u1-inventory-forced-colors.png` | 1100×850, forced colors | Inventory with visible focus |

## Deliberate visual changes (component normalization)

- Item rows use the shared selectable row: boxed `ui-list-row` controls with a literal uppercase `Selected` cyan marker (replacing the `▸ ` pseudo-element), split label and `× N` trailing text, and the component's full 1px border at rest
- The detail block uses the shared inset region: bordered raised surface with the brass outlined `ui-inset__title` treatment for the item name (previously a plain heading beside a left-border strip)
- The control hint uses the shared prompt legend: keycap-style input labels with action names (previously one dot-separated hint line)
- The three action buttons use the shared `ui-action-button` treatment with secondary/primary intents: bolder 14px labels and 44px targets
- The body and item-list scrollers host the shared scroll affordance; indicators appear only when content clips and are absent from every captured state

## Comparison against the accepted baselines

- Compared files: 12
- Byte-identical against the accepted U1.3 dialogue/save references: 7 of 7 (dialogue and Save/Load untouched by this slice)
- Byte-identical against the accepted U1.1 set: Settings only
- Changed files: 4 (all Inventory captures, the only migrated surface)
- Method: SHA-256 equality of each matched PNG
- Functional coverage: all 13 inventory scenarios, the semantic-token computed-style assertions (selected cyan surface, selection line, dashed focus ring), the 14-row scrolling proof, and the 127-scenario suite pass

Ariel's separate visual review of these four captures is the U1.3b acceptance gate.
