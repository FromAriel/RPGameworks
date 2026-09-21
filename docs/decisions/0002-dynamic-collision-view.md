# 0002 — Dynamic collision view for state-resolved solidity

**Date:** September 21, 2026. **Status:** implemented (G1.1b slice).

## Context

G1.1 requires a switch gate whose passability and appearance follow a fact while the object keeps its identity, and an explicit, tested occupied-cell policy before any closing gate may overlap an actor (NEXT-SLICES §4, ROADMAP G1.1). The static grid built once by `createCollision` (src/domain/map.mjs) already bakes placement-level `solid` cells in and cannot express state changes.

## Decision

Resolve solidity from the winning object state (G1.1a) and consume it through a per-room dynamic collision view: `createDynamicCollision` (src/domain/collision-view.ts) holds an authored wall row set that always wins plus a changeable blocked-cell set derived from resolved object states, exposing a stable `canEnter` predicate for the existing pure tile-step movement. Audio/visual refresh and collision re-derivation share one commit boundary: `MapView.refresh` re-resolves affected placements after a committed state change and applies solidity deltas there. The safe occupied-cell policy is implemented purely (`applySolidityChanges`) and wired at arrival boundaries (`MapView.releaseDeferred` from the movement arrival callback and the menu-pending arrival): unblocking always applies; solidifying a cell occupied by the actor defers and re-offers on the next arrival instead of trapping, crushing, or reverting input.

## Consequences and limits

Movement and validation still share the canonical wall-row semantics; the static `content.collision` remains the build/validation-time view and the `blockedCells` diagnostic definition. Solidity state changes keep the room-stable identity of placements; none of this introduces per-frame polling (deferred entries are a bounded list re-offered only at arrivals) or a general physics system. Occupancy covers the standing tile and, during a step, the transition target; a room restart discards deferred entries because the entering room re-derives everything from committed facts. Not covered: multi-actor occupancy (single player actor), regions, or closing-world hazards; content validation of overlapping dynamic-solidity cells remains future work while G1 content keeps one gate per cell.
