# RPGameworks — UI Visual Language and System Plan

**Version:** 0.3 · **Date:** September 20, 2026 · **Status:** Workshop Astral tokens and real-screen references are locally implemented; U1.1 awaits Ariel's visual acceptance in [ROADMAP](ROADMAP.md).

## Purpose and authority

RPGameworks now has enough real interface—dialogue, Inventory, Save/Load, Settings, Debug, touch controls and recovery prompts—to standardize the player-facing UI before party, quest, shop and battle screens multiply one-off decisions.

This document defines the intended visual language, reusable component contracts, interaction rules and implementation sequence. It is a companion to the [master plan](PLAN.md):

- [PLAN](PLAN.md) owns architecture and accessibility boundaries.
- [ROADMAP](ROADMAP.md) owns packet order and acceptance gates.
- [STATUS](STATUS.md) owns what is actually implemented and verified.
- [WINDOW-SKIN](WINDOW-SKIN.md) owns the exact source art, packing and compositor contract.
- [Decision 0002](decisions/0002-workshop-astral-ui-language.md) records why the selected visual synthesis supersedes the three separate concept directions.
- This document owns how those foundations should become a coherent full-JRPG interface.

Planning language here is not proof that a token, component, screen or test exists. Existing behavior stays authoritative until a bounded UI packet replaces it.

## Approved visual direction: Workshop Astral

**Workshop Astral** is the working name for the approved synthesis. It combines the dependable structure of the Workshop Night concept, the authored warmth of Brass Observatory and the magical/tactical clarity of Luminous Archive. The name is design shorthand, not a public game title or trademark claim.

The interface should feel like it belongs to the same world as the Workshop and Pillar Gallery: crafted, quiet, slightly mysterious and built from dark metal, blue-black glass and small luminous details. It should read as an old-school JRPG without copying a particular commercial game's layout or assets.

The direction extends the current exact windowskin rather than replacing it:

- **Workshop Night supplies the structure:** dark blue-black surfaces, readable typography, generous spacing and restrained framing keep game art and decisions dominant.
- **Cyan supplies interaction:** cool steel/cyan light identifies focus, selection, navigation and ordinary informational state everywhere, including magical screens.
- **Brass Observatory supplies authored importance:** warm brass/parchment accents identify headings, rewards, discoveries, key items, value and crafted-world detail.
- **Luminous Archive supplies magic:** violet identifies spells, MP, supernatural states and magical systems without replacing cyan as the focus color.
- **Squared, pixel-conscious geometry** preserves the existing frame language; large soft cards, glassmorphism and rounded mobile-app styling do not fit the base theme.
- **Restrained ornament** uses brass lens/star-map detail or violet arcane detail only in available decorative zones; it never covers dense information or turns every control into decoration.
- **Readable contemporary text** remains the default. A pixel display font may be evaluated later for short headings only after licensing, Unicode coverage and small-size readability are proven.

This is a product-wide baseline, not a promise that every region must use the same color. Future game themes may remap semantic tokens and provide compatible art while retaining the same component and interaction contracts.

### Combination rule

The three accent families have distinct jobs and should not be treated as interchangeable decoration:

| Family | Meaning | Typical uses | Must not become |
| --- | --- | --- | --- |
| Cyan | “This is interactive, selected or informational.” | focus brackets, current row, navigation, links, ordinary meters, input prompts | a generic magic color that makes focus ambiguous |
| Brass | “This is authored, valuable or narratively important.” | titles, rewards, discoveries, key items, shop value, major milestones | the focus color for ordinary controls or a border on every nested panel |
| Violet | “This is magical, supernatural or status-bearing.” | spells, MP, magical items, enchantments, status effects, battle targeting accents | the universal selection color or a constant full-window glow |

When meanings overlap, roles layer rather than replace one another. A selected spell keeps a cyan focus bracket around a violet spell icon or meter. A selected key item keeps cyan focus while its name or category receives restrained brass emphasis. Text, markers, icons and labels still carry the meaning when color is unavailable.

## Design principles

