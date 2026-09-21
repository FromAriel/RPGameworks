# Decision 0002 — Adopt the Workshop Astral UI language

**Status:** Accepted · **Date:** September 20, 2026 · **Decision owner:** Ariel

## Context

RPGameworks already has an exact repository-owned windowskin and working dialogue, Inventory, Save/Load, Settings, Debug, touch and recovery surfaces. Party, equipment, skills, Journal, shops and battle will add substantially more interface. Continuing with screen-specific CSS and undefined color meaning would make those systems harder to navigate, test and maintain.

Three concept directions were reviewed against the same dialogue, Inventory and battle situations:

1. **Workshop Night:** the closest evolution of the current dark navy, steel-cyan, restrained interface;
2. **Brass Observatory:** warmer authored identity through brass, lens and star-map detail;
3. **Luminous Archive:** cleaner tactical hierarchy with violet magical emphasis.

No single concept supplied the complete answer. Workshop Night was the strongest structural baseline, Brass Observatory supplied the strongest world identity, and Luminous Archive supplied the clearest language for magic and battle.

## Decision

Adopt a combined visual language with the working internal name **Workshop Astral**:

- Workshop Night owns structure: dark blue-black surfaces, pale readable text, restrained square frames, stable spacing and low visual noise.
- Cyan owns interaction: selection, focus, navigation and ordinary informational state across every player-facing system.
- Brass owns authored importance: headings, discoveries, rewards, key items, crafted value and major milestones.
- Violet owns magic: spells, MP, enchantments, magical items, supernatural status and relevant battle information.
- Outcome colors remain distinct: success, warning and danger do not borrow cyan, brass or violet as their sole meaning.
- Overlapping meanings layer. A selected spell retains cyan focus around violet magical content; a selected key item retains cyan focus with restrained brass importance.
- Every meaning also uses text, shape, marker, icon or label. Color, glow, sound and animation are never the sole carrier.

The exact existing windowskin remains the source-art foundation. The generated concept boards are directional references, not production assets, layouts or authorization to copy their invented characters, environments, portraits or icons.

## Consequences

- The first UI implementation packet centralizes semantic tokens before changing layouts or building future screens.
- Existing dialogue, Inventory, Save/Load and Settings are normalized before G1/M3 add more player-facing states.
- A test-only gallery will render production components and every relevant interaction/outcome state.
- Cyan remains stable as the learned focus language, even on violet-heavy magical or battle screens.
- Brass and violet are deliberately sparse; neutral surfaces continue to carry most screen area.
- Debug remains functionally and visually separate from the narrative player menu.
- Exact palette values remain implementation candidates until contrast, forced-colors, color-vision, narrow-layout and real-screen checks pass.
- A future theme may remap semantic tokens, but it must preserve the interaction and meaning contracts or make a new explicit decision.

## Implementation sequence

1. **U1.1:** capture real current states, finalize token values in context, centralize tokens and prove no unintended visual/behavioral drift.
2. **U1.2:** build shared production components and the state gallery.
3. **U1.3:** normalize existing player-facing screens and remove duplicated styling.
4. **U1.4:** extend the language with real gameplay—G1 messages, M3 dialogue/Journal and M5 party/shop/battle—without speculative dead screens.
5. **U1.5:** complete the cross-screen cohesion and accessibility gate before release.

Hosted CI is temporarily unavailable because the GitHub Actions quota is exhausted. This changes evidence timing, not acceptance requirements: do not intentionally trigger workflows, use applicable local checks, and record exact-commit CI as deferred until quota returns.

## Rejected alternatives

- **Workshop Night alone:** safest and most legible, but too restrained to carry all of the intended world identity.
- **Brass Observatory alone:** highly distinctive, but too dense and expensive as the default treatment for every screen.
- **Luminous Archive alone:** excellent for magic and tactics, but too far from the grounded Workshop identity as a universal shell.
- **Per-screen styling without semantic roles:** faster for one screen, but produces inconsistent focus, ambiguous colors and duplicated CSS as the JRPG grows.
- **Build all future menu screens now:** rejected because empty Party, Journal, shop or battle mockups would create untested abstractions ahead of their domain rules.
