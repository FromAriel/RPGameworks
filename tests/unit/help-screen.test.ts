import { describe, expect, it } from 'vitest';
import { buttonName, helpLines } from '../../src/presentation/menu/help-screen';
import { defaultControllerConfig } from '../../src/platform/gamepad-model';

/** Decision 0016 U2.3a: Help describes controller buttons as they are bound now. */
describe('Help controls text', () => {
  it('names standard buttons, numbers non-standard ones, and says when an action is unassigned', () => {
    expect(buttonName(2)).toBe('X (button 2)');
    expect(buttonName(9)).toBe('Menu (button 9)');
    expect(buttonName(40)).toBe('button 40');
    expect(buttonName(-1)).toBe('unassigned');
  });
  it('uses the current bindings, so remapped buttons are described as they are', () => {
    const buttons = { ...defaultControllerConfig().buttons, interact: 3, cancel: -1 };
    expect(helpLines('talking', 'controller', buttons)).toEqual([
      'Face someone or something, then Y (button 3): talk, read or open.', 'Y (button 3): next page.', 'unassigned: close.',
    ]);
    expect(helpLines('moving', 'keyboard', buttons)[0]).toBe('Arrow keys or W A S D: walk.');
  });
});