1. **The game is primary.** Exploration starts clean. Persistent HUD elements appear only when their information is immediately useful.
2. **Meaning before decoration.** State, cost, target, consequence and available action must be understandable without relying on glow, animation, color or sound alone.
3. **One interaction grammar.** The same selection, confirm, cancel, paging, disabled-reason and focus-restoration rules apply across dialogue, menus, shops and battle.
4. **Progressive disclosure.** Summary first, detail on selection. Dense screens use a list-plus-detail or tabs-plus-panel structure instead of showing every statistic at once.
5. **Stable layout during decisions.** Selection does not make rows jump. Async work reserves space for status. Confirmations do not move the destructive action under a repeated input.
6. **Reconstructable presentation.** UI reflects domain state but does not own items, money, quests, battle results or saves.
7. **Pixel art and DOM text cooperate.** World graphics retain integer scaling where possible; semantic HTML text may use independent responsive sizing for legibility.
8. **Failure is a designed state.** Empty, disabled, loading, stale, incompatible, storage-unavailable and recovery states receive visible copy and an escape path.

## Interface families

| Family | Examples | Presentation rule |
| --- | --- | --- |
| Field layer | interaction prompt, area label, temporary notice, party summary | Small, nonblocking and safe-area aware; never a permanent debug dashboard |
| Message layer | NPC dialogue, narration, discovery, denial | Bottom-anchored reading window with speaker/context heading and fixed actions |
| Player menu | Inventory, Party, Equipment, Skills, Journal, Save/Load | Centered or full-height primary window with a consistent section navigator and return path |
| Transaction layer | shop, inn, item use, equip comparison, save overwrite | Shows current value, proposed change, cost and disabled reason before commitment |
| Battle layer | party status, commands, target selection, action feedback | Keeps combatants visible, makes the current phase explicit and uses the common selection grammar |
| System layer | Settings, controller configuration, accessibility, Debug | Settings follows player UI rules; Debug remains visually and navigationally separate from the game menu |
| Blocking system state | confirmation, fatal error, incompatible save, recovery choice | One clear decision at a time; safe action focused by default unless deliberate confirmation says otherwise |

Only implemented destinations appear in the player menu. Party, Journal or Equipment must not be added as dead buttons merely to suggest future scope.

## Foundation tokens

### Color roles

Use semantic names in CSS and tests; avoid scattering raw colors through individual windows. The initial values are derived from the current UI and may be tuned together during the first visual-reference packet.

| Token | Initial value | Role |
| --- | --- | --- |
| `--ui-world` | `#000000` | Letterbox and world surround |
| `--ui-surface-strong` | `#0e1724` | Primary fallback window fill |
| `--ui-surface` | `#111a29` | Standard framed surface |
| `--ui-surface-raised` | `#182838` | Controls and selected regions |
| `--ui-surface-hover` | `#243f54` | Hover/active preview only |
| `--ui-line-weak` | `#425974` | Secondary dividers and inactive outlines |
| `--ui-line-strong` | `#8da5bc` | Primary frame/control outline |
| `--ui-text-primary` | `#e7edf5` | Primary text |
| `--ui-text-muted` | `#a9b1c1` | Secondary metadata; must retain tested contrast |
| `--ui-focus-ring` | `#f1f6fa` | High-contrast keyboard/controller focus outline |
| `--ui-cyan` | `#87cbe6` | Interactive selection, navigation and informational emphasis |
| `--ui-brass` | `#c9b78b` | Authored importance, headings, rewards and crafted value |
| `--ui-violet` | `#a58cf0` | Magic, MP, enchantments and supernatural status |
| `--ui-selection` | `var(--ui-cyan)` | Semantic alias for the current selection |
| `--ui-authored-importance` | `var(--ui-brass)` | Semantic alias for authored emphasis |
| `--ui-magic` | `var(--ui-violet)` | Semantic alias for magical content |
| `--ui-success` | `#7fc79a` | Successful committed result |
| `--ui-warning` | `#e0b76a` | Recoverable risk or unsaved progress |
| `--ui-danger` | `#df8585` | Destructive/fatal action only |

