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
  panel.id = 'tools-panel'; panel.hidden = true;
  const title = document.createElement('h2');
  title.id = 'tools-title'; title.textContent = 'Settings';
  const settings = document.createElement('details');
  settings.id = 'controller-settings';
  const tablist = document.createElement('div');
  tablist.className = 'panel-tabs ui-tabs'; tablist.id = 'tools-tabs';
  tablist.setAttribute('role', 'tablist');
  const optionsTab = document.createElement('button');
  optionsTab.id = 'options-tab'; optionsTab.type = 'button';
  optionsTab.setAttribute('role', 'tab'); optionsTab.setAttribute('aria-selected', 'true');
  optionsTab.setAttribute('aria-controls', 'options-panel');
  const debugTab = document.createElement('button');
  debugTab.id = 'debug-tab'; debugTab.type = 'button';
  debugTab.setAttribute('role', 'tab'); debugTab.setAttribute('aria-selected', 'false');
  debugTab.setAttribute('aria-controls', 'debug-panel'); debugTab.tabIndex = -1;
  tablist.append(optionsTab, debugTab);
  const close = document.createElement('button');
  close.id = 'tools-close';
  const resume = document.createElement('button');
  resume.id = 'tools-resume';
  const optionsPanel = document.createElement('section');
  optionsPanel.id = 'options-panel'; optionsPanel.setAttribute('role', 'tabpanel');
  const debugPanel = document.createElement('section');
  debugPanel.id = 'debug-panel'; debugPanel.setAttribute('role', 'tabpanel'); debugPanel.hidden = true;
  panel.append(title, settings, tablist, close, resume, optionsPanel, debugPanel);
  document.body.append(stage, toggle, touch, touchEnabled, panel);
  return stage;
}

describe('player shell tab notifications', () => {
  test('selections notify exactly once; boundary clears follow input-ownership transfer', () => {
    const stage = buildShellDom();
    let boundaries = 0;
    let changes = 0;
    const shell = mountPlayerShell(stage, () => { boundaries += 1; }, () => { changes += 1; }, () => true);
    expect(boundaries).toBe(0);
    expect(changes).toBe(0);

    shell.open('options'); // Programmatic selection: one change notification; the focused
    // tab's entry into the panel is the single input-boundary clear.
    expect(boundaries).toBe(1);
    expect(changes).toBe(1);
    expect(document.getElementById('options-tab')).toBe(document.activeElement);
    expect(document.getElementById('debug-panel')!.hidden).toBe(true);

    const debugTab = document.getElementById('debug-tab') as HTMLButtonElement;
    debugTab.click(); // User tab change through the shared controller: exactly one change.
    // No boundary clear: input ownership stays inside the panel during internal navigation.
    expect(boundaries).toBe(1);
    expect(changes).toBe(2);
    expect(document.getElementById('tools-title')!.textContent).toBe('Debug');
    expect(document.getElementById('options-panel')!.hidden).toBe(true);
    expect(document.getElementById('debug-panel')!.hidden).toBe(false);
    expect(debugTab.tabIndex).toBe(0);
    expect((document.getElementById('options-tab') as HTMLButtonElement).tabIndex).toBe(-1);

    debugTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(boundaries).toBe(1); // Same-tab-panel navigation never resets controller sampling.
    expect(changes).toBe(3);
    expect(document.getElementById('tools-title')!.textContent).toBe('Settings');
    expect(document.getElementById('options-tab')).toBe(document.activeElement);

    shell.close(); // Leaving the panel returns ownership and clears input exactly once.
    expect(boundaries).toBe(2);
    // Close adds its own pre-existing change notification for the panel-visibility
    // layout change; selections themselves still notified exactly once each.
    expect(changes).toBe(4);

    shell.dispose();
    expect(document.getElementById('tools-panel')!.hidden).toBe(true);
  });
});
