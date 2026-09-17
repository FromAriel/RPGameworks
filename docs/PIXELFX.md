# RPGameworks — PixelFX Design

**Version:** 0.1 · **Date:** September 17, 2026 · **Status:** Proposed subsystem, not implemented.

Parent document: [Master Plan](PLAN.md). Delivery order: [Roadmap](ROADMAP.md).

## 1. Purpose

PixelFX is a small, composable presentation layer for expressive pixel-art effects: sparks, spell impacts, trails, transformations, dissolves, palette changes, and carefully controlled screen feedback.

The visual ambition is the richness Ariel described when discussing Vampire Survivors: many distinctive animations and bursts made from modest pixel-art ingredients. This is a visual reference, not a claim about that game's current implementation, an attempt to copy its assets, or a requirement to match its maximum on-screen density.

The engine should make a handful of reusable primitives produce many distinct effects. It should not require a new TypeScript class for every spell. Equally, it should not become a universal shader editor before a single fire impact looks good.

## 2. Core contract

Game rules publish a committed presentation request containing an effect ID, source/target anchors or a world position, parameters, scene ownership, and a cosmetic seed. PixelFX validates the request, resolves the recipe, obtains required assets, and runs the effect within its quality budget.

An effect instance returns a handle supporting cancellation, completion observation, and diagnostics. Completion is useful for presentation sequencing; it must not determine whether a gameplay transaction succeeds.

### Required invariants

- Effects cannot mutate inventory, damage, quest state, or gameplay random state.
- A missing effect must not prevent a door opening or a battle resolving.
- Reducing quality changes appearance, not gameplay timing or outcomes.
- Every emitter, attachment, timer, texture lease, and render target has an owner and a bounded lifetime.
- Effect counts, spawned fragments, nested recipes, and timeline duration are bounded and validated.
- No arbitrary JavaScript is evaluated from effect JSON.
- Scene exit cancels scene-owned effects; persistent UI effects use a separately declared owner.
- An effect must not retain a destroyed actor through an uncancelled callback.

A damaging projectile is a gameplay object whose visualization may use PixelFX. A decorative spark is not promoted into an ECS combat entity merely because it moves.

## 3. What the recipe describes

A recipe contains an ID, schema version, asset references, parameters with defaults and bounds, named tracks/layers, duration policy, anchoring rules, compositing class, cost category, importance, and quality variants.

Use milliseconds for lifetime and timeline positions, logical pixels for size and distance, logical pixels per second for velocity, and a documented angle convention. Sampling a random range occurs at a declared point, such as emission, rather than accidentally every render frame.

Support a small vocabulary of easing curves. Distinguish frame-by-frame sprite animation from parameter tweening and from procedural particle movement. They may be combined but are not the same mechanism.

### 3.1 Anchors

An anchor may be a fixed world position, a snapshot of an actor's position, a live attachment to a named actor point, or a screen/UI location. The recipe explicitly selects which.

An attachment defines what happens when the actor disappears: terminate, detach at its last known position, or continue to a fixed target. The default is termination for actor-bound visuals and bounded continuation for already emitted debris.

Coordinates are interpreted through the owning camera. Do not mix CSS screen pixels, world pixels, and tile coordinates. Camera shake should not be applied twice to attached effects.

### 3.2 Timeline composition

The initial timeline supports sequences, parallel tracks, delays, finite repetition, and named markers. Nested effect references require cycle detection and a maximum expansion budget.

A marker can coordinate sound or another visual track. It does not apply damage. The battle presenter receives a previously resolved result and chooses when to show its already-determined numbers.

Short effects can complete naturally. Continuous effects, such as a torch or aura, require explicit ownership and stop rules. A recipe cannot silently request an infinite emitter with no cancellation path.

### 3.3 Parameterization

A reusable impact recipe can expose color palette, radius, direction, duration multiplier, particle-density multiplier, and an optional sprite frame set. Validate all overrides and clamp only where the contract explicitly permits it; malformed content should usually fail validation.