U1.1 locks these initial defaults and tests their supported surface combinations. Primary, muted, title and diagnostic text meet 4.5:1 on strong, standard, raised and hover surfaces. Cyan, brass, success and warning also meet 4.5:1 on those surfaces. Violet and danger meet 4.5:1 on strong, standard and raised surfaces and at least 3:1 as indicators on hover, but are explicitly prohibited as ordinary hover-surface body text. Outcome colors stay semantically separate from the identity accents: success is not “cyan,” warnings are not automatically “brass,” and magical danger is not communicated by violet alone.

### Accent discipline

- Neutral surfaces and readable text occupy most of every screen. Accents identify hierarchy and meaning rather than filling entire windows.
- Cyan selection stays consistent across Inventory, dialogue choices, shops and battle so the player never has to relearn what is currently actionable.
- Brass is strongest at moments of discovery, reward or value. Ordinary body text and every frame edge do not become gold.
- Violet appears only when the underlying content is actually magical or supernatural. It may decorate an arcane screen, but cyan still owns focus.
- Animated glow is optional presentation. A static border, pointer, label or icon must communicate the same state with reduced motion or effects disabled.

### Type roles

| Role | Use | Starting rule |
| --- | --- | --- |
| Display | title/logo and rare chapter cards | Authored asset or separately approved face; never required for body readability |
| Window title | Inventory, dialogue speaker, battle phase | 18px minimum at ordinary desktop scale, semibold, modest tracking |
| Section title | slot, party member, category | 14–16px, semibold |
| Body | dialogue, descriptions, help and reasons | 16px preferred; 1.5–1.65 line-height; wrap rather than shrink |
| Label | control captions, short metadata | 13–14px; never the only carrier of critical long-form information |
| Numeric | HP/MP, money, quantities, diagnostics | Tabular figures where supported; monospace reserved for diagnostics and IDs |

Text size is a UI setting concern, not achieved by scaling the entire DOM window as a bitmap. Player-facing prose must support Unicode, literal text safety and localization expansion.

### Spacing and shape

- Use a **4px base unit**. Ordinary gaps are 8, 12, 16, 24 or 32px.
- Maintain at least **16px content clearance** from composed frame art; larger two-times skin layouts may use 32px.
- Player controls have a **44 × 44 CSS-pixel minimum target** on touch layouts and enough separation to avoid accidental activation.
- Primary windows remain square-cornered. Small status chips may use a slight radius only when they are not pretending to be windowskin controls.
- Use borders, dividers and spacing before adding shadows. Shadows separate a blocking layer from the world; they are not a hierarchy system by themselves.
- Motion is short and informative. Selection and focus work with animation disabled; reduced-motion removes nonessential slides, shakes and pulses.

## Window and component hierarchy

### Window tiers

1. **Primary window:** one dominant modal surface for Inventory, Party, Save/Load, shops or battle commands.
2. **Inset region:** list, detail, comparison or tab content inside a primary window. It uses dividers and surface contrast, not another fully ornamental frame at every nesting level.
3. **Message window:** bottom-anchored dialogue/narration with fixed actions and independently scrolling body.
4. **Confirmation window:** smaller blocking decision layered above its owner. It repeats the consequence and returns focus to the initiating control.
5. **Toast/status strip:** short nonblocking feedback. It cannot contain required choices or disappear before critical text can be read.
6. **HUD plate:** compact field/battle information with transparent ownership and no input focus until explicitly opened.

### Core controls

Every reusable control must define default, hover, focused, selected, pressed, disabled and busy behavior where those states apply.

- **Action button:** verb-first label; primary and secondary emphasis; destructive styling only for destructive actions.
- **List row:** stable height, leading selection marker, primary label, trailing quantity/status, optional second line; detail appears in a dedicated region.
- **Tabs/section navigator:** one selected destination, arrow/Home/End navigation, visible text labels, no icon-only critical section.
- **Meter:** label plus numeric value where precision matters; color change is supplemental.
- **Quantity stepper:** explicit minimum/maximum, current quantity, total cost/effect and confirm/cancel.
- **Choice row:** visible label, selected state, disabled reason beside or immediately below it; hidden choices do not occupy focus order.
- **Prompt legend:** derives from configured actions and current input family; prompts do not replace ordinary button labels.
- **Status message:** reserves an announced region for pending, success, warning and failure copy without stealing focus.
- **Scroll affordance:** up/down availability is visible when content is clipped; selected entries scroll into view.

