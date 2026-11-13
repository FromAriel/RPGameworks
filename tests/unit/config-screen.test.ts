// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CONTROLLER_SETUP, configScreen, type PlayerSetting } from '../../src/presentation/menu/config-screen';
import { MenuNavigation } from '../../src/presentation/ui/menu-navigation';
import type { ScreenContext } from '../../src/presentation/menu/screens';

/** Decision 0016 U2.3b: Config's On/Off rows and the link to Controller setup. */
function setup(focus?: string) {
  document.body.replaceChildren();
  const values: Record<string, boolean> = { particles: true, touch: false };
  const settings: PlayerSetting[] = Object.keys(values).map(id => ({
    id, label: id === 'particles' ? 'Cosmetic particles' : 'On-screen controls', help: `${id} help`, about: [`About ${id}.`],
    get: () => values[id]!, set: value => { values[id] = value; },
  }));
  let setups = 0;
  const screen = configScreen({} as ScreenContext, { settings, controllerStatus: () => 'Controller ready.', openControllerSetup: () => { setups += 1; } }, focus ? { focus } : undefined);
  document.body.append(screen.element);
  screen.focusFirst();
  const row = (id: string) => screen.element.querySelector<HTMLButtonElement>(`.menu-row[data-id="${id}"]`)!;
  return { values, row, screen, setups: () => setups };
}

describe('Config screen', () => {
  it('shows each setting as a switch with its value, and choosing it flips the setting', () => {
    const { values, row } = setup();
    expect(document.activeElement).toBe(row('particles'));
    expect(row('particles').getAttribute('role')).toBe('switch');
    expect(row('particles').getAttribute('aria-checked')).toBe('true');
    expect(row('particles').querySelector('.menu-row-detail')!.textContent).toBe('On');
    expect(row('touch').querySelector('.menu-row-detail')!.textContent).toBe('Off');
    row('particles').click();
    expect(values.particles).toBe(false);
    expect(row('particles').getAttribute('aria-checked')).toBe('false');
    expect(row('particles').querySelector('.menu-row-detail')!.textContent).toBe('Off');
    expect(document.activeElement).toBe(row('particles')); // Focus stays on the row after it is redrawn.
    expect(document.querySelector('.menu-detail')!.textContent).toContain('Cosmetic particles: Off');
  });

  it('Left and Right flip a switch row instead of moving focus', () => {
    const { values, row, screen } = setup();
    const navigation = new MenuNavigation(screen.element, () => undefined);
    row('touch').focus();
    row('touch').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }));
    expect(values.touch).toBe(true);
    expect(document.activeElement).toBe(row('touch'));
    row('touch').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }));
    expect(values.touch).toBe(false);
    navigation.dispose();
  });

  it('Controller setup is a plain row that opens the panel, and the screen can come back focused on it', () => {
    const { row, setups } = setup(CONTROLLER_SETUP);
    expect(document.activeElement).toBe(row(CONTROLLER_SETUP));
    expect(row(CONTROLLER_SETUP).hasAttribute('role')).toBe(false);
    expect(document.querySelector('.menu-detail')!.textContent).toContain('Controller ready.');
    row(CONTROLLER_SETUP).click();
    expect(setups()).toBe(1);
  });
});
