import { describe, expect, it } from 'vitest';
import { ACTIONS, PadLatch, axisValue, buttonPressed, defaultControllerConfig, padDirection, parseControllerConfig } from '../../src/platform/gamepad-model';
import type { PadState } from '../../src/platform/gamepad-model';

const pad = (axes = [0, 0, 0, 0], pressed: number[] = [], id = 'Xbox test fixture'): PadState => ({
  id, index: 0, connected: true, mapping: 'standard', axes,
  buttons: Array.from({ length: 20 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

describe('controller configuration', () => {
  it('round trips versioned defaults with a copy of the button bindings', () => {
    const config = defaultControllerConfig(); const parsed = parseControllerConfig(JSON.parse(JSON.stringify(config)));
    expect(parsed).toEqual(config); expect(parsed?.buttons).not.toBe(config.buttons);
  });
  it.each([null, [], {}, 'config', { ...defaultControllerConfig(), version: 3 },
    { ...defaultControllerConfig(), enabled: 'true' }, { ...defaultControllerConfig(), extra: 1 },
    { ...defaultControllerConfig(), deadzone: NaN }, { ...defaultControllerConfig(), deadzone: 0 },
    { ...defaultControllerConfig(), deadzone: 1 }, { ...defaultControllerConfig(), axisX: 20 },
    { ...defaultControllerConfig(), axisY: 0 }, { ...defaultControllerConfig(), axisX: 0.5 },
    { ...defaultControllerConfig(), buttons: { up: 12 } },
    { ...defaultControllerConfig(), buttons: { ...defaultControllerConfig().buttons, burst: 12 } },
    { ...defaultControllerConfig(), buttons: { ...defaultControllerConfig().buttons, burst: 64 } },
  ])('rejects malformed or conflicting settings: %j', (value) => expect(parseControllerConfig(value)).toBeNull());
  it('allows both axes off and multiple unassigned buttons', () => {
    const config = defaultControllerConfig(); config.axisX = config.axisY = -1;
    for (const action of ACTIONS) config.buttons[action] = -1;
    expect(parseControllerConfig(config)).toEqual(config);
  });
});

describe('controller directions', () => {
  it.each([[0.24, 0, null], [0.25, 0, null], [0.26, 0, 'right'], [-0.7, 0, 'left'],
    [0, -0.7, 'up'], [0, 0.7, 'down'], [0.9, 0.4, 'right'], [0.4, 0.9, 'down']] as const)(
    'maps axes %s,%s to %s', (x, y, expected) => expect(padDirection(pad([x, y]), defaultControllerConfig())).toBe(expected));
  it('keeps the selected direction near a diagonal', () => expect(padDirection(pad([0.71, 0.75]), defaultControllerConfig(), 'right')).toBe('right'));
  it.each([[12, 'up'], [13, 'down'], [14, 'left'], [15, 'right']] as const)('maps standard D-pad %s', (button, direction) => {
    expect(padDirection(pad([0, 0], [button]), defaultControllerConfig())).toBe(direction);
  });
  it('D-pad overrides the stick, but opposing D-pad buttons cancel', () => {
    expect(padDirection(pad([1, 0], [14]), defaultControllerConfig())).toBe('left');
    expect(padDirection(pad([1, 0], [14, 15]), defaultControllerConfig())).toBeNull();
  });
  it('supports the right stick, inversion, and remapped buttons', () => {
    const config = defaultControllerConfig(); config.axisX = 2; config.axisY = 3; config.invertY = true; config.buttons.left = 4;
    expect(padDirection(pad([0, 0, 0, 1]), config)).toBe('up');
    expect(padDirection(pad([0, 0], [4]), config)).toBe('left');
  });
  it('tolerates missing and non-finite axes or buttons', () => {
    const broken = pad([NaN, Infinity]); expect(padDirection(broken, defaultControllerConfig())).toBeNull();
    expect(axisValue(broken, -1)).toBe(0); expect(buttonPressed(broken, 99)).toBe(false);
  });
});

describe('controller input ownership', () => {
  it('requires neutral before first activation and emits a button edge just once', () => {
    const latch = new PadLatch(), config = defaultControllerConfig();
    expect(latch.sample(pad([1, 0], [0]), config, true)).toEqual({ direction: null, burst: false, interact: false, cancel: false });
    latch.sample(pad(), config, true);
    expect(latch.sample(pad([1, 0], [0]), config, true)).toEqual({ direction: 'right', burst: true, interact: false, cancel: false });
    expect(latch.sample(pad([1, 0], [0]), config, true).burst).toBe(false);
    latch.sample(pad(), config, true); expect(latch.sample(pad([0, 0], [0]), config, true).burst).toBe(true);
  });
  it('requires a new neutral state after focus loss, even with a held button', () => {
    const latch = new PadLatch(), config = defaultControllerConfig();
    latch.sample(pad(), config, true); latch.sample(pad([0, 0], [0]), config, true);
    latch.sample(pad([0, 0], [0]), config, false);
    expect(latch.sample(pad([0, 0], [0]), config, true).burst).toBe(false);
    latch.sample(pad(), config, true); expect(latch.sample(pad([0, 0], [0]), config, true).burst).toBe(true);
  });
  it('drops input immediately on disconnect and rearms safely', () => {
    const latch = new PadLatch(), config = defaultControllerConfig(); latch.sample(pad(), config, true);
    expect(latch.sample(pad([1, 0]), config, true).direction).toBe('right');
    expect(latch.sample(null, config, true).direction).toBeNull();
    expect(latch.sample(pad([1, 0]), config, true).direction).toBeNull();
  });
  it('does not apply the previous controller state to a new device in the same slot', () => {
    const latch = new PadLatch(), config = defaultControllerConfig(); latch.sample(pad(), config, true);
    expect(latch.sample(pad([1, 0], [0], 'different pad'), config, true)).toEqual({ direction: null, burst: false, interact: false, cancel: false });
  });
  it('does not assume a standard mapping on unknown layouts', () => {
    const latch = new PadLatch(), config = defaultControllerConfig(); const unknown = { ...pad(), mapping: '' };
    latch.sample(unknown, config, true);
    expect(latch.sample({ ...unknown, axes: [1, 0] }, config, true).direction).toBeNull();
    config.allowUnmapped = true; latch.sample(unknown, config, true);
    expect(latch.sample({ ...unknown, axes: [1, 0] }, config, true).direction).toBe('right');
  });
  it('does not consume gameplay when disabled or out of focus', () => {
    const latch = new PadLatch(), config = defaultControllerConfig(); latch.sample(pad(), config, true);
    config.enabled = false;
    expect(latch.sample(pad([1, 1], [0]), config, true)).toEqual({ direction: null, burst: false, interact: false, cancel: false });
  });
});