The windowskin's existing control, pointer, arrow, continue and checkbox slots are candidates for these controls, not automatic requirements. Each glyph must be implemented, measured and fallback-tested before the UI relies on it.

## Navigation and input contract

- Directional input moves among meaningful choices; it does not emulate a mouse cursor.
- Confirm activates or opens detail. Cancel returns exactly one level and restores the prior meaningful focus.
- The Menu action opens the last safe player-menu landing page only from exploration states that allow it.
- Shoulder-button page/category navigation may be added when real multi-page content exists; it must remain remappable and have visible alternatives.
- Pointer activation moves semantic selection to the activated item so subsequent controller input starts from the same place.
- A held direction repeats after the existing bounded delay; confirm/cancel do not repeat through modal transitions.
- Opening, closing, swapping or reconstructing a window clears held inputs and stale async completions.
- The default focus for a destructive confirmation is the safe cancel/back action. Overwrite/load confirmations require a fresh explicit confirm.
- Disabled controls remain discoverable only when their location teaches the player something useful, and always display a nearby reason. Otherwise unavailable destinations stay absent.
- No gameplay input leaks through a focused modal, text field, file picker, transition or battle decision.

## Responsive and accessibility contract

Design and verify at three layout bands rather than shrinking a desktop composition indefinitely:

| Band | Intended behavior |
| --- | --- |
| Wide | Two-column list/detail or comparison layouts; optional Settings/Debug dock outside the play area |
| Compact | Single dominant window, reduced ornament scale, wrapped actions and shorter metadata columns |
| Touch-first | Stacked content, 44px targets, safe-area padding, on-screen gameplay controls kept clear of modal actions |

Required behavior across bands:

- preserve reading order and selected item when the layout changes;
- keep primary actions visible or intentionally sticky while long bodies scroll;
- never crop the cancel path, disabled reason, cost or current resource total;
- support browser text enlargement without overlapping controls;
- maintain `:focus-visible`, forced-colors fallback and semantic labels;
- provide text/shape/state labels for information otherwise conveyed by color, particles, motion or audio;
- treat screen-reader support as a separately tested capability, not an assumption from semantic markup alone.

## Visual application map

The approved synthesis changes emphasis by context without changing the underlying component grammar:

| Screen or state | Structural treatment | Brass role | Violet role | Cyan role |
| --- | --- | --- | --- | --- |
| Dialogue | Workshop Night message frame and readable body | speaker heading, discoveries, important names when authored | magical speaker/status cue only when relevant | continue, choice focus and ordinary information |
| Inventory | Quiet list/detail shell | key items, rarity/value, newly discovered important objects | magical item family, enchantment or MP-related metadata | row selection, tabs, prompts and scrolling |
| Save/Load | Most restrained neutral shell | valid checkpoint identity or deliberate milestone marker | none unless the saved location itself has authored magical identity | slot/action focus, informational status and progress |
| Settings | Neutral player-system shell | section title only when useful | none by default | navigation, focus, links and active controls |
| Journal/quest | Quiet readable document structure | objectives, milestones, rewards and completed major beats | magical quest/status identity only when authored | selected entry, navigation and ordinary updates |
| Shop/equipment | Dense comparison/transaction structure | money, price, crafted value, equipment quality and reward | enchantment, spell-linked gear or magical restrictions | current selection, proposed action and informational comparison |
| Battle | Clear tactical structure with minimal ornament over action | rewards, major phase headings and authored boss importance | skills, MP, status effects, magical targeting and supernatural enemies | command/target focus, turn navigation and ordinary tactical information |
| Confirmation/failure | Stable neutral blocking layer | warning only when the consequence concerns value or progress | never used as a generic error color | focus and recoverable informational paths; outcome colors convey success/warning/danger |

