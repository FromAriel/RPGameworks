# 0018 — Actions, damage tags and the hit pipeline

**Status:** **Approved by Ariel on November 15, 2026.** Proposed by Claude the same day after Ariel asked for a durable, reusable foundation instead of bolting weaknesses onto today's Attack ("let's just build it out the right way now, and we'll reorganize the plan around this design"). Not started. It comes before [decision 0017](0017-weakness-break-momentum.md) (weakness, break, momentum), which now builds on it, and it reorders ROADMAP M5.5 and M5.9.

## 1. Why

Weakness, break, momentum, skills, items and combos all need the same things:
- what an action costs and whom it targets;
- what kind of hit it is;
- how a target's defences change the damage.

Today these are spread across special cases:
- one `strike()` for Attack;
- a separate `areaStrike()` for enemy abilities (M5.4f);
- a heal path for items;
- reach alone telling party members apart.

Adding weakness as another special case would be rebuilt when skills arrive. This decision gives every one of them one model.

## 2. Actions

Everything a fighter does in battle is an **action** defined in content and resolved by one engine:

| Part | Meaning |
| --- | --- |
| `id`, `name` | Stable namespaced ID, display name. |
| `users` | Who may use it: party members, enemies, or both. Multi-actor actions (combos, 0006) list several users; the model allows them now, combos come later (M5.8). |
| `cost` | MP, momentum or an item, checked and spent atomically when the action resolves. |
| `targeting` | One enemy, one ally, self, all, or an area **shape** (radius, lane, column, diagonals from M5.4f) centred on a target. |
| `reach` | Melee, reach or ranged, as M5.4; for a basic attack it comes from the weapon. |
| `weight` | Timeline weight (Attack 100, Guard and Move 60, Item 80 today). |
| `power` | A **registered formula** and its numbers. JSON never holds expressions ([0006](0006-battle-system-direction.md), PLAN). |
| `tags` | The damage tags of its hits (§3). |
| `effects` | Damage, heal, guard; status effects join later (M5.9). |

- **Commands:** Attack, Guard, Item and the enemy abilities of M5.4f become actions. Move and Run stay commands, because they are not hits.
- **Basic attacks:** a party member's Attack takes its tags and reach from their **weapon**. Until equipment exists (M5.10), `party.json` gives each member a default weapon; equipment then replaces it, with no other change.
- **Special:** the battle menu's **Special** command (empty since M5.3c) lists a member's skills. A skill costs MP.

## 3. Damage tags and affinities

- **Tags:** a game declares its tags in groups, for example `weapon: slash, pierce, blunt` and `element: fire, ice`. A hit carries one or more tags: a fire spear is pierce and fire.
- **Affinities:** a fighter has an **affinity** to any tag, at one of four levels (Ariel: "if you're gonna have weak, you gotta have resist", and immune and absorb are needed for bosses):

| Affinity | Effect on a hit |
| --- | --- |
| weak | ×1.25 damage; removes one shield point (0017) and reveals the weakness |
| resist | ×0.5 damage |
| immune | no damage |
| absorb | the hit heals the target by the damage instead |

- **Several tags on one hit (Ariel):**
  1. If any tag is **absorbed**, the hit heals, with no shield damage.
  2. Otherwise, if any tag is **immune**, there is no damage and no shield damage.
  3. Otherwise, if any tag is **weak**, it is a weakness hit: ×1.25 damage and one shield point, whatever the other tags.
  4. Otherwise, if any tag is **resisted**, ×0.5.
  5. Otherwise, normal damage.

  Bosses stay protected by absorb and immune, and a weakness beats a resistance.
- **Phases:** affinities and shields can be authored per enemy and per phase (0017 §4).

## 4. The hit pipeline

A hit's damage runs through an **ordered list of registered steps**, each a small pure function. Each step reports what it did, so playback, previews, the screen reader and tests can show it:

1. base damage from the action's power formula (attack against defence today);
2. variance (the battle's seeded stream, one roll per target in party or enemy order, as M5.4f);
3. affinity (§3);
4. break bonus (0017);
5. guard;
6. shields from allies in the lane (M5.4);
7. area falloff (M5.4);
8. round up once, minimum 1 (except immune 0 and absorb).

- **Reports:** each step leaves a short record, for example "weak: pierce", "shield −1", "guarded" or "shielded once". Events carry these records, and screens read them; nothing presentational lives in the kernel.
- **Migration:** today's maths becomes steps 1, 2, 5, 6, 7 and 8. **Every recorded fight result stays identical** before anything new is authored.

## 5. First content (Ariel's choices)

| Member | Default weapon (basic Attack) | Skill (Special, costs MP) |
| --- | --- | --- |
| Hero | sword: slash, melee | **Cleave**: slash, a lane |
| Lancer | spear: pierce, reach | **Pierce**: pierce, one target, ignores one ally's shield in the lane |
| Archer | bow: pierce, ranged | **Volley**: pierce, an area (radius) |
| Mage | staff: blunt, melee | **Fire Bolt**: fire, ranged, one target |

- **Numbers:** costs and power are starting values in content, tuned by play.
- **Enemies:** affinities come with 0017's demo content.

## 6. Packets (replacing ROADMAP M5.5's single packet, and shrinking M5.9)

**M5.5a — Actions and the hit pipeline.**
- **Rules:** the action catalog and its schema; the pipeline steps; Attack, Guard, Item and enemy abilities moved onto it.
- **Acceptance:** no behaviour change; every pinned trace, unit and browser test unchanged.

**M5.5b — Tags, affinities, MP and Special.**
- **Rules:** tag groups, affinities at four levels with the precedence above, MP, and weapons and skills for the four members.
- **Screen:** Special lists skills with MP costs; MP shows in the party window, Status and the hub cards.
- **Not yet:** momentum and MP recovery come in M5.5c.

**M5.5c — Weakness, break and momentum** (0017, with Ariel's Q2–Q3 answers).
- **Shields and break:** shields and phases; break with stun, push-back and extra damage; shields regenerating.
- **Momentum:** the gauge, rounds, and MP recovery per full pip.
- **Screen:** shield pips, weakness icons, BREAK, previews.

**M5.5d — Discovery and saves** (0017 Q4). Save version 4 with the bestiary, old-save fixtures, and Codex entries showing discovered affinities and breaks.

**M5.9** then becomes **one status effect and one equipment modifier** on this model. More skills are content.

## 7. Not in this decision

- Status effects (M5.9), equipment (M5.10), combos (M5.8): the model allows them; their rules come in their packets.
- Party affinities: the model is the same for the party, but no member has affinities in M5.5.