Do not allow content overrides to defeat the global particle limit, re-enable disabled flashes, or request arbitrary GPU resources.

## 4. Primitive families and implementation order

| Family | First implementation | Later extension |
| --- | --- | --- |
| Sprite animation | Atlas-frame burst or impact | Alternate frame sets, animation markers |
| Burst/flow | Bounded emitters using tiny atlas sprites | Different zones, arcs, attraction, analytic motion |
| Tint/flash | Controlled sprite color treatment | Indexed palette remapping and material-specific treatment |
| Transform | Position, alpha, squash/stretch | Quantized rotation and selected distortion modes |
| Trail/afterimage | Bounded sampled copies | Directional ribbons or GPU-backed layers if justified |
| Ring/beam | Pre-rendered pixel frames or repeated textures | Procedural geometry after visual/performance testing |
| Dissolve/materialize | Authored frames or one controlled shader | Directional masks, palette-aware reconstruction |
| Fragmentation | Precomputed colored blocks or sprite regions | Material-aware shards and optional GPU paths |
| Screen feedback | Shake, short overlay, controlled transition | Optional low-resolution distortion/filter passes |

The first release does not need every row's later extension. Start with enough primitives for an impact, healing effect, dust trail, and teleport impression.

Use Phaser's ordinary sprites, animations, and particle emitter facilities first. Its documented emitter configuration includes particle caps and reservation controls. Verify exact APIs on the pinned version rather than assuming older samples are compatible. See [research S2–S4](RESEARCH.md).

## 5. Pixel-art rules

### 5.1 Logical pixel space

Effects share the world's logical pixel grid. In the proposed 480 × 270 demo, a two-pixel spark is two logical pixels before enlargement, not two physical display pixels.

Use nearest-neighbor sampling and padded atlas regions. Test pixels at atlas edges, transparent borders, flipped frames, camera movement, and non-integer browser zoom.

Maintain fractional positions internally where necessary. Snap the final camera-relative presentation in strict pixel mode. Quantize the entire relevant transform consistently; rounding particle positions alone does not remove camera-induced shimmer.

### 5.2 Rotation, scale, and stylistic exceptions

Rotating a pixel sprite by an arbitrary angle changes its rasterized pattern even with nearest-neighbor filtering. Strict pixel art may use authored rotation frames, discrete angle steps, integer scale steps, or limited rotation.

Offer a deliberate expressive mode for effects where smooth rotation/stretch is aesthetically preferable. Do not describe arbitrary rotating and scaling sprites as mathematically pixel-perfect.

World art, UI text, and optional glow can have different rendering policies. The default remains crisp pixel art; soft glow is an optional enhancement, not a requirement that every object becomes blurred.

### 5.3 Layering

Define stable effect layers: beneath actors, world depth-sorted, above actors, foreground, and screen overlay. Within compatible layers, batching is encouraged. Transparent composition order must remain correct.

Alpha and additive blending have different visual behavior. Additive effects need limits because many overlapping bright sprites can erase scene detail. A black background preview alone is insufficient: test against bright tiles, dark interiors, and patterned backgrounds.

### 5.4 Readability

Effects should have a recognizable anticipation, impact, and decay where appropriate. Distinct silhouettes, rhythm, and palettes can create variety without simply increasing particle counts.

A small white impact frame, a short colored ring, a few fast fragments, and slower residual embers can be more legible than a large cloud of identical particles. Treat counts as composition controls rather than a score to maximize.

## 6. Reference effect recipes

These are design descriptions, not implemented JSON schemas or finished assets.

### Fire impact

A brief bright central frame, a radial burst of small fragments, a short expanding pixel ring, then a sparse upward ember flow. Optional sound and restrained shake. A low preset retains the central impact and ring while reducing the embers and fragments.

### Healing

An upward drift of small lights, a few staggered star frames, and a bounded actor color pulse. The textual health change remains visible with particles disabled. No camera shake is necessary.