Debug remains outside this mapping. It can reuse neutral primitives for legibility but does not receive narrative brass/violet theming merely to resemble the game menu.

## Full-JRPG screen patterns

These patterns define continuity for later milestones without creating empty implementations now.

### Dialogue and choices

Retain the current bottom message window. Add a stable speaker/title region, body, optional portrait slot, page/continue indicator and ordered choice list. Choices use the common row states and explain disabled options. Typewriter text, backlog/history, auto-advance and portraits are later enhancements; full text must remain immediately available to accessibility and skip/advance behavior.

### Main player menu

Use one section shell for Inventory, Party, Equipment, Skills, Journal and Save/Load. A compact party/resource summary may remain stable while the content region changes. The first landing page should be the last meaningful section or a deliberately chosen status page—not a decorative dashboard with no action.

### Party, equipment and skills

Use list-plus-detail on wide screens and staged drill-in on compact screens. Comparisons show current and proposed values, direction markers and the source of restrictions. Derived numbers are presentation of domain calculations; the UI never recomputes authoritative stats independently.

### Journal

Separate active, completed and optional entries only when those concepts exist. Show the current objective and last meaningful update before long lore. Do not expose raw facts or internal quest-state IDs.

### Shop and services

Use a transaction layout: item/service, owned amount, price, affordability, projected quantity/effect, confirmation and result. Buying, selling, resting and crafting-like services may share components but not silently share incompatible domain rules.

### Battle

Keep party resources and the current actor/phase visible. Commands, targets and items use the common navigation owner. Target validity and predicted cost are explicit before confirmation. Resolved action feedback must remain readable with effects disabled or accelerated. The battle layout is specified with M5 content and must not be hard-coded into the exploration menu shell.

### Title, profile and ending flow

Title/start, Continue, New Game, slot selection, settings, credits and postgame policy form a separate flow once their behavior exists. Continue is absent until a trustworthy checkpoint policy is implemented. New Game warns before replacing progress. The title screen does not expose Debug as a player menu destination.

## Implementation architecture

- Introduce a small CSS token layer and component classes; keep domain rules out of CSS and UI modules.
- Preserve semantic HTML controls. Canvas-rendered menus are not the default for text-heavy screens.
- Keep the exact windowskin compositor as frame presentation. Do not duplicate its geometry in each feature stylesheet.
- Provide plain high-contrast fallbacks when decorative art fails or forced colors is active.
- Prefer shared primitives for selection, status, action bars, list/detail layout and confirmations. Do not create a universal UI framework or theme editor before concrete screens require it.
- Keep Debug styles namespaced so development density does not redefine player-facing typography or hierarchy.
- Add a test-only **UI gallery** that renders real production components and their states using repository-owned assets. It is a visual regression and review surface, not a second implementation or public menu.
- Store visual reference captures with the exact revision, viewport, state and input mode. A screenshot is review evidence, not functional or accessibility proof.

## Delivery plan

### U1.1 — Visual reference and token baseline

- Capture the current dialogue, Inventory, Save/Load, Settings, narrow layout and storage-failure states from the production build.
- Build a single annotated reference board from those real screens and the exact windowskin. The three generated concept boards communicate direction only; their invented characters, environments, portraits, icons and layouts are not production assets or pixel-perfect targets.
- Translate the approved Workshop Astral synthesis into a token/state matrix. Validate cyan, brass, violet and the candidate success/warning/danger colors together on every surface they can occupy.
- Add one small player-UI token source for surfaces, lines, text, accents, outcome states, typography, spacing, safe areas, target sizes and reduced-motion timing. Keep Debug-only density and diagnostic colors namespaced.
- Replace duplicated raw values in the existing player-facing styles with semantic tokens only where the rendered result is intentionally unchanged. Do not normalize screen layouts or introduce new components until U1.2/U1.3.
- Record before/after captures at the same states and viewports.

