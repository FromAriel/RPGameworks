# 0014 — Battle grid, party and formation (M5.4)

**Status:** **Approved by Ariel on November 12, 2026, with all three §9 recommendations accepted.** Proposed by Claude the same day and rewritten around **Ariel's 3 × 3 grid design**; Ariel agreed in conversation to every rule in §3 and §4. Not started. It plans ROADMAP M5.4 within [decision 0006](0006-battle-system-direction.md) and [0009](0009-classic-battle-interface.md).

**Changes to 0006:**
- 0006 said fighters further forward deal and take more physical damage. That becomes **shielding**: fighters behind living allies in their lane take less damage, and nobody gets a damage bonus for attacking from cover.
- 0006's rows of slots become a **3 × 3 grid per side**, with front-facing decided per lane.

## 1. Goal

The player fights with a **party of four** arranged on a **3 × 3 grid**, against enemies on their own grid, some of them **big enough to fill several cells**. Placement decides who can be reached, who is shielded and how much area damage lands. The party's formation is set out of combat on a **formation screen** and kept in saves. In battle, a **Move** command rearranges it. Back attacks and pincers come from the same rule as an ordinary fight.

## 2. What exists today

- **Battle kernel** (`src/domain/battle.ts`, about 200 lines, no Phaser):
  - one timeline for any number of fighters;
  - commands Attack, Guard, Item and Escape;
  - enemies strike the living party member in the lowest slot;
  - damage is attack minus defence plus a seeded −1 to +1, and guarding halves it.
- **Encounters** (`encounters.json`, schema version 2): each one authors its own party (1–4) and enemies (1–6). The demo has one hero against two sigils.
- **Battle screen:** the stage places fighters by side and slot. The party window fits five rows, and the battle menu already acts for whichever party member is active.
- **Saves** are schema version 2. They hold no party, because none exists outside battle yet.

## 3. The rules

**Grid.** Each side has three **lanes** (top, middle, bottom) and three **depths** (front, middle, back). For the party, back is the left column and front is the right column, facing the enemies; the enemy grid is the mirror image.
- A fighter fills one cell.
- A **big enemy** fills a rectangle of cells (`size`, for example 2 × 2) and counts as being in every lane it covers.
- No two fighters share a cell.

