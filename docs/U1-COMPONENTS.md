# U1.2 Shared UI Components and Gallery

**Status:** Locally verified and visually accepted by Ariel on September 20, 2026. Hosted exact-commit CI remains deferred while GitHub Actions quota is unavailable.

## Production component boundary

The shared component implementation lives in `src/presentation/ui/components.ts` and `components.css`. The stylesheet is imported after `tokens.css` and all selectors are opt-in `ui-*` classes, so existing dialogue, Inventory, Save/Load, Settings and Debug markup retain the accepted U1.1 layout and appearance.

Components create native semantic controls with literal `textContent`. They do not read game state, poll devices, own storage, evaluate authored code, or replace `MenuNavigation`. Callers own domain decisions, asynchronous work, modal input suspension and held-input clearing.

The accepted U1.2 treatment includes two deliberately scoped visual choices from gallery review. Component-level authored/value text uses a brighter brass (`#f2dda6`) with a 1px, 50%-black outline; the accepted U1.1 screen roles are not recolored. Compatible meters, selected rows, selected tabs and highlighted actions accept optional `data-ui-glow="pulse"`. The glow remains default-off and caller-selected rather than universal. It adds one static glow pseudo-element and animates only its opacity at 1800ms—no JavaScript loop, gameplay timer or state meaning. Reduced-motion mode keeps a non-animated glow, forced colors removes it, and disabling it leaves the underlying text/border/selection cues intact.

| Component | Owner and lifecycle | Input behavior | Fallback and non-color behavior |
| --- | --- | --- | --- |
| Action button | Caller owns work; handle owns one activation listener and disposes it | Native click/keyboard; busy and disabled controls suppress activation and leave directional candidates | Text label remains present; dangerous intent has a border; disabled state has an adjacent reason |
| Selectable row | Caller owns selection; handle owns activation and exposes selection/disabled updates | Native button with `aria-pressed`; pointer activation feeds the same selection callback | Visible `Selected` marker and stronger border accompany cyan |
| Tabs | Tabs controller owns tablist listeners and roving `tabindex` | Click, Left/Right wrapping and Home/End; existing `MenuNavigation` adapts controller directions | Selected text prefix, border and `aria-selected` accompany cyan |
| Status | Presenter owns only the announced region | No focus ownership; polite, atomic updates | Pending/information/success/warning/failure labels accompany the semantic border |
| Meter | Presenter owns its semantic value and visual fill | Noninteractive | Label and visible numeric `current / maximum` remain when color or motion is unavailable |
| Prompt legend | Caller supplies already-resolved action/input labels | Noninteractive and device-independent | Ordinary text remains readable and wraps; prompts never replace button labels |
| Inset region | Parent window owns placement and content | No navigation behavior | Border, heading and surface hierarchy remain in plain/forced-color modes |
| Scroll affordance | Controller owns one scroll listener and one `ResizeObserver`; `dispose()` removes both | Noninteractive; selected rows still use ordinary focus/scroll behavior | Literal `More above` and `More below` text accompanies position and color |
| Confirmation | Controller owns one pending promise and dialog listeners; disposal cancels safely | Native modal; safe Cancel receives initial focus; explicit confirm/cancel restores opener focus | Consequence text and labeled actions remain usable without windowskin art |

## Test-only gallery

`tests/ui-gallery` is a separate Vite entry configured by `vite.ui-gallery.config.ts`. Its generated output is `.tmp/ui-gallery-dist`, which is ignored by Git and is not an input to the ordinary production build. `npm run test:browser` builds the application and gallery sequentially, then serves the game at its existing project path and the gallery on a second local port.

The gallery imports the production tokens, components, navigation owner and windowskin compositor. It contains a static state matrix and an interactive lane for pointer, keyboard and controller-style semantic input. An explicit gallery action turns the optional pulse on and off for comparison. Browser coverage checks wide, compact, touch-first, forced-colors, reduced-motion, 2× page enlargement, long literal text, decorative-art failure, scrolling, focus restoration, busy/disabled behavior and repeated disposal.

Gallery screenshots are ordinary Playwright artifacts for review. They are not tracked visual baselines unless Ariel later approves specific captures.

## U1.3 migration map

| Existing surface | U1.3 production migration |
| --- | --- |
| Generic player-facing action controls | Shared action button intents and busy/disabled states |
| Inventory item and Save slot entries | Shared selectable row while preserving direct selection and detail regions |
| Settings section tabs | Shared tabs controller while retaining `MenuNavigation` as the only directional owner |
| Save/storage feedback | Shared status presenter with existing player-readable failure mapping |
| Inventory and modal control hints | Shared prompt legend fed by current configured actions/input family |
| Inventory, Save/Load and dialogue scrollers | Shared scroll affordance without moving fixed action bars |
| Overwrite/load/import decisions | Shared confirmation controller with safe focus, fresh confirmation and held-input hooks |
| Detail/description blocks | Shared inset region where the current hierarchy benefits from it |

U1.3 migrates one real screen at a time and removes duplicated CSS only after matched reference and functional tests pass. Debug remains separate except for unavoidable neutral shell primitives.

## Local evidence and remaining gate

- `npm run check`: 289 unit/content tests, strict type checking, validated content and optimized production build passed.
- `npm run test:browser`: 127 Chromium scenarios passed, including 14 gallery scenarios.
- All 12 U1.1 production reference captures remain byte-identical by SHA-256 after the dormant component stylesheet import.
- The exact windowskin audit, dependency audit, relative-document-link validation and tracked-diff whitespace check pass; the final source inspection also checks new untracked files before handoff.
- Benchmarks are intentionally not rerun because the production application adds only dormant CSS; gallery runtime exists only in the test build.

Ariel completed the visual review of the wide, compact, touch-first and forced-color gallery on September 20, 2026 and accepted the brighter outlined brass plus the optional glow. U1.3 remains a separate implementation and acceptance packet; it must not be marked complete from U1.2 automation or approval alone.
