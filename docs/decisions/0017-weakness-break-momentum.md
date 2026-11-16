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

## 10. Not in M5.5

- Skills, elements, spending MP and combos: M5.9 and later (the data model allows multi-actor actions, as 0006 asks).
- Party weaknesses and enemy breaks of the party.
- A Scan or Libra command.