**Front-facing (per lane, measured from the attacker's side).** A fighter is front-facing if no living ally stands between them and the attacker in any lane they occupy. A lone fighter at the back of an empty lane is front-facing. Allies who are downed stop shielding at once.

**Reach** (`reach` on each fighter until equipment provides it in M5.9–M5.10):

| Reach | Who has it | What it can target |
| --- | --- | --- |
| `melee` | most weapons | any front-facing enemy, in any lane |
| `reach` | spears, whips, polearms | a front-facing enemy or the first enemy directly behind it in that lane (one layer deeper) |
| `ranged` | bows, spells | anyone |

Targets out of reach are rejected (`out-of-reach`) and never offered in target selection. Enemies follow the same rules. Their choice stays deterministic and uses no random numbers: the reachable living party member nearest the front, then the lowest lane.

**Shielding.**
- One living ally ahead of the target in its lane: **20% less damage** (×0.80).
- Two living allies ahead: **35% less** (×0.65).

This applies to every attack that can reach a shielded fighter: reach weapons, ranged attacks and spells. There is no bonus for attacking from cover.

**Area attacks.**

| Steps from the centre cell (across plus down) | Damage |
| --- | --- |
| 0 (the target) | full |
| 1 | ×0.80 |
| 2 (includes diagonal neighbours) | ×0.65 |
| 3 | ×0.50 |
| 4 (opposite corner) | ×0.34 |

For a big enemy, distance is counted to its nearest cell.
- **Shapes:** an attack declares its shape. **Radius** uses the table above; **lane**, **column** and **diagonal** hit every fighter on the line at full strength unless the attack says otherwise.
- **Shields still count,** multiplied in. A fighter one step from the centre and shielded once takes 0.80 × 0.80 = 64%.

**Rounding.** After defence, variance, guard, shield and area factors, damage rounds up, with a minimum of 1.

**Move (in battle).**
- The active fighter moves to any empty cell, or swaps places with an ally.
- The ally who is swapped keeps their own turn.
- Move costs a light turn, the same weight as Guard (60 against Attack's 100), so the fighter acts again sooner.
- Big enemies can move too (AI, later). Party members always fill one cell.

**Openings.** An encounter's `opening` is one of:
- `normal` (default);
- `back-attack`: the enemy comes from the party's back side, so the left column now faces them;
- `pincer`: enemies stand on both sides, each enemy has a `flank`, and front-facing and shields are measured from that attacker's flank.

There are no special formulas: everything above asks "which allies stand between this fighter and that attacker?". First strike (the party acting first) belongs to the timeline in M5.7.

**Compatibility.**
- An encounter that places no one on the grid puts each fighter in its own lane at the front. That makes everyone front-facing with no shields, so today's encounter and its pinned traces play exactly as before.
- Every new content field is optional, so encounters stay schema version 2.

## 4. Party and saves

- **The party moves out of encounters and into game content.** A new `party.json` holds:
  - each member's stats, reach and battle frame;
  - their default cell;
  - which members start in the party (up to four active).
- **Encounters** list enemies, plus optional **guests** who join for that fight only. The demo's encounter moves its hero into the roster.
- **Saves move to schema version 3** with a `party` section: the members currently in the party and each member's cell.
  - A version 2 save loads by taking the content defaults. Old-save fixtures stay and new ones are added.
  - HP carried between fights, experience and level-ups wait for M5.6, with their own save addition.
- **Formation screen** (out of combat, from the menu): place each active member on the 3 × 3 grid, with a preview showing who is front-facing from the front and from the back. Changes commit as one transaction. It works with keyboard, controller, pointer and touch, and has a screen-reader description.

## 5. Packets

**M5.4a — Grid rules in the kernel.** Headless only.
- **Content schema:** cells, `size`, `reach`, `opening`, `flank` and guests, all validated: cells inside the grid, no overlaps, big enemies fitting, `flank` only and always in a pincer.
- **Kernel:**
  - front-facing per lane and per attacker side;
  - reach, shields and area distance;
  - lane, column and diagonal shapes;
  - Move and swap;
  - enemy targeting;
  - back attack and pincer.
- **Acceptance:** today's pinned traces are unchanged. New pinned traces cover four in formation, a big enemy, a back attack and a pincer. Tests cover every reach-by-position case, shields of 0, 1 and 2, shielding ending when a shield falls, every area distance and shape including big enemies and corner to corner, stacking, Move and swap timing, and deterministic replay. Invalid formations fail the content build with exact messages.

**Between M5.4a and M5.4b: Stone Soup creatures** ([decision 0015](0015-stone-soup-creatures.md), Ariel, November 12). Packets C1 import the library, C2 port the pixel motion and import Ariel's motion assignments, and C3 animate the creatures in battle. M5.4b then lays out the grid with real animated monsters, and its big enemy is a real creature drawn at 2 × 2 instead of a placeholder sigil.

**M5.4b — The grid on the battle screen, party of four.**
- **Content:** the demo battle gets four members in an authored formation (party art, Q1) against a mixed group including one big enemy. The party is still authored in the encounter until M5.4d moves it.
- **Stage:** battlers stand at their cells, with lanes stacked and slightly overlapped so 640 × 360 stays readable.
- **Shields:** a small marker shows shielded fighters, with one or two pips.
- **Target selection** offers only reachable targets, and the help line explains why one is missing ("Out of reach").
- **Party window and mirror:** the party window lists four members, and the hidden DOM mirror and screen-reader text follow.
- **Acceptance:** browser tests play to victory and defeat, never offer an unreachable target, and keep keyboard, controller and pointer input working. Ariel plays it.

**M5.4c — Move in battle.**
- **Menu:** the command list gains **Move** (the bottom windows grow by one row if a skin needs it). Choose a cell or an ally on the party grid, with the same input and cancellation as targeting.
- **Playback:** fighters slide to their new cells, and the timeline shows the light cost.
- **Acceptance:** browser and kernel tests for move, swap, cancel and timing; Ariel plays it.

**M5.4d — Party roster, formation screen, save version 3.** `party.json`, guests, the save migration with old-save fixtures, and the formation screen (in the new menu style if that track comes first, Q2).
- **Acceptance:** a formation set on the screen is the formation the next battle uses, and it survives save and load. A version 2 save loads with the defaults. Transactions are atomic, and repeated opens add no listeners.

**M5.4e — Back attack and pincer on the screen.**
- **Back attack:** the party turns to face enemies arriving from the left.
- **Pincer:** enemy groups stand on both sides, and each party sprite faces the flank it last fought.
- **Testing:** two more practice sigils in the Supply Room start these fights until M5.7's map contact chooses openings.
- **Acceptance:** browser tests for both, traces matching the kernel, Ariel's play review.

**M5.4f — Area attacks you can see.** One enemy gains an area attack ("Shard Burst", radius), and the big enemy gets a lane attack. Playback shows the hit cells and the reduced numbers. The party's own grid spells come with skills in M5.9.
- **Acceptance:** browser tests and pinned traces; Ariel's play review.

## 6. Not in M5.4

- HP carried between fights, experience and rewards: M5.6.
- Equipment that sets reach: M5.9–M5.10.
- Party skills and spells: M5.9.
- Weakness, break and momentum: M5.5.
- Map contact choosing the opening: M5.7.
- Formation presets with bonuses: later.
- **Animated battlers, the director system, and the menu redesign** are separate tracks (§8).

## 7. Risks

- **Readability:** four party members, a big enemy and up to eight more in two grids must stay legible at 640 × 360. M5.4b ends with Ariel's play review before anything builds on its layout.
- **Save change:** version 3 needs the same discipline as version 2 (migration, fixtures, atomic writes); it is its own packet.
- **Tuning:** shields at 20%/35% and the area table are starting values, kept in one table in the kernel and tuned by play.

## 8. Related tracks Ariel raised (planned separately)

- **Animated battlers.**
  - Party members run to their target and strike, casters gesture and their spell travels and hits, and enemies lunge and flinch.
  - This builds on S1.5 (LPC party art) and S1.6 (creature motion) and replaces today's short lunge in playback.
  - Outcomes stay decided before playback; skipping and speed-up stay exact.
- **Director system for signature attacks.**
  - Scripted scenes for special attacks: sprites moving around the stage, explosions, effects on the enemy, and optionally a full pre-rendered movie (FMV) for the biggest signature spells.
  - It needs its own decision. That decision covers the script format (data, never arbitrary code), cancellation and skipping, ownership of every sprite, timer and sound, the PixelFX rule that effects are cosmetic, and how movies are stored and licensed.
- **Menu screens redesign.**
  - The menu, inventory and help screens are still plain lists, the same problem the battle screen had before M5.3c.
  - A redesign track would give the main menu, inventory, party, formation, journal and help screens proper JRPG layouts on the W1 windows.

## 9. Questions for Ariel

| | Question | Claude's recommendation |
| --- | --- | --- |
| **Q1** | Art for the three new party members and the big enemy until LPC and creature art arrive? *(Superseded for enemies by decision 0015: enemies, including the big one, use Stone Soup creatures. Placeholders remain for the party.)* | **Original placeholders from the asset script:** the hero recoloured with a spear, a bow or a staff, and a large sigil drawn at 2 × 2. Committable, so the public build keeps working. |
| **Q2** | Order of the menu redesign against the formation screen (M5.4d)? | **Plan the menu redesign right after M5.4c,** then build the formation screen as its first screen in the new style. M5.4a–c don't depend on it. |
| **Q3** | When do animated battlers and the director system come? | **Animated battlers after M5.4,** together with S1.5 and S1.6 so the motion is designed on real art. **The director system after the first skills (M5.9),** when there is a signature attack to direct. Both get their own decision first. |
