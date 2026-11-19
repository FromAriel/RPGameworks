# 0017 — Weakness, break and momentum (M5.5)

**Status:** **Approved by Ariel on November 15, 2026**, together with [decision 0018](0018-actions-and-hit-pipeline.md), which it now builds on. Ariel accepted Q2 (add MP now), Q3 (the proposed break defaults) and Q4 (save discoveries in version 4). **Q1 is answered by 0018:** after discussing options, Ariel chose a durable foundation over a per-member damage type: actions, damage tags with four affinity levels (weak, resist, immune, absorb) and a hit pipeline come first, in M5.5a and M5.5b, and this decision becomes M5.5c and M5.5d. Where §3 below differs from 0018 (damage types per member), 0018 wins. Not started. It plans ROADMAP M5.5 within [decision 0006](0006-battle-system-direction.md) ("exploit weaknesses, build momentum, cash it in") and Ariel's November 12 answers: a break adds **extra damage**, and shields **regenerate** after a while, with sensible default timings tuned by feel.

## 1. Goal

The player learns what each enemy is weak to. Hitting those weaknesses chips the enemy's shield, and at zero the enemy **breaks**: it is stunned, pushed back on the timeline and takes extra damage until its shield comes back. Weakness hits and breaks fill a shared party **momentum** gauge, and each full pip of momentum restores a little MP to the party at the end of every round. Discovered weaknesses are remembered in the Codex.

## 2. What exists today

- **Attacks:** party members have one Attack each, set apart only by reach (melee, reach, ranged). There are no damage types, elements, skills or MP.
- **Enemies:** stats, cells, reach, and since M5.4f abilities and action patterns.
- **Timeline:** ticks; an Attack moves the actor `ceil(1000 × weight / (100 × speed))` ticks later. There are no rounds.
- **Codex:** a data-only catalog (U2.4); its creature entries are placeholder text. Saves are version 3.

## 3. Damage types (superseded by [0018](0018-actions-and-hit-pipeline.md) §2–§3: hits carry damage tags from weapons and skills, and fighters have affinities)

- Every attack gets a **damage type**. Until skills arrive (M5.9), it is set per party member in `party.json` as `attackType`:
  - the Hero's sword: `slash`;
  - the Lancer's spear: `pierce`;
  - the Archer's arrows: `pierce`;
  - the Mage's staff: `blunt`.

  Members default to `slash`.
- **Types are a game's own list**, declared in content (`damageTypes` in `party.json` or a small types file), so elements such as fire or ice can be added with skills in M5.9 without a kernel change.
- **Enemy attacks have types too**, for later party weaknesses, but in M5.5 only enemies have weaknesses.

## 4. Weakness and shields (authored per enemy and per phase)

- **Fields:** an enemy may have `weaknesses` (a list of damage types) and `shield` (1–9 points).
- **Phases:** an enemy may also have `phases`, each with an HP threshold and its own weaknesses and shield, for a boss whose weakness changes (0006). When a phase starts, its shield is set in full.
- **A hit with a weakness type:**
  - deals ×1.25 damage;
  - removes one shield point;
  - reveals that weakness.
- **Other hits:** ordinary damage, and they never touch the shield.
- **No shield:** an enemy without a shield cannot break; it still takes ×1.25 from its weaknesses.

## 5. Break

When the shield reaches zero, the enemy is **broken**:

- **Stunned:** its next turn is skipped.
- **Pushed back:** it moves one ordinary Attack's delay later on the timeline, shown in the preview.
- **Extra damage:** it takes ×1.5 from every hit while broken (×1.875 from a weakness hit). This multiplies with guard, shields from allies and area falloff, rounded up once as today.
- **Recovery:** the break lasts until the enemy's second turn after the break (the stunned turn counts as the first). Then the shield **regenerates in full** and the break ends.
- **Retry** restarts all of this.

These are starting values in one table in the kernel, tuned by play (as the M5.4 shield percentages were).

## 6. Momentum and MP

- **Gauge:** a shared party gauge of **5 pips**, each 100 points.
- **Gains:**
  - a weakness hit +25;
  - a break +100;
  - Guard +10;
  - a party member defeated −50.

  It never goes below 0 or above 5 pips.
- **Rounds:** the timeline has no rounds today. A **round** ends every 100 ticks (one ordinary Attack for a speed-10 fighter), checked between actions.
- **MP:** party members gain an **MP** stat in `party.json` (`mp`). At the end of each round, every living member recovers 1 MP per full momentum pip, up to their maximum. Momentum is **not spent** by this; combos and skills (M5.9 and later) spend it.
- **Shown:** MP joins HP in the party window and on the Status screen and hub cards. Nothing spends MP until skills arrive in M5.9 (see Q2).

## 7. Discovery and the Codex

