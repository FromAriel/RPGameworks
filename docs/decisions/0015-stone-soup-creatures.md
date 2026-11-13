# 0015 — Stone Soup creatures in the repository, with pixel motion

**Status:** **Ariel's decisions, November 12, 2026.** Recorded by Claude, with the import planned from the answers below. Not started.
- **Exception to the art rule:** Stone Soup is public domain, so it is the one exception to [decision 0007](0007-public-repo-external-art-assets.md)'s "no third-party art in git" rule.
- **Timing:** the monsters and their motion come in after M5.4a, before the grid goes on screen.
- **Motion assignments:** Ariel's full first-pass classification is the starting set.
- **Tools:** the motion lab and classifier come later.

It changes [decision 0007](0007-public-repo-external-art-assets.md) for Stone Soup only, brings ROADMAP S1.6 forward, and changes [decision 0014](0014-battle-grid-and-party.md)'s packet order.

## 1. Decision

**Dungeon Crawl Stone Soup monster art is committed to the repository.**
- **Licence:** the 32 × 32 tiles are dedicated to the public domain under CC0 1.0.
- **Ariel's reasoning:** decision 0007 was deliberately cautious for licences that need credit-packaging work (LPC above all). Stone Soup needs none of that. Including it gives the framework's users real creatures to work with.
- **What goes in:** all 1,282 monster images, with the CC0 licence text, both pack readmes and the credits file.
- **Credit:** the pack asks for credit as a courtesy, and the credits file gives it.

**Unchanged for everything else.** LPC and any other third-party art stay local-only under decision 0007.

## 2. Source and provenance

- **Lineage:** Ariel's DanJen Delver project (`J:\Dungeonminusdelver`) imported the library from the Stone Soup "Full" and October 2010 crawl-tiles releases. Ariel's Splurt project (`G:\splurt`, read only from here) copied it on November 10, 2026 and added newer motion code.
- **The copy:** comes from Splurt's `assets/tiles/library/dcss/monster/`. The import records a SHA-256 list of every file and checks the list against DanJen Delver's library where the same files exist.
- **Size:** about 5 MB of PNGs. Every image is 32 × 32. Splurt's packed 910-frame atlas is derived output and is not copied; RPGameworks bakes its own.
- **Paths:** monsters keep their Stone Soup IDs, for example `dcss/monster/undead/skeletal_warrior_new`, so Ariel's assignments and any future Splurt or DanJen Delver data line up.

## 3. Pixel motion

**The routines.** From one still image, they:
- find the creature's drop shadow and body;
- build a short pose loop by moving pixels: alternating leg steps and arm swing (**walk**), a sideways wave (**slither**), or a bounce and lean (**float**, Splurt's `hover`);
- keep the shadow planted while the body moves.

Splurt's `tools/pose-sprite.mjs` (Ariel's code, adapted from DanJen Delver) and the presets in its `config/battlers.json` are ported to strict TypeScript. Like the skin bake (0013), it is pure pixels, with no PixiJS or Phaser.

**The assignments.**
- **Source:** Ariel's classification of all 1,282 monsters (589 walk, 379 float, 314 slither; `J:\DOWN Loads\sprite-motion-assignments.json`, audited in Splurt on November 12).
- **Format:** committed as a validated data file keyed by monster ID. A wrong ID or an unknown style fails the content build.
- **Unchanged:** the assignments are a starting point to tune.

**Baking.** Poses are baked deterministically for the creatures the game's encounters use, into an atlas with each pose and a white hit-flash variant. Tests compare against fixtures.

**Battle stage.**
- **Placement:** an enemy names a `creature`; its old `frame` stays as the fallback.
- **Idle:** enemies loop their idle poses with a stable phase offset per enemy.
- **Attacking:** the existing lunge and hit flash use the baked poses and flash.
- **Reduced motion:** shows the still image.
- **Outcomes:** stay decided before playback, and skipping and speed-up stay exact (the PixelFX rule from decision 0005).
- **Big enemies:** a 2 × 2 enemy draws its 32 × 32 creature at twice the size, pixel-sharp. Stone Soup's assembled creatures (Pandemonium lords, hydras, tentacles) are left for later.

**What this does not cover.** The party's animated characters (running to the target, casting) still come from LPC art (S1.5) and the animated-battlers track. Splurt's motion lab and classifier come over later as local tools, when Ariel needs to re-tune motions.

## 4. Packets (between M5.4a and M5.4b)

**C1 — Import the library.**
- **Files:** copy the 1,282 monster PNGs, the CC0 licence, both readmes and the credits to `assets/source/creatures/stone-soup/`, plus a SHA-256 manifest. `.gitattributes` keeps the PNGs binary.
- **Guards:** `check:external-art` keeps guarding `external/` and the other ignored roots, and its policy text names this exception. The credits appear in `NOTICE`.
- **Acceptance:** every PNG is listed and its hash matches; a test reads every file as a 32 × 32 RGBA PNG; the game build is unchanged.

**C2 — Port the motion and import the assignments.** *(Ariel, November 12: the pose code is a JSDoc-typed `.mjs` module checked by the strict typecheck, like `battle-grid.mjs`, because the content build that bakes poses also runs on the Pages runner's Node 22, which cannot run `.ts` files.)*
- **Code:** a strict TypeScript pose module, the motion presets as a validated data file, and the 1,282-entry assignments validated against the library.
- **Tests:** ported from Splurt and DanJen Delver (synthetic shadow, palette kept, feet move, presets valid), plus deterministic bakes against fixtures.
- **Acceptance:** those tests pass, and the assignments cover every library ID with known styles.

**C3 — Animated creatures in battle.** *(Ariel, November 12: the clay golem and the bat. The creature texture belongs to each battle and is removed when it ends; the decoded image is cached.)*
- **Data:** encounter enemies gain an optional `creature`, and the content build bakes poses for the creatures in use.
- **Stage:** it draws idle loops, the lunge and the hit flash, with the reduced-motion and fallback paths.
- **Demo:** the sigils become two real creatures Ariel picks or approves.
- **Acceptance:** browser tests for the animated battle, reduced motion, and a missing creature falling back to its frame; Ariel's play review.

M5.4b then lays out the grid with these creatures, and its big enemy is a real creature drawn at 2 × 2.

## 5. Open items

- **Demo creatures:** which creatures the demo uses, including the big one. Claude will propose a few from the library for Ariel to pick in C3.
- **Assembled creatures:** multi-piece creatures (Pandemonium lords, hydras, tentacle chains) need assembly rules first (Splurt's audit lists the groups).
- **Map enemies:** the same motion will drive roaming map enemies in M5.7.
