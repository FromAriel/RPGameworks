# Decision 0009 — Classic battle interface (Final Fantasy style)

**Status:** Direction set by Ariel on November 9, 2026, and implemented locally the same day as M5.3c (see STATUS). It supersedes the interim full-width "battle window" layout. It also refines the presentation part of [0006](0006-battle-system-direction.md): "command and status windows on the shared UI" becomes the dedicated windows below.

## Context

Two play reviews of M5.3b found the battle reading as a web dialogue: one large framed box, bordered web buttons with a dashed focus ring, sentence-length labels ("Attack Practice Sigil"), prose that stays on screen and names floating on the stage. Ariel preferred an intermediate capture with the commands stacked in a column on the right and asked for the look of classic Final Fantasy and Dragon Quest. Final Fantasy (4–6) is the model because our battlers face each other side-on; Dragon Quest's top status boxes suit front-view battles.

## Decisions

### Screen layout (640 × 360 logical)

```
┌──────────────────────────────────────────────────────────────┐
│ [ help / action line                                       ] │  y 0–24
│ Next ▣ ◇ ✦ ▣ ✦ ◇ ✦ ▣                                         │  timeline strip
│                                                              │
│        ✦        ◇                          ☺                 │  stage, y ≤ 216
│      ▼  (target cursor)                                      │
├─────────────────┬──────────────────────────────┬─────────────┤
│ Practice Sigil  │ Hero      29/ 30   12/ 12    │ ▶ Attack    │  y 224–360
│ Sigil Shard     │ (up to 4 party rows)         │   Special   │
│                 │                              │   Item      │
│                 │                              │   Guard     │
│                 │                              │   Run       │
└─────────────────┴──────────────────────────────┴─────────────┘
```

- **Enemy window** (bottom left, about 176 px): one name per line, up to six; the stage shows art only. Identical enemies are lettered (Sigil Shard A, B).
- **Party window** (bottom centre): one row per member: name, HP current/max, MP when the character has it, and later the momentum pips and the active-time gauge (M5.5, M5.8). Four rows fit. The active member's row is highlighted. Party HP moves off the stage.
- **Command window** (bottom right, stacked in a column, as Ariel preferred): it opens for the active character with a ▶ cursor. Sub-lists (Special, Item) open as a wider window over the party and enemy windows, as in FF6.
- **Help / action line** (one-line window at the top): during selection it describes the highlighted entry ("Restores 12 HP", or why it is unavailable); during playback it names the action ("Attack", "Workshop tonic"), FF-style.
- **On the stage:** battlers, hit flash, rising damage numbers, PixelFX and the turn timeline (our modern touch) stay. Enemy HP numbers leave the stage; enemy HP bars remain for now, and whether they later depend on bestiary knowledge is a design question for M5.5.

### Command tree

| Command | Behaviour |
| --- | --- |
| **Attack** | Usually goes straight to target selection. A character with authored attack variants (weapon styles) gets a short sub-list first. |
| **Special** | The class's own list, labelled per character from content: **Skills**, **Magic**, **Tech** and so on. **Combo** techs live here too, listed with their partners; unavailable ones are greyed with the reason (partner down, not enough momentum). Until the first skill lands (M5.9), Special is shown greyed with "No specials yet". |
| **Item** | Battle-usable items with counts, then a target. Atomic spending is unchanged. |
| **Guard** | Immediate, no target. |
| **Run** | Escape. Always works in ordinary fights; content-marked fights show it greyed with the reason. |

### Fast input: "tap, tap, tap"

- **Nothing is committed until the final confirm.** Menus and targeting only build a command; the kernel receives it once, so Cancel at any depth is free and backs out one level.
- **Cursor memory.** Each character's menu remembers its last command, sub-entry and target, so a repeated basic attack is two presses (Attack, confirm) and a repeated spell is three or four.
- **Sensible default targets.** Attacks and harmful specials start on the last target if still valid, otherwise the first living enemy; healing starts on the most injured ally.
- **Same input everywhere.** Keyboard and controller: arrows move, Confirm/Cancel. Pointer and touch: tap a command, then tap the enemy or ally sprite directly (tapping a sprite while Attack is highlighted attacks it). Targeting crosses sides with left/right for items and support specials.
- **During playback**, Confirm or tap skips, and a held or second key cycles speed; the help line shows these as hints rather than buttons. Repeat-last-turn and auto-battle arrive with M5.8 and reuse cursor memory.
- **Disabled entries stay visible**, greyed, with the reason in the help line, never silently missing.

### Rendering: windows drawn on the canvas, with an accessible mirror

- The windows, text and cursors are drawn by Phaser on the battle stage, in UNSCII 16 baked to a bitmap (`pixel-font.ts`) and a window frame drawn in pixels, so everything scales with the game and stays pixel-exact. The DOM approach cannot do this on Windows, where Chromium softens page text.
- One **pure battle-menu model** (no Phaser or DOM) holds the menu tree, cursor positions, memory, availability reasons and the command being built. The canvas windows and a **visually hidden DOM mirror** both render from it.
- The mirror keeps today's guarantees: focus stays in a real `<dialog>` with menu items, the input owner and controller navigation keep working, screen readers get the current menu, the help line and an `aria-live` battle log, and pointer hits on canvas windows map to the same model actions. Browser tests drive the mirror.
- The shared dialogue's battle layout (`battle-window.css`) is retired when this lands; the interface text scale and UNSCII 16 elsewhere stay.

### Window style

**Chosen by Ariel (November 9): FF-style blue panels**: a deep blue vertical gradient with a light pixel border and soft inner bevel, drawn from our own original frame art (no copied game assets). **Correction:** M5.3c drew these with a separate `Graphics` renderer and hard-coded `PANEL_STYLE` constants, bypassing the windowskin and theme path; they are not authored content. [Decision 0010](0010-baked-pixel-frame-windows.md) replaces that with baked frames shared by every window (W2.2).

## Delivery

**M5.3c — Classic battle interface** (before M5.4, which then grows the party window to four rows):

1. **Battle-menu model** (pure TypeScript, unit tested): command tree, per-character Special label, sub-lists, targeting across sides, cursor memory, default targets, availability reasons, cancellation without commitment, producing exactly the kernel's existing commands. Special exists but is empty until M5.9.
2. **Canvas windows**: frame drawing, enemy, party, command and help windows, the ▶ cursor and an on-stage target cursor, layout at 640 × 360, cleanup with the battle view.
3. **Input and accessibility**: keyboard, controller and pointer/touch through the model; the hidden DOM mirror with focus, menu semantics and the live log; playback hints for skip and speed.
4. **Checks**: unit tests for the model; browser flows rewritten against the mirror (victory, tonic, escape, defeat and Retry, narrow-screen controller, pointer taps on sprites); resource counts back to baseline; captures at 1×, 2× and 3×.

**Later packets use it:** M5.4 fills the party window with four rows and row positions; M5.5 adds momentum pips to the party window; M5.8 puts combos under Special and adds repeat-last-turn and auto-battle; M5.9 adds the first real skill and spell lists.

## Answered questions (Ariel, November 9, 2026)

- **Battle log:** stays in the help line and screen-reader text for now; a visible History view can be reconsidered with the pacing options (M5.8).
- **Enemy HP bars:** stay on the stage next to the enemies, even where HP is also shown by name, because they are good visual feedback.
- **Special label:** **Skills** for now. It may later follow each character's class (for example Magic for a wizard).
- **Play review:** Ariel played this interface and reports that it played well. The window art is replaced separately by [decision 0011](0011-reusable-window-skins.md) (W3.5); until then the battle windows use the hard-coded panels described above.