**Local candidate evidence:** [The real-screen reference set and manifest](ui-reference/u1.1/README.md) contains 12 post-refactor production captures across wide, compact, touch-first, populated, empty, unavailable-storage and forced-colors states. [The matched comparison](ui-reference/u1.1/COMPARISON.md) reports all 12 PNG pairs byte-identical. `tokens.css` is the implemented source of truth; unit and browser tests cover exact values, aliases, contrast, focus-plus-selection, disabled reasons, forced colors and reduced motion. Ariel's visual review remains outstanding, so ROADMAP correctly leaves U1.1 unchecked.

**Gate:** no player flow changes; the skin audit remains exact; matched captures show no unintended layout/visual drift; contrast/focus checks and applicable local browser tests pass; Ariel reviews the real-screen reference separately from the already approved concept direction. GitHub Actions evidence remains deferred while the account quota is exhausted and must not be implied by local acceptance.

### U1.2 — Core components and UI gallery

- Implement the production action button, list row, tabs, status message, meter, prompt legend, scroll affordance, inset region and confirmation patterns.
- Render every supported state in a test-only UI gallery at wide, compact, touch-first and forced-colors layouts.
- Add lightweight visual-regression references for geometry and state, plus semantic/controller tests for behavior.

**Gate:** every component has a defined owner, fallback and input behavior; gallery components are the production components; no duplicate navigation system is introduced.

### U1.3 — Normalize existing screens

- Migrate dialogue, Inventory, Save/Load and player-facing Settings onto the tokens/components.
- Keep Debug functionally separate and only align unavoidable shared controls.
- Remove duplicated CSS after each screen matches the approved references and its existing functional tests pass.

**Gate:** save/import recovery, long text, empty/disabled states, controller reconnect, narrow viewport and skin failure remain correct; repeated opens do not add listeners or owners.

### U1.4 — Extend with gameplay milestones

- G1 uses the message/status vocabulary for locked, unlocked and unmet-requirement feedback.
- M3 adds choice rows, speaker states and Journal patterns while completing N1.3.
- M5 specifies and implements battle, party, equipment, shop and transaction layouts against real domain rules.
- M6/M7 add title, Continue, credits, accessibility settings and release-device refinement.

Each extension updates this document only when it creates a reusable rule. Feature-specific behavior remains in its milestone contract.

### U1.5 — Cohesion and accessibility gate

- Complete a keyboard/controller/pointer tour across every implemented player screen.
- Check wide, compact, touch-first, text enlargement, reduced motion, forced colors and decorative-art failure.
- Audit copy hierarchy, focus order/restoration, prompt accuracy, contrast, clipping, localization expansion and async failure paths.
- Perform human visual review separately from automated acceptance.

**Gate:** a player can identify where they are, what is selected, what an action will do, why it is unavailable and how to return across all implemented screens.

## Verification matrix

Every implemented UI packet should select the applicable rows rather than claiming them all automatically.

| Concern | Evidence |
| --- | --- |
| Visual hierarchy | Matched-state captures reviewed at named viewports |
| Keyboard/controller/pointer | Browser flows using the same semantic controls and navigation owner |
| Layout | Wide, compact, touch-first, long text and browser text-enlargement checks |
| Accessibility fallback | Focus-visible, labels, forced colors, reduced motion and non-color state cues |
| Failure behavior | Empty, disabled, busy, cancelled, stale, incompatible and asset/storage failure scenarios |
| Lifecycle | Repeated opening, screen replacement, async cancellation and owner/subscriber counters |
| Art integrity | Exact windowskin audit and source hashes unchanged unless Ariel deliberately approves new art |
| Human acceptance | Ariel reviews the real build; record separately from automation and CI |

## Deliberate non-goals

This plan does not authorize a skin replacement, theme editor, custom font purchase, icon pack, title-screen implementation, dead menu destinations, canvas-only text UI, virtual controller cursor, arbitrary animation system, battle mock disconnected from M5 rules, or redesign of Debug into a player-facing screen.

The next implementation packet is **U1.1 only**. U1 should establish a durable visual baseline without becoming a long detour from G1 and M3 gameplay. During the current GitHub Actions quota exhaustion, work remains local and must not intentionally trigger hosted workflows; deferred exact-commit CI is recorded as a publication boundary rather than silently omitted.
