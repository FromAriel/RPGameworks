import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamepadController } from '../../src/platform/gamepad';
import type { PadState } from '../../src/platform/gamepad-model';

let raw: (PadState | null)[];
let frames: Map<number, FrameRequestCallback>;
let sequence: number;
let service: GamepadController;
let read: ReturnType<typeof vi.fn>;
const device = (): PadState => ({ id:'Fixture', index:0, mapping:'standard', connected:true, axes:[0,0], buttons:[0] });
function tick(): void {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) callback(performance.now());
}

beforeEach(() => {
  raw = []; frames = new Map(); sequence = 0;
  read = vi.fn(() => structuredClone(raw));
  vi.stubGlobal('window', Object.assign(new EventTarget(), { isSecureContext:true }));
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden:false, hasFocus:() => true }));
  vi.stubGlobal('navigator', { getGamepads:read });
  vi.stubGlobal('localStorage', { getItem:() => null, setItem:() => undefined });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  service = new GamepadController();
});
afterEach(() => { service.dispose(); vi.unstubAllGlobals(); });

describe('app-owned native sampler', () => {
  it('discovers a later device with no scene polls and without arming gameplay', () => {
    raw = [device()]; tick();
    expect(service.devices).toHaveLength(1);
    expect(service.diagnostics()).toMatchObject({ waitingForNeutral:true, sampling:{ connectedCount:1, frameSamples:1 } });
  });
  it('updates fresh native snapshots and consumes each action only once', () => {
    raw = [device()]; tick(); service.poll(true);
    raw = [{ ...device(), axes:[0.85,0], buttons:[1] }]; tick();
    expect(service.poll(true)).toEqual({ direction:'right', burst:true, interact:false, cancel:false, menu:false });
    expect(service.poll(true)).toEqual({ direction:'right', burst:false, interact:false, cancel:false, menu:false });
  });
  it('routes the same sampled controller to menus while reporting gameplay paused', () => {
    raw = [device()]; tick(); service.poll(true, 'menu');
    raw = [{ ...device(), axes:[0.85,0], buttons:[1] }]; tick();
    expect(service.poll(true, 'menu').direction).toBe('right');
    expect(service.diagnostics()).toMatchObject({ gameplayRequested:false, inputPurpose:'menu' });
    expect(service.status).toContain('gameplay paused');
    service.reset(); service.poll(true);
    expect(service.diagnostics()).toMatchObject({ gameplayRequested:true, inputPurpose:'gameplay' });
  });
  it('does not multiply native reads when a scene requests input more than once', () => {
    raw = [device()]; tick(); const calls = read.mock.calls.length;
    service.poll(false); service.poll(true); service.poll(true);
    expect(read).toHaveBeenCalledTimes(calls);
    expect(frames.size).toBe(1);
  });
  it('scene resets do not accumulate sampler callbacks', () => {
    for (let i=0; i<12; i+=1) { service.reset(); tick(); expect(frames.size).toBe(1); }
    expect(service.diagnostics()).toMatchObject({ sampling:{ frameSamples:12 } });
  });
  it('disposal cancels the callback and future polls do not touch the API', () => {
    const calls = read.mock.calls.length;
    service.dispose(); service.dispose(); tick(); service.poll(true); service.rescan();
    expect(frames.size).toBe(0); expect(read).toHaveBeenCalledTimes(calls);
  });
  it('retains enumeration errors without making stale devices available', () => {
    raw = [device()]; tick();
    read.mockImplementationOnce(() => { throw new DOMException('Denied', 'SecurityError'); });
    tick();
    expect(service.devices).toHaveLength(0); expect(service.status).toContain('SecurityError');
    expect(service.poll(true).direction).toBeNull();
    tick(); expect(service.devices).toHaveLength(1);
  });
  it('connection events prefer the newly connected pad only in automatic mode', () => {
    raw = [device(), { ...device(), id:'Second', index:1 }]; tick();
    const event = Object.assign(new Event('gamepadconnected'), { gamepad:raw[1] });
    window.dispatchEvent(event); expect(service.current?.index).toBe(1);
    service.select(0); window.dispatchEvent(event); expect(service.current?.index).toBe(0);
  });
});
