# 0001 — Base skin and shared stateful exploration

**Date:** September 18, 2026. **Status:** accepted planning decision; implementation pending.

## Context

After the player-first shell landed, Ariel approved her restrained edited windowskin as the default and asked to specify conditional doors, object changes, richer dialogue, and the remaining work. M2/M3 already contain most of the state/quest foundations, but the exact cooperation and menu-navigation dependencies were under-specified.

## Decision

Insert W1 (apply that skin to existing dialogue/Settings) before outstanding M1.6 performance closeout. Keep M2's state/transactions/storage before richer quest logic. Deliver direct controller selection navigation (N1) with the first real inventory menu and reuse it for dialogue choices. Add G1 after M2's acceptance for a key lock and switch gate using the same domain conditions, transactions and safe transition path.

Make conditional object states and trigger repeat/lifetime semantics explicit. Separate dialogue entry selection, choice visibility, choice eligibility, and accepted-choice transactions. Preserve existing finite messages and unconditional doors. Use a Workshop/Gallery/storeroom missing-lens fixture before the larger town fixture; avoid stat-dependent access until an actual exploration-stat model is separately approved. M4/M5/M6 ordering is unchanged.

## Consequences and limits

The edited image is selected artwork, not an implemented skin. Its original bytes/alpha must not be replaced with the older generator output or silently repaired. New features remain unchecked in ROADMAP; runtime, assets, dependencies and schemas are unchanged by this decision. No new performance/hardware result is implied. This explicitly supersedes the old immediate-M1.6 ordering, the earlier first town-fixture choice, and the implicit early stat-gate dependency, but not the overall small-slice architecture.

Detailed contracts and source identity: [NEXT-SLICES](../NEXT-SLICES.md). Task order: [ROADMAP](../ROADMAP.md). Current implementation: [STATUS](../STATUS.md).