- **What is recorded:** discovered weaknesses (enemy kind and damage type) and which enemy kinds have been broken.
- **When:** the record is committed when the battle ends, through the session's atomic transaction, exactly once.
- **Where:** saves move to **version 4** with a `bestiary` section; older saves load with nothing discovered, and old-save fixtures are added.
- **Enemy kind:** an enemy's `kind` (for example `demo:creature.clay-golem`) links fights to its Codex entry. Several encounters can share a kind.
- **Codex:** a creature entry shows its discovered weaknesses ("Weak to: pierce, ?") and whether it has been broken. A battle shows weakness icons under an enemy's name only once discovered (0006: "weakness icons once discovered").

## 8. Questions for Ariel

| | Question | Claude's recommendation |
| --- | --- | --- |
| **Q1** | What can an enemy be weak to before skills exist? | **A damage type per party member's attack** (slash, pierce, blunt), as a game-defined list that elements join in M5.9. |
| **Q2** | MP: there is none yet, and nothing can spend it until skills (M5.9). Add MP and momentum recovery now, or only the gauge? | **Add MP now** (stat, windows, recovery per pip), so the whole loop can be played and tuned; skills spend it in M5.9. |
| **Q3** | Break defaults? | **§5's values:** stun one turn, push back one Attack's delay, ×1.5 damage while broken, full shield back on its second turn after breaking; weakness hits ×1.25. Tuned by play. |
| **Q4** | Remember discoveries in saves now (version 4 and the Codex), or keep them for one play session? | **Save them now** (version 4), as its own sub-packet after the battle rules, so a fight's discoveries survive and the Codex can show them. |

## 9. Packets (proposed; replaced by 0018 §6: M5.5a actions, M5.5b tags, affinities, MP and Special, M5.5c this decision's rules and screen, M5.5d discovery and saves)

- **M5.5a — Rules in the kernel.** Damage types, weaknesses, shields, phases, break, recovery, momentum, rounds and MP, with validation and pinned traces. Today's encounters play exactly as before when nothing is authored.
- **M5.5b — On the battle screen.**
  - **Enemy window:** an enemy's shield points as small pips beside its name, and discovered weaknesses as icons.
  - **Break:** a flash and the word BREAK; the broken enemy dims and its timeline icon moves back.
  - **Party window:** the momentum gauge and MP.
  - **Previews:** the help line shows "Weak!" before you confirm a weakness hit.
  - **Demo content:** the drills' creatures get weaknesses and shields.
- **M5.5c — Discovery and saves.** Save version 4 with the bestiary, old-save fixtures, Codex creature entries showing discoveries.

Each ends with tests (kernel traces, browser play to a break, atomic discovery) and Ariel's play review.

## Execution notes (M5.5c-1, November 18)

Ariel's choices for M5.5c:
- **Split:** c-1 is the rules and demo content, with battle text only; c-2 is the screen.
- **Weakness icons and the "Weak!" preview:** show weaknesses revealed in the current battle. M5.5d keeps them across battles and saves.
- **Phases:** built now, with the Two-Headed Ogre as the example.
- **Demo table:**

| Enemy | Weak | Resists | Shield |
| --- | --- | --- | --- |
| Bat | pierce | | 2 |
| Clay Golem | blunt | slash | 3 |
| Two-Headed Ogre | fire | | 4 |
| Two-Headed Ogre at half HP | pierce | fire | 4 |

The same creature has the same affinities and shield in every demo fight.

What was built:
- **Content:** enemies may have `shield` (1–9) and `phases`. Each phase has a `below` HP percent, which must fall from one phase to the next, and optional `affinities` and `shield`. Validation keeps both on enemies and checks phase tags against the catalog.
- **Pipeline:** a `break` step (×1.5) after the affinity step, so a weakness hit on a broken enemy is ×1.875, rounded up once.
- **Order of a landed hit's effects:**
  1. A weakness hit adds momentum and reveals the tag.
  2. A living enemy at a phase threshold starts that phase: new affinities, a full shield, and any break ends. That hit does not also remove a shield point.
  3. Otherwise a weakness hit removes a shield point; at zero the enemy breaks.
- **Break:**
  - The enemy is stunned and pushed back one Attack's delay.
  - Its next turn is a `stunned` event: it takes no action, and its pattern does not advance.
  - On the following turn its shield is restored (a `recover` event), and it then acts as usual.
- **Momentum:**
  - **Gains and losses:** `MOMENTUM` in the kernel: +25 per weakness hit (each area hit counts), +100 per break, +10 per party Guard, −50 per fallen member.
  - **Range:** kept between 0 and 500.
- **Rounds:** one every `ROUND_TICKS` (100) ticks of the timeline, checked after every action. Each full pip restores 1 MP to every living member, up to their maximum. Momentum is not spent.
  - A `round` event is recorded only when someone recovered MP, so fights without momentum keep their exact events.
- **Snapshots:**
  - **Combatants:** `shield`, `maxShield`, `broken`, `stunned`, `phase` and `revealed` (tags found weak this battle).
  - **Battle:** `momentum` and `round`.
- **Events:**
  - new kinds `break`, `stunned`, `recover`, `phase` and `round`;
  - a hit that removed a shield point carries `shieldLeft`.