### Teleport

A short preparatory tint, vertical pixel breakup, a departing afterimage, and a destination materialization. The actual map/position transaction has its own authoritative timing. Loading failure restores a recoverable gameplay state rather than leaving an invisible player.

### Dash

A short trail with a fixed maximum number of samples, brief dust at the origin, and optional directionally stretched frames. Trail sample spacing should depend on travel distance or a declared cadence, not uncontrolled display refresh frequency.

### Enemy defeat

A controlled flash, a few local bursts, a fragment or dissolve treatment, and a final residual effect. The defeat/reward state is committed separately and remains correct if the animation is skipped.

### Lightning / ice / poison

Lightning can start with authored jagged frame sequences and sparse sparks. Ice can use a palette treatment plus small shard frames. Poison can use a readable icon and a modest tinted aura. Material-aware emission is a future enhancement, not a requirement for all three.

The first catalog should contain roughly six carefully differentiated effects rather than dozens of nearly identical presets. Catalogue size is an authoring target, not an engine limit.

## 7. Performance and resource model

### 7.1 Optimize cost, not just count

Track live particles, live emitters, effect instances, render submissions where available, estimated covered pixels, full-screen/filter passes, texture residency, and update time.

A few large transparent quads repeatedly covering the viewport can cost more than many tiny opaque sparks. Particle count alone must not choose a quality tier or justify a performance claim.

Prefer shared small textures and compatible batching. Avoid a separate renderer/game object, independent timer, or closure chain per individual pixel when a bounded emitter or compact data path already serves the purpose.

### 7.2 Pooling and storage

Reuse the stock emitter's particle lifecycle before inventing a parallel pool. Add bounded pools for custom afterimages or fragments only where they are needed.

Prewarm a small measured reserve; do not allocate the maximum desktop capacity on every phone at startup. Grow only within a configured cap, preferably at controlled load points. Reset all reused fields so old velocity, tint, ownership, and callbacks cannot leak into the next effect.

If custom CPU particle integration becomes a measured hotspot, experiment with compact arrays or typed-array storage and fixed-capacity buffers. Keep the public recipe API unchanged. A benchmark must compare equivalent visuals and include allocation/lifecycle cost, not only an isolated arithmetic loop.

### 7.3 Provisional quality presets

These are starting stress-test caps, not verified capacities or promises.

| Preset | Global cosmetic particle ceiling | Suggested emitter ceiling | Expensive screen treatment |
| --- | --- | --- | --- |
| Reduced | 500 | 16 | None by default |
| Standard | 1,500 | 32 | At most one measured optional pass |
| High | 4,000 | 64 | Explicitly profiled, never unlimited |

Actual selected limits depend on the pinned implementation and measured hardware. Enforce limits on total concurrent work, not separately per recipe. Nested recipes cannot bypass the ceilings.

Reserve a small amount of visual capacity for important feedback; preserve a nonparticle fallback for essential cues. Under overload, reduce ambient/new low-priority emission first, then optional afterimages and embellishments. Avoid destroying the most important impact merely because a decorative torch consumed the last slot.

When changing presets, stop or reduce new emission safely and let bounded existing particles expire where possible. Do not create a repeated allocation spike while oscillating between tiers. Automatic adaptation, if added, uses hysteresis and a stable observation window, with a manual override.

### 7.4 Asset preparation

Reuse a small effects atlas plus explicitly owned special textures. Mask and fragment resources are generated once per relevant asset/frame or supplied offline. They are not rebuilt for every invocation.

Avoid synchronous GPU pixel readbacks during gameplay. Shader work, resource allocation, and readback behavior should follow the inspected WebGL guidance, but exact performance still requires testing. See [S6](RESEARCH.md).

### 7.5 GPU experiments

Phaser 4's official material describes GPU-oriented sprite/tilemap layers and its newer filter/render-node system. These are candidates for high-density visual work, not evidence that arbitrary recipes will become free. See [S2](RESEARCH.md).

