# 0016 — JRPG menu screens (U2)

**Status:** **Approved by Ariel on November 13, 2026, with all six §8 recommendations accepted.** Proposed by Claude the same day from Ariel's direction in the U2 planning session. Not started. It plans ROADMAP U2 and extends [decision 0002](0002-workshop-astral-ui-language.md) (UI language) and the U1 component system. Window frames stay on the W1 skin system ([decision 0011](0011-reusable-window-skins.md)).

## 1. Goal

The game's menus look and play like a classic Final Fantasy-style JRPG menu, and they are easy to extend. A developer using this open repository, or Ariel building a commercial game from a private copy, can add, remove, rename and reorder menu entries, and add whole new screens (a codex, a bestiary, crafting), without rewriting the menu system.

## 2. What exists today

- **Menu:** pressing the menu key opens the **Inventory dialog**, a single window with a list, a detail box, and buttons for Journal, Save/Load, Settings and Return. The **Journal** lives inside that dialog.
- **Settings and Debug** share a side panel with tabs; **Help** is a collapsible "How to play" section inside Settings.
- **Save/Load** is its own dialog with three slots, import and export.
- **Rendering:** these are web-page elements drawn at the browser's own resolution, so the pixel font UNSCII renders slightly blurry at most sizes. The battle screen is drawn crisply at the game's 640 × 360 scale, with a hidden page layer for input and screen readers.
- **Shared parts:** windows use the W1 skins; buttons, tabs, lists and confirmations come from the U1 component system (`src/presentation/ui/`); `MenuNavigation` handles keyboard and controller movement.
- **Items** have no categories. The party outside battle is just the hero; a party roster arrives with M5.4d.

## 3. Ariel's direction (November 13)

- **Final Fantasy-style hub**, the most recognisable JRPG menu.
- **Same crisp pixel scale as battle**, so UNSCII renders as clean pixel squares.
- **Full screen.** A game that wants the menu dimmed over the map can change that itself; RPGameworks ships the generic version.
- **Portraits:** generic placeholders now, better ones later (from LPC characters, S1).
- **Easy to customise and extend**, including screens that are not in the repository.

## 4. The look

**The hub** (the screen the menu key opens):

```
┌────────────────────────────────────────┐┌───────────┐
│ [portrait] Hero       Lv 3             ││ Items     │
│            HP  29/30  ▓▓▓▓▓▓▓▓▓░       ││ Status    │
│            MP   8/10  ▓▓▓▓▓▓▓▓░░       ││ Formation │
│ [portrait] Archer     Lv 3             ││ Journal   │
│            …                           ││ Codex     │
│ [portrait] Lancer     …                ││ Config    │
│ [portrait] Mage       …                ││ Help      │
│                                        ││ Save      │
└────────────────────────────────────────┘├───────────┤
                                           │ Workshop  │
                                           │ 0:42:10   │
                                           │ 120 G     │
                                           └───────────┘
```

- **Party cards** on the left: portrait, name, level, HP and MP bars, and status marks when those exist.
- **A command column** on the right, built from the game's menu data (§5).
- **Small info windows** below it: location now; play time and money once those systems exist. Each is a slot in the menu data, so a game can show what it has.

**Every sub-screen uses one grammar:**
- a **help line** window along the top, as in battle;
- **tabs** under it when the screen has categories;
- a **list** on the left and a **detail** window on the right;
- a **party picker** when something applies to a member ("use on whom?");
- **confirm** and **number** pickers when needed.

**One way to drive it:**
- the ▶ cursor with confirm and cancel;
- shoulder buttons or Q and E to switch tabs or party members;
- the same keyboard, controller, pointer, touch and screen-reader support as battle.

**Every window is a W1 skin window**, so reskinning the game reskins every menu.

## 5. How it stays customisable

