# Decision 0006 — Battle system direction

**Status:** Direction agreed by Ariel on November 8, 2026 in design discussion. Planning only: nothing below is implemented, tested or accepted. Packet order lives in [ROADMAP §M5](../ROADMAP.md#m5--battle-and-core-rpg-rules); evidence lives in [STATUS](../STATUS.md).

## Context

The local M5.1–M5.2 candidate proves a pure, seeded battle kernel and safe enter/exit, but it presents the fight as a dialogue window with HP text. Ariel wants battles that feel like 8-bit, 16-bit and early 32-bit console JRPGs, plus a few modern conveniences that players reliably enjoy. This note records the agreed direction so later packets build toward one design instead of accreting features.

The architecture in [PLAN §8.4](../PLAN.md#84-battle) is unchanged: the domain resolves outcomes first, presentation replays them, and speed, skipping, reduced effects or missing art never change a result.

## Decisions

### Turn system: visible turn timeline

- Battles use a **visible timeline** showing roughly the next 8–10 turns. Speed sets how often a fighter acts. Heavy actions, haste/slow, stuns and breaks visibly move fighters along it.
- Turn order is a pure function of battle state and the battle's seeded random stream. The timeline the player sees is the timeline the kernel will execute; previews never lie.
- **Wait mode is the default.** An optional **active mode** (Settings) lets the timeline advance while the player is in a command menu. Both modes share the same rules and discrete ticks, so active mode remains replayable from recorded inputs.

### Presentation: side view with animated battlers

- A dedicated battle screen (its own Phaser scene), not a dialogue overlay. Party on one side, enemies on the other, entered through a classic transition.
- **Animated side-view battlers.** Party members use LPC-derived characters (charge in, slash, thrust, shoot, cast, hurt, victory). Enemies use Stone Soup creatures animated by a ported pixel-motion system (lunge, flinch, idle breath, hover/hop/slither styles). Art sourcing and scale are governed by [0007](0007-public-repo-external-art-assets.md) and [0008](0008-32px-world-scale.md).
- The command and party status windows use the existing windowskin and shared UI components.
- Classic touches are in scope: white hit flash, bouncing colored damage/heal numbers, critical-hit freeze and shake, defeat dissolve, status icons, victory fanfare and pose, XP/gold tally and level-up chime.

### Party

- The target is a **party of four**. Early packets may test with one or two members, but data, layout and UI must not assume fewer than four.

### Formation: three rows with slots

- Each side has **three rows**, each with a few slots, and **one fighter per slot**. Rows may overlap visually so the battlefield stays compact.
- **Reach:** melee reaches the opposing front row; reach weapons (spears) reach two rows; ranged weapons and spells reach any row. Enemy back rows are protected while their front row stands or is unbroken.
- **Exposure:** fighters further forward deal and take more physical damage.
- **Area effects have a primary target.** Full effect on the target, reduced effect on its row, less again per row of distance.
- **Pincer and back attacks use one rule:** "front" is measured from the attacking side. When enemies are on both sides, the back row is the front row for the second group. No special-case formulas.
- Formation presets with small bonuses are a later option.

### Core loop: weakness, break, momentum, combos

The four mechanics form a single loop rather than four parallel systems:

1. **Weakness and break.** Enemies have hidden weaknesses and a shield count. Weakness hits chip the shield; at zero the enemy is **broken**: stunned, pushed back on the timeline and taking extra damage. Break is expected to carry story weight, so shields and weaknesses must be authorable per encounter and per phase (for example a boss whose weakness changes).
2. **Momentum.** A shared party gauge filled by weakness hits, breaks, guarding and covering allies.
3. **Passive MP recovery.** At the end of each round, each full momentum pip restores a little MP to the party. No button press is needed; good play keeps the party supplied.
4. **Combo techs.** Two or more members spend their turns and momentum on a joint move. Many combos are designed to break shields, feeding the loop. Combos may land after the first battle screen, but the data model supports multi-actor actions **from the start**, so adding combos is content, not a kernel rewrite.

Players should be able to summarize it as "exploit weaknesses, build momentum, cash it in." The core choice is spend now (a combo) versus bank (MP recovery).

### Encounters: visible enemies plus a threat meter

- **Visible enemies** roam map zones. Touching one starts a guaranteed fight. Approaching from behind grants the party the first strike; being caught from behind gives the enemy the first move.
- A **threat meter** (a small on-screen gauge) rises with steps in dangerous areas, faster in deep dungeons and not at all in towns or safe rooms. A visible fight resets it. Low threat means a very low chance of an ambush; high threat raises it steeply.
- **Not punishing:** a threat-triggered fight starts neutral (no back attack), draws from easier groups for the area, and escape still works.
- A Settings toggle offers classic random encounters, visible-only, or the hybrid default.
- Encounter rolls use their **own seeded stream**, separate from battle rules and from PixelFX.
- **Decided (Ariel, November 12, 2026):** the threat level is not saved; it starts at zero every time a game is loaded. A player picking the game up today is never penalized for what happened in an earlier session.

### Modern conveniences

- Battle speed (1×/2×/4×) and skippable or shortened animations.
- Auto-battle and repeat-last-turn.
- **Escape always works** against ordinary encounters. Bosses or scripted fights may forbid it only when the content marks them so and the UI says why.
- Instant retry from the start of a lost battle, plus an explicit game-over/checkpoint rule.
- Previews of expected damage, weakness icons once discovered, and timeline displacement before confirming.
- A **bestiary and codex** that record discovered weaknesses and stats. Discoveries are persistent state and need the usual save-schema and migration decision.
- Gentle recovery between fights, with occasional potions; MP is the managed resource.
- Benched members still earn experience.

## Architectural constraints carried forward

- The kernel remains pure TypeScript with no Phaser, DOM, storage or wall-clock dependency. It emits an ordered list of resolved events that presentation plays back.
- Three independent seeded streams: battle rules, encounter generation, and cosmetic effects. PixelFX never consumes gameplay randomness ([0005](0005-minimum-pixelfx-contract.md)).
- Formulas are registered calculations, not an expression language read from JSON.
- Battle state stays transient. Saves remain checkpoint-only unless a separately tested mid-battle serialization design is added.
- Rewards, item spending and bestiary updates commit through the existing atomic session transactions, exactly once.

## Relationship to the M5.1–M5.2 candidate

The uncommitted candidate's seeded kernel, encounter catalog, loader, failure handling and lifecycle tests are a usable base. Its dialogue-window presentation is superseded by the battle screen. Ariel chose to commit it as a stepping stone (`b7b3d70`, November 8) and rebuild the presentation; it is a starting demo, not a design to preserve.

## Answers (Ariel, November 12, 2026)

- **Threat on load:** not saved; every loaded game starts with zero threat (see Encounters above).
- **What break does:** a successful break unlocks **extra damage** against the broken enemy, on top of the stun and timeline push-back. An enemy may **regenerate its shield ("armor") pieces** after a while, so breaks are windows rather than permanent states. Timings and amounts start as sensible defaults chosen in M5.5 and are tuned by play feel, without a long design pass first.
- **Story:** Ariel has a storyline idea for break; it is deliberately left for later. The battle system is built as a general system first.

## Open questions

- Whether weakness or shield changes mid-fight are needed in the first chapter.
- Exact numeric rules: timeline speed formula, row damage factors, area falloff, momentum gains and MP per pip. These are settled with tests and play review in their packets, not here.
