import type { PadState } from './gamepad-model';

export interface PadIdentity { index: number; id: string }
export interface PadEnumeration {
  rawSlotCount: number;
  nonNullCount: number;
  connectedCount: number;
}

/** MouseJoy's direct iteration: inspect every slot before filtering connected pads.
 * Browser slot numbers are not a count of connected devices. Reuse the output.
 */
export function collectGamepads(
  raw: Iterable<PadState | null | undefined>,
  output: PadState[],
  counts: PadEnumeration,
): void {
  output.length = 0;
  counts.rawSlotCount = 0;
  counts.nonNullCount = 0;
  counts.connectedCount = 0;
  for (const pad of raw) {
    counts.rawSlotCount += 1;
    if (!pad) continue;
    counts.nonNullCount += 1;
    if (!pad.connected) continue;
    counts.connectedCount += 1;
    output.push(pad);
  }
}

/** Retain the live automatic device like the supplied demo; never pick by name.
 * A deliberate manual choice remains selected even while disconnected.
 */
export function chooseGamepad(
  pads: readonly PadState[],
  manual: PadIdentity | null,
  automatic: PadIdentity | null,
): PadState | null {
  const identity = manual ?? automatic;
  const retained = identity ? pads.find((pad) => pad.index === identity.index && pad.id === identity.id) : undefined;
  return manual ? retained ?? null : retained ?? pads[0] ?? null;
}