1. **The menu is data.** A `menu.json` in the game's content lists the hub entries in order: ID, label, which screen it opens, an optional unlock condition using the existing condition vocabulary (for example "after fact X"), and the info-window slots. Adding, removing, renaming, reordering or hiding entries is a data edit. It is validated by a schema like every other content file.
2. **Screens come from a registry.** A screen is a small module registered under an ID (`builtin:items`, `builtin:journal`, or a game's own `mygame:crafting`). The contract is short and documented:
   - open and close;
   - which shared blocks it shows;
   - how it reacts to confirm, cancel and tab switching;
   - which session transactions it may run (for example spending an item).

   Screens get the skin, the cursor, input, focus and accessibility for free.
3. **Shared blocks:** list, detail, party cards, tabs, help line, info window, party picker, confirm, number picker and grid. Every built-in screen is built from these, so the repository's own screens are the examples.
4. **Data-only screens.** A generic **catalog screen** (categories, a list and a detail with text and an optional picture) is driven by a content file. A codex, a bestiary, a glossary or a credits screen is a catalog file plus a menu entry, with no code.
5. **Code plug-ins** for truly unique screens such as crafting. They register a screen ID in a game's own code and appear in `menu.json` like any other entry. The documentation walks through one example.
6. **Look and layout:**
   - window skins (already in place);
   - colour and font tokens;
   - two layout presets as data: the command column on the right (default) or on the left.

   A game that wants something else entirely can register its own hub screen.

## 6. Packets

**U2.0 — Menu layer, blocks and data.**
- **Menu layer:** a full-screen layer drawn at the game's 640 × 360 pixel scale and enlarged in whole steps with the game, so UNSCII is crisp (§8 Q1).
- **Blocks:** the shared blocks with their input (cursor, confirm, cancel, tab switching), focus and screen-reader behaviour.
- **Data and registry:** the screen registry and its contract, and the `menu.json` schema with validation.
- **Acceptance:** the blocks shown in the UI gallery at 1× and 2×; unit tests for the registry, the menu data and its errors; browser tests for keyboard, controller, pointer and screen-reader paths; UNSCII pixel-crisp at 1× and 2× (checked by capture).

**U2.1 — The hub.**
- **Replaces** the Inventory dialog as what the menu key opens.
- **Shows** party cards (today just the hero; the roster arrives in M5.4d), placeholder portraits (§8 Q4), the command column from the demo's `menu.json`, and the location window.
- **Acceptance:** browser tests open and close the hub from every input, move through entries, and return to the map with focus restored; an entry hidden by its unlock condition appears after the fact is set.

**U2.2 — Items.**
- **Layout:** category tabs, the item list, the detail window, and "use on whom?" for items with a field use (Key Items show detail only).
- **Content:** items gain an optional `category` (§8 Q2).
- **Acceptance:** browser tests for browsing, tab switching, using an item on a member, and a key item; spending is atomic, as today.

**U2.3 — Journal, Help, Config and Save on the blocks.**
- **Journal:** quests as a list with detail, moved out of the Inventory dialog.
- **Help:** a real screen with topics and controls per input device, replacing the collapsible section.
- **Config:** the player settings moved out of the side panel. Debug stays a separate developer tool (§8 Q5).
- **Save/Load:** restyled on the blocks with the same rules and recovery.
- **Acceptance:** the existing quest, settings and save browser tests pass on the new screens, adapted only for the new layout; old saves load.

**U2.4 — Codex, the first data-only screen, and the extension guide.**
- **Codex:** the catalog screen with a `codex.json` schema; the demo codex covers the creatures met so far and some Workshop lore.
- **Credits:** a screen built the same way, listing Stone Soup (and later LPC) credits.
- **Guide:** a written walkthrough of adding a data-only screen and registering a code plug-in, with a small test-only plug-in screen as the worked example.
- **Acceptance:** a test adds a catalog screen with data only; the plug-in example registers and opens; credits come from the libraries' credit data.

**Then M5.4d** (decision 0014) builds the party roster, the **Formation** screen and the **Status** screen on these blocks, with save version 3.

**Execution answers (Ariel, November 13, before U2.0):**
- **Touch:** small touch screens keep the pixel-scaled menus for now, with whole rows tappable (full width). A later mobile pass may revisit this.
- **W1:** the window painter measures windows by their layout size inside the scaled menu layer, so skins are not enlarged twice. Existing windows paint identically (golden and browser tests).
- **Small windows (Ariel, during U2.0):** a window too small for its skin draws plain on its own instead of failing the skin for every window; a failed skin load still fails it everywhere.

**Execution notes (U2.0):**
- **Controller v4:** tab switching needed two new controller actions (*Menu: previous tab*, *Menu: next tab*, buttons 4 and 5 by default), so controller settings are now version 4, migrated from v1–v3.
- **Grid block:** deferred to M5.4d's formation screen, the first screen that needs it.
- **Help line:** not a live region, because each row's help is already its description; the detail window is the live region.

**Execution notes (U2.1):**
- **Interim entries (Ariel, before U2.1):**
  - Items, Journal, Save, Config and Help open the existing windows until their screens exist, and come back to the hub.
  - Status, Formation and Codex show greyed with "Arrives later."
- **Party card:** the hero's card has a name and a portrait but no HP or MP bars. Outside battle there are no lasting party stats until M5.4d.
- **Default menu:** a game without `menu.json` gets a built-in default (Items, Journal, Config, Help, Save; location).
- **Test tag:** hub tests use the existing `@inventory` area rather than a new tag.

**Execution notes (U2.2, Ariel's answers):**
- **Sorting:** an **All** tab before the categories, and a sort bar (Type, A-Z, Qty). R or the controller's Burst button cycles the sort, which is remembered for the play session but not saved.
- **Use:** browsing only until M5.4d gives the party lasting stats. The "use on whom?" picker moves to M5.4d.
- **E key:** on screens with tabs, Q and E step the tabs. Enter, Space or the controller's confirm button picks the focused row.

**Execution notes (U2.3, Ariel's answers):**
- **Sub-packets:** U2.3 is cut into three, each tested and committed on its own: U2.3a Journal and Help with the old Inventory dialog removed; U2.3b Config with Debug split off; U2.3c Save/Load rebuilt on the blocks.
- **Controller setup:** the detailed controller form (device, axes, live inputs, diagnostic report) stays the existing panel. Config links to it, and it closes back to Config.
- **Return to game:** in the settings, "Return to game" goes to the game, while × or Escape go back to the menu (U2.3a).
- **Config rows (U2.3b):** existing settings only (Cosmetic particles, On-screen controls, Controller), plus Controller setup. Text scale waits until there is a player text-size setting.
- **Side panel (U2.3b):** one panel, two modes, no tabs: Controller setup (from Config) or Debug (F2).
- **Activate controller (U2.3b):** it and the detection status sit at the top of Controller setup. Config's detail window shows the status.

## 7. Not in U2

- Equip and Skills screens, which arrive with equipment and skills (M5.9–M5.10).
- Shop and crafting screens.
- LPC portraits (S1).
- A menu dimmed over the map (a game can do this itself).
- Animated menu transitions beyond simple open and close.

## 8. Questions for Ariel

| | Question | Claude's recommendation |
| --- | --- | --- |
| **Q1** | How are menus drawn at the battle's pixel scale: as page elements laid out in a 640 × 360 box and enlarged in whole steps, or drawn on the game canvas like battle, with a hidden page layer? | **Page elements in a 640 × 360 box, enlarged with the game.** UNSCII is built from pixel squares, so at whole-number sizes it renders crisp in the page too. Page elements keep text, scrolling, screen readers and modding with ordinary CSS simple, and they already work with the W1 skins. Battle stays on canvas for its animation. |
| **Q2** | Item categories: add an optional `category` to items now? | **Yes:** Consumables, Key Items and Materials as the default set. A game can define its own list in content, and uncategorised items fall under Consumables. |
| **Q3** | Play time and money in the info windows: when? | **Play time with save version 3 in M5.4d** (it has to be saved). **Money with the economy in M5.10.** Until then the hub shows location only; the slots exist in the menu data. |
| **Q4** | Placeholder portraits: what kind? | **Head-and-shoulders close-ups drawn from each party member's own placeholder sprite**, framed in a small window: original art, committable, replaced by LPC portraits later. |
| **Q5** | Settings versus Debug: split them? | **Yes.** Config in the player menu holds player settings only (effects, controls, text scale). Debug stays a developer panel opened separately, as it is today. |
| **Q6** | Order: all of U2 before M5.4d? | **Yes**, so the Formation and Status screens are built once, in the new style. U2.4 (codex and guide) could move after M5.4d if you'd rather get back to battles sooner. |
