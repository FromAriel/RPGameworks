# Decision 0005 — Minimum PixelFX contract

**Status:** Implemented locally for M4.1–M4.3; pending Ariel's visual review.

The first PixelFX consumer is the existing demo Burst control. It requests the same neutral impact cue that a later battle presenter can request after resolving an action. Requests carry an effect ID, a fixed world or live actor anchor, bounded intensity, and a cosmetic seed. The returned handle reports fallback and completion and supports cancellation. The runner has no reference to session transactions or the gameplay random stream.

Recipes are finite authored JSON validated before allocation. The first vocabulary is sprite and stock particle tracks; sprite tracks cover tint, alpha, scale, and offset over time. Nested recipes are rejected in this version, so they cannot expand past the track limit. The room owns active handles and Phaser objects, while the existing foundation atlas remains the shared texture source. Travel, restart, and disposal destroy room effects. A missing or invalid request uses a small, bounded spark fallback when an effect slot is available.

This packet limits concurrent effects to four, each particle track to 16, and total live particles to 64. Saturated requests are counted and dropped. Reduced effects retain the central sprite cue and omit particles. These are correctness caps for the initial cue, not measured device capacities or the later quality presets proposed in PIXELFX.md. M5 may consume the request API without waiting for the wider M4 catalog or laboratory.