An experiment must demonstrate correct blend order, frame selection, lifecycle cleanup, context recovery, quality control, and meaningful speed/memory improvement on reference devices. Retain the simpler backend until the experiment passes.

No WebGPU requirement, custom renderer fork, or GPU collision system belongs in the initial PixelFX implementation.

## 8. Sprite-aware effects and optional material metadata

Ordinary PNGs/atlases must work without special masks. Important sprites may later include authored indexed masks for regions such as cloth, metal, skin, hair, weapon, or emissive material.

These are artist-supplied labels, not something the engine can reliably infer just by looking at arbitrary colors. Their purpose is to target effects, not to enforce a universal character anatomy.

Each mask must align with its animation frame, pivot, trim rectangle, flip, and scale. Verify shared atlas packing and animation changes so a weapon glow does not land on an actor's face in the next frame.

Possible extensions include sparks on metal, a weapon-only glow, cloth-colored fragments, or palette treatment limited to a material. Edge extraction or occupied-pixel samples should be precomputed or cached at a controlled stage.

For fragmentation, begin with small rectangular blocks or sampled visible pixels with a maximum count. Preserve source color/texture coordinates. Do not require one particle per opaque pixel of every large sprite. Provide an authored-frame fallback for lower settings.

Treat material-aware breakup and dissolve shaders as independent optional features. A game can be visually rich without either.

## 9. Accessibility and player control

Expose separate controls for camera shake, screen flashes, motion density, bright additive effects, and text/number clutter. A global reduced-effects preset should be easy to find before gameplay.

Respect reduced-motion preferences. Essential state must have a stable text, icon, or shape representation independent of rapid flashes or sound. Effects must not be the only way to identify an attack outcome or an interactable object.

Avoid repeated intense flashes and unbounded full-screen brightness. Any formal accessibility conformance claim requires testing beyond this plan.

Input, camera, and dialogue remain usable while effects are busy. Effects can be paused with the game, cancelled on scene exit, and safely discarded when resuming after tab suspension.

## 10. FX laboratory

Add a developer-only laboratory once the first recipe runner exists. It uses the actual production effect engine and assets, not a separate demo implementation.

Required controls: recipe selection, fixed seed, replay, loop, pause, step, playback rate, background/map selection, sample actor, quality tier, parameter bounds, and effect cancellation.

Required diagnostics: live/peak counts, ownership, resource estimates, dropped requests, frame timings, recipe validation errors, and the currently loaded build/version.

A seed replay should reproduce the same cosmetic parameter choices, within the documented backend limitations. Do not require pixel-identical screenshots across different GPU/browser combinations.

The first editor can adjust parameters and export a complete validated recipe file. A static website cannot silently write GitHub commits without authorization. Direct repository saving requires a separate authenticated workflow; never embed a GitHub token in shipped JavaScript.

Local file export/import is the initial portable path. Chat can also change the canonical recipe in the repository. Both routes must use the same schema and avoid overwriting source content without a deliberate action.

## 11. Acceptance checklist

- A recipe can be changed without editing the effect runner.
- At least six distinct effects can be assembled from the initial primitive set.
- Identical gameplay traces produce identical domain results with effects on, off, or saturated.
- Invalid recipes fail with useful field-level errors and cannot allocate beyond caps.
- Repeated emission and cancellation return live resource counts to the expected baseline.
- Scene exit leaves no active scene-owned effects or listeners.
- Bright/dark backgrounds, moving cameras, and selected scale modes are visually inspected.
- Reduced-effects mode preserves essential feedback and disables optional screen treatment.
- Stress reports distinguish particle density from overdraw and filter cost.
- Optional masks/GPU backends are not claimed complete until their own compatibility and performance tests pass.

The desired result is not the largest possible particle count. It is a small, reliable visual vocabulary that lets new ideas become attractive effects quickly without making the rest of the RPG fragile.
