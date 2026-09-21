# U1.3c Settings migration candidate capture

Post-migration capture of the Settings screen, the third real surface normalized onto the shared U1.2 components. The Debug panel keeps its separate W1 skin treatment; only player-facing Settings controls migrated.

## Source identity

- Base state: `main` at `69acfdf` plus the uncommitted U1.3c working tree
- Capture command: `npx playwright test tests/browser/ui-reference.spec.ts` against a fresh fixture build
- Capture date: 2026-09-21
- Content time: fixed at `2026-09-20T19:00:00.000Z` (same fixture as U1.1)

## Capture

| File | Viewport / mode | Real application state |
| --- | --- | --- |
| `u1-settings-1100x850.png` | 1100×850, keyboard | Settings panel with the shared tabs controller |

## Deliberate visual changes (component normalization)

- The section tablist uses the shared `ui-tabs` controller and styles: the selected tab shows the literal uppercase `Selected:` cyan prefix, the selection surface, and the 3px cyan underline (replacing the `› ` prefix); `MenuNavigation` remains the only controller-direction owner and keyboard Left/Right/Home/End behavior is preserved
- The toolbar close (`×`), controller actions (Activate controller, Rescan, Show diagnostic report, Reset), Return to game, and the panel's Return to game button use the shared `ui-action-button` treatment with secondary/primary intents: bolder 14px labels and 44px targets
- The toolbar close meets the shared 44px `--ui-touch-target` width (previously 42px), verified at the compact 390×844 viewport
- The `#tools-panel button` W1 rules narrowed to the separate Debug panel, which keeps its existing skin treatment unchanged

## Review fixes folded into this candidate (2026-09-21)

Ariel's review of the first candidate produced two corrections before acceptance: the shared tabs controller is now the single selection path, so each programmatic or user selection notifies exactly once (input-boundary clears follow input-ownership transfer only, pinned by a new `player-shell` unit test using the pinned `happy-dom` dev dependency), and the toolbar close uses the shared touch-target width. This capture replaces the earlier candidate and reflects both fixes.

## Comparison against the accepted baselines

- Compared files: 12
- Byte-identical against the accepted U1.3 dialogue, Save/Load, and Inventory references: 11 of 11
- Changed files: 1 (the Settings capture, the only migrated surface)
- Method: SHA-256 equality of each matched PNG
- Functional coverage: tab keyboard navigation, repeated menu open cycles, controller configuration flows, skin fallback, the compact-viewport touch-target check, the new notification-count unit test, and the full 127-scenario suite pass

Ariel's separate visual review of this capture is the U1.3c acceptance gate.