- **Not yet:** party weaknesses, and stage effects for these events (M5.5c-2).

## Execution notes (M5.5c-2, November 18)

Ariel's choices for the screen:
- **Momentum:** the bottom row of the party window: "Momentum" and five pips.
- **Enemy information:** shield pips at the right of each name in the enemy window. Weaknesses go in the targeting help line rather than as icons in the window.
- **Break:** a flash, "BREAK!" in gold, and the enemy dimmed while broken. The stunned turn and recovery get small words.

What was built:
- **Enemy window:**
  - **Pips:** one per shield point, full ones light blue and spent ones hollow; all hollow while broken.
  - **Long names:** a name shortens to make room ("Two-Heade." beside four pips).
- **Party window:** the momentum row.
  - **Pips:** a full pip is gold; the one being filled is dark gold.
  - **Timing:** the gauge shows the last snapshot's value, so it updates when playback ends.
- **Targeting help line:**
  - **Known weaknesses:** "Weak: blunt" lists the weaknesses revealed this battle that apply in the enemy's current phase.
  - **"Weak!":** shown when the chosen attack or skill would land on one of them.
  - **"Broken":** shown while the enemy is broken.
  - **No hints:** an affinity not yet revealed is never suggested. "Weak!" needs the real outcome to be weak (a hidden absorb or immune outranks it) and a revealed tag behind it.
- **Stage:**
  - **Break:** a white flash and a 2× gold "BREAK!"; the enemy fades to 55% while broken.
  - **Stunned and recovery:** "Stunned" in grey; "Recovered" in light blue, and the enemy brightens.
  - **New phase:** a flash and "Phase 2"; the pips refill to the new maximum.
  - **Round's end:** "+N MP" rises over each member who recovered.
  - **Pips during playback:** each hit's `shieldLeft` and each break, recovery or phase update the pips as the event plays.
- **Floating text:** every floating word and number now stays on the stage floor. On the top lane it starts lower and rises less instead of crossing the turn timeline; this covers BREAK! and ordinary damage numbers too.
- **Runtime snapshot:** each battler's `points`, `broken` and `alpha` (in `art`), and the battle's `momentum` and `round`.

## Execution notes (M5.5d, November 19)

Ariel's choices:
- **Links:** each enemy has a `kind` ID, and Codex creature entries name the same kind. A creature catalog file was not added.
- **What is remembered:** every affinity a hit has shown (weak, resist, immune, absorb), not only weaknesses, and whether the kind has ever been broken.
- **When:** at every end of a battle attempt (victory, escape, defeat), once per attempt. Retry is a new attempt, so a lost fight keeps what it found.
- **Codex:** creature entries stay listed; they gain discovery lines.

What was built:
- **Content:**
  - **Enemies:** may have `kind` (`<game>:creature.<name>`). Validation keeps it on enemies and requires every enemy of one kind to have the same affinities, shield and phases, so a discovery holds everywhere.
  - **Codex entries:** may have `kind`: a kind some enemy has, at most one entry each.
  - **Demo:** `demo:creature.bat`, `demo:creature.clay-golem` and `demo:creature.two-headed-ogre`, on every demo enemy and Codex creature entry.
- **Save version 4:**
  - **State index:** gains `bestiary`, each kind and the tags it has any affinity to (`bestiaryKinds`). A save may record only those.
  - **Saves:** gain `session.bestiary`, for example `{"demo:creature.clay-golem": {"affinities": {"blunt": ["weak"]}, "broken": true}}`. Levels are listed once each, in the order weak, resist, immune, absorb.
  - **Older saves:** versions 1–3 load into version 4 by the existing legacy rule (save version and compatibility N, content M), with nothing discovered.
  - **Compatibility:** the demo's save compatibility is now 4.
- **Session:**
  - **Recording:** a `recordDiscoveries` action merges discoveries. It only adds, never removes; a repeat is `unchanged`, and an unknown kind, tag or level rejects the whole transaction.
  - **Change keys:** `bestiary:<kind>`.
- **Kernel:** each enemy carries its `kind`, `seen` (for each tag behind a hit's affinity, the levels shown, in any phase) and `everBroken`. `discoveriesOf(snapshot)` groups them by kind.
- **Battle:** the scene records an attempt's discoveries when it ends.
  - **Help line:** counts a weakness as known if it was found this battle or is in the bestiary, and only while it applies in the enemy's current phase. So the Ogre's pierce weakness shows only in its second phase.
- **Codex:** creature entries add "Weak: …. Resists: …." (also "Immune", "Absorbs") and "Broken in battle.", or "Affinities: none found yet." (`describeDiscoveries`).
- **Fix:** the save screen showed play time only for version 3 saves; it now shows it for version 3 and later.

## 10. Not in M5.5

- Skills, elements, spending MP and combos: M5.9 and later (the data model allows multi-actor actions, as 0006 asks).
- Party weaknesses and enemy breaks of the party.
- A Scan or Libra command.
