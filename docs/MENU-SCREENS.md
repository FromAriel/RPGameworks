# Adding menu screens

The game menu ([decision 0016](decisions/0016-jrpg-menu-screens.md)) is data plus a registry of screens. You can change it in three ways, from least to most work:

1. **Edit `menu.json`** to add, remove, rename, reorder or hide entries. No code.
2. **Add a catalog file** for a codex, bestiary, glossary or credits list. No code.
3. **Register a code plug-in** for a screen that needs its own behaviour, such as crafting.

Every screen is built from the shared menu blocks, so it gets the window skin, the ▶ cursor, keyboard, controller, touch and screen-reader support without extra work.

## 1. The menu entries (`menu.json`)

The game manifest names the file (`"menuFile": "menu.json"`). Each entry has:

| Field | Meaning |
| --- | --- |
| `id` | Unique within the menu, for example `bestiary`. |
| `label` | The command name, at most 16 characters. |
| `screen` | `builtin:items`, `builtin:journal`, `builtin:catalog`, `builtin:config`, `builtin:help`, `builtin:save` (with `builtin:status` and `builtin:formation` arriving in M5.4d), or a game's own `mygame:crafting`. |
| `catalog` | For `builtin:catalog` only: which catalog it shows. |
| `help` | The help line while the entry is highlighted. |
| `when` | Optional. The entry appears only while this condition holds, using the map condition vocabulary (`factEquals`, `itemAtLeast`, `questStateEquals`, `placementOpened`, `all`, `any`, `not`). |

An entry whose screen is not registered appears greyed, with "Arrives later." `npm run validate` checks the file: unique IDs, known built-in screens, existing catalogs, and conditions that name facts, items, quests and placements the game defines.

## 2. A data-only screen (a catalog)

**Step 1. Write the catalog file**, for example `content/games/mygame/catalogs/bestiary.json`:

```json
{
  "schemaVersion": 1,
  "title": "Bestiary",
  "categories": [
    {"id": "beasts", "label": "Beasts"},
    {"id": "spirits", "label": "Spirits"}
  ],
  "entries": [
    {"id": "mygame:beast.wolf", "category": "beasts", "title": "Wolf", "text": ["Hunts in packs."]},
    {"id": "mygame:beast.drake", "category": "beasts", "title": "Drake", "text": ["Breathes fire."],
      "when": {"type": "factEquals", "factId": "mygame:fact.drake-seen", "value": true}},
    {"id": "mygame:spirit.wisp", "category": "spirits", "title": "Wisp", "text": ["A floating light."]}
  ]
}
```

- **Categories** become tabs, stepped with Q/E or the shoulder buttons. Leave them out for a single list.
- **`text`** holds the paragraphs of the detail window: up to 12, of up to 400 characters each.
- **`when`** keeps an entry as **???** until its condition holds. The top window then counts what has been found ("Found 2 / 3").
- **`libraryCredits`** (credits catalogs) names art libraries, for example `["stone-soup"]`. The content build reads each library's own credit file and adds a category with one entry about the library and one per artist. Credits therefore cannot drift from the art you ship. Libraries are listed in `tools/library-credits.mjs`.

The schema is `schemas/catalog.schema.json`.

**Step 2. List it in `game.json`:**

```json
"catalogs": [
  {"id": "bestiary", "file": "catalogs/bestiary.json"}
]
```

**Step 3. Add the menu entry:**

```json
{"id": "bestiary", "label": "Bestiary", "screen": "builtin:catalog", "catalog": "bestiary", "help": "Creatures you have met."}
```

Run `npm run validate`. The demo's Codex and Credits are built this way (`content/games/demo/catalogs/`).

## 3. A code plug-in screen

Use this when a screen needs behaviour that a catalog cannot express.

**Step 1. Write the screen.** A screen is a function that receives a `ScreenContext` and returns a `MenuScreen`:

| Member | What it does |
| --- | --- |
| `element` | The screen's root, filled with windows from the blocks. |
| `focusFirst()` | Focuses the first control. It runs when the screen opens or comes back to the top. |
| `step(delta)` | Optional: Q/E or the shoulder buttons, usually tabs. |
| `secondary()` | Optional: the controller's Burst button, for a second action such as changing a sort. |
| `cancel()` | Optional: return `true` when the screen handled Cancel itself (for example closing a pop-up). Otherwise the menu goes back. |
| `sample(pad, delta)` | Optional: take controller input before the menu, returning `true` when used. Save uses it while a confirmation is open. |
| `dispose()` | Releases everything the screen owns. |

The context offers `services.holds(condition)`, `open(screenId, params)`, `back()` and `close()`.

The blocks are in `src/presentation/menu/blocks.ts`:
- `menuWindow` places a skinned window in the 640 × 360 menu;
- `createList` makes rows of choices; a row can be disabled, or be an On/Off switch;
- `createDetail`, `createHelpLine`, `createTabs` and `createInfo` cover the detail window, help line, tabs and info windows;
- `createPartyCards`, `createConfirm` and `createNumberPicker` cover party cards, a Yes/No question and a number choice.

The worked example is `tests/fixtures/plugin/notes-screen.ts`. It is a list of notes with a detail window and a "Done" row that closes the menu. Shortened here:

```ts
export const NOTES_SCREEN = 'example:notes';

export function notesScreen(context: ScreenContext, notes: readonly Note[]): MenuScreen {
  const element = document.createElement('div');
  const listWindow = menuWindow({ title: 'Notes', box: { x: 0, y: 50, w: 260, h: 310 } });
  const detailWindow = menuWindow({ box: { x: 260, y: 50, w: 380, h: 310 } });
  const detail = createDetail();
  detailWindow.body.append(detail.element);
  const list = createList({
    label: 'Notes',
    entries: [...notes.map(n => ({ id: n.id, label: n.title, help: n.text })), { id: 'done', label: 'Done' }],
    onChoose: id => { if (id === 'done') context.close(); },
    onFocus: id => { const n = notes.find(n => n.id === id); detail.set(n ? { heading: n.title, lines: [n.text] } : null); },
  });
  listWindow.body.append(list.element);
  element.append(listWindow.element, detailWindow.element);
  return { element, focusFirst: () => list.focus(), dispose: () => element.remove() };
}
```

**Step 2. Register it** in `src/game-screens.ts`, under your game's namespace:

```ts
export function registerGameScreens(registry: ScreenRegistry): void {
  registry.register(NOTES_SCREEN, context => notesScreen(context, MY_NOTES));
}
```

**Step 3. Add the menu entry:** `{"id": "notes", "label": "Notes", "screen": "example:notes"}`.

### Rules for screens

- **Keep game rules out of the screen.** A screen reads what it is given and reports choices. Changes to the game go through the session's transactions, as the Items screen will when using items arrives (M5.6, with lasting HP).
- **Clean up on `dispose()`.** Remove listeners, timers and pending work. The menu disposes a screen whenever it closes or the game unloads.
- **Test both paths.** Add a unit test that registers the screen and opens it (see `tests/unit/catalog-screen.test.ts`) and, for real input, a browser test through the hub.
