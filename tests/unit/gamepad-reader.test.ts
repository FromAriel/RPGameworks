import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { chooseGamepad, collectGamepads } from '../../src/platform/gamepad-reader';
import { buttonPressed } from '../../src/platform/gamepad-model';
import type { PadEnumeration, PadIdentity } from '../../src/platform/gamepad-reader';
import type { PadState } from '../../src/platform/gamepad-model';

const reference = readFileSync(new URL('../fixtures/mousejoy-reader.js.txt', import.meta.url), 'utf8');
function pad(index: number, mapping = 'standard'): PadState {
  return { index, id: `Test ${index}`, connected: true, mapping, axes: [0, 0], buttons: [0, 0] };
}
function oracle(getPads: () => (PadState | null)[]): { findGamepad(): PadState | null; buttonPressed(pad: PadState, index: number): boolean } {
  // Test-only, fixed source fixture. No authored game JSON is evaluated.
  return runInNewContext(reference + '\n({ findGamepad, buttonPressed })', {
    navigator: { getGamepads: getPads }, state: { gamepadIndex: null, gamepadName: '' },
  }) as ReturnType<typeof oracle>;
}
const counts = (): PadEnumeration => ({ rawSlotCount: 0, nonNullCount: 0, connectedCount: 0 });

describe('MouseJoy reader parity', () => {
  it.each([0, 3, 16, 32])('does not discard a connected device in raw slot %i', (index) => {
    const raw: (PadState | null)[] = Array.from({ length: index + 1 }, () => null);
    raw[index] = pad(index);
    const output: PadState[] = []; const stats = counts();
    collectGamepads(raw, output, stats);
    expect(chooseGamepad(output, null, null)).toBe(oracle(() => raw).findGamepad());
    expect(output).toHaveLength(1);
    expect(stats).toEqual({ rawSlotCount: index + 1, nonNullCount: 1, connectedCount: 1 });
  });

  it('retains the first connected device across new arrivals and replaces it on disconnect', () => {
    const first = pad(2, ''); const second = pad(0);
    let raw: (PadState | null)[] = [null, null, first];
    const demo = oracle(() => raw);
    let automatic: PadIdentity | null = null;
    const output: PadState[] = [];
    const sample = (): void => {
      collectGamepads(raw, output, counts());
      const chosen = chooseGamepad(output, null, automatic);
      expect(chosen).toBe(demo.findGamepad());
      automatic = chosen ? { index: chosen.index, id: chosen.id } : null;
    };
    sample(); raw = [second, null, first]; sample(); raw = [second]; sample(); raw = []; sample();
  });

  it('keeps a manually selected missing device missing instead of switching silently', () => {
    expect(chooseGamepad([pad(0)], { index: 2, id: 'Test 2' }, null)).toBeNull();
  });

  it('does not inherit a manual device identity when another device reuses its slot', () => {
    expect(chooseGamepad([{ ...pad(0), id: 'Replacement' }], { index: 0, id: 'Test 0' }, null)).toBeNull();
  });

  it('separates raw returned entries from connected entries and clears reused output', () => {
    const output: PadState[] = [pad(8)]; const stats = counts();
    collectGamepads([null, { ...pad(1), connected: false }, pad(2)], output, stats);
    expect(output.map(p => p.index)).toEqual([2]);
    expect(stats).toEqual({ rawSlotCount: 3, nonNullCount: 2, connectedCount: 1 });
    collectGamepads([], output, stats);
    expect(output).toEqual([]); expect(stats).toEqual(counts());
  });

  it.each([0, 0.25, 0.5, 0.75, 1, Number.NaN])('matches numeric button handling for %s', (value) => {
    const device = { ...pad(0), buttons: [value] };
    expect(buttonPressed(device, 0)).toBe(oracle(() => [device]).buttonPressed(device, 0));
  });

  it('propagates failed enumeration for the platform boundary to report', () => {
    function* failed(): Generator<PadState> { yield pad(0); throw new Error('Failed enumeration'); }
    expect(() => collectGamepads(failed(), [], counts())).toThrow('Failed enumeration');
  });
});
