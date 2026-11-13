// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { mountPlayerShell } from '../../src/presentation/ui/player-shell';

/** Minimal page chrome matching index.html: the shell owns chrome only, never world state. */
function buildShellDom(): HTMLElement {
  document.body.replaceChildren();
  const stage = document.createElement('div');
  stage.id = 'stage';
  const toggle = document.createElement('button');
  toggle.id = 'tools-toggle';
  const touch = document.createElement('div');
  touch.id = 'touch-controls';
  const touchEnabled = document.createElement('input');
  touchEnabled.id = 'touch-enabled'; touchEnabled.type = 'checkbox';
  const panel = document.createElement('aside');
  panel.id = 'tools-panel'; panel.hidden = true; panel.tabIndex = -1;
  const title = document.createElement('h2');
  title.id = 'tools-title'; title.textContent = 'Controller setup';
  const close = document.createElement('button');
  close.id = 'tools-close';
  const resume = document.createElement('button');
  resume.id = 'tools-resume';
  const controllerSection = document.createElement('section');
  controllerSection.id = 'controller-section';
  const activate = document.createElement('button');
  activate.id = 'controller-activate';
  const settings = document.createElement('details');
  settings.id = 'controller-settings';
  controllerSection.append(activate, settings);
  const debugPanel = document.createElement('section');
  debugPanel.id = 'debug-panel'; debugPanel.hidden = true;
  panel.append(title, close, controllerSection, debugPanel, resume);
  document.body.append(stage, toggle, touch, touchEnabled, panel);
  return stage;
}

/** Decision 0016 U2.3b: the side panel shows Controller setup (from Config) or Debug (F2), one at a time. */
describe('player shell modes', () => {
  test('each mode shows its own section and title; switching inside the panel keeps input ownership', () => {
    const stage = buildShellDom();
    let boundaries = 0;
    let changes = 0;
    const shell = mountPlayerShell(stage, () => { boundaries += 1; }, () => { changes += 1; }, () => true);
    const settings = document.getElementById('controller-settings') as HTMLDetailsElement;
    expect(boundaries).toBe(0);
    expect(changes).toBe(0);

    shell.open('controller'); // Entering the panel is the single input-boundary clear.
    expect(boundaries).toBe(1);
    expect(changes).toBe(1);
    expect(document.getElementById('tools-title')!.textContent).toBe('Controller setup');
    expect(document.getElementById('controller-activate')).toBe(document.activeElement);
    expect(settings.open).toBe(true); // The form is always shown; its open state pauses gameplay.
    expect(document.getElementById('controller-section')!.hidden).toBe(false);
    expect(document.getElementById('debug-panel')!.hidden).toBe(true);
    expect(shell.debugVisible).toBe(false);

    shell.open('debug'); // F2 while the panel is open: focus stays inside, so no second clear.
    expect(boundaries).toBe(1);
    expect(changes).toBe(2);
    expect(document.getElementById('tools-title')!.textContent).toBe('Debug');
    expect(document.getElementById('controller-section')!.hidden).toBe(true);
    expect(document.getElementById('debug-panel')!.hidden).toBe(false);
    expect(settings.open).toBe(false);
    expect(shell.debugVisible).toBe(true);

    shell.close(); // Leaving the panel returns ownership and clears input exactly once.
    expect(boundaries).toBe(2);
    expect(changes).toBe(3);
    expect(document.getElementById('tools-panel')!.hidden).toBe(true);

    shell.dispose();
    expect(document.getElementById('tools-panel')!.hidden).toBe(true);
  });
});
