import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readActions, readEncounters } from '../../src/content/validation.mjs';
import { BattleSession } from '../../src/domain/battle';
import type { Encounter } from '../../src/domain/battle';
import { actionMap, describeAction } from '../../src/domain/actions';
import { BattleMenu } from '../../src/domain/battle-menu';
import type { MenuContext } from '../../src/domain/battle-menu';
import { battleLayout, entryRect } from '../../src/presentation/battle/battle-layout';

/** Decision 0018 M5.5b-2: the Special menu lists the active member's skills with MP costs, and aims them. */
const actions = actionMap(readActions(JSON.parse(readFileSync('content/games/demo/actions.json', 'utf8'))));
const CLEAVE = 'demo:action.cleave', PIERCE = 'demo:action.pierce', VOLLEY = 'demo:action.volley', FIRE = 'demo:action.fire-bolt';
const member = (id: string, lane: number, depth: number, extra: Record<string, unknown> = {}) =>
  ({ id, name: id[0]!.toUpperCase() + id.slice(1), frame: 'hero-left', cell: { lane: lane + 1, depth: depth + 1 }, hp: 40, attack: 10, defense: 1, speed: 20, mp: 6, ...extra });
const foe = (id: string, lane: number, depth: number, extra: Record<string, unknown> = {}) =>
  ({ id, name: id[0]!.toUpperCase() + id.slice(1), frame: 'sigil', cell: { lane: lane + 1, depth: depth + 1 }, hp: 60, attack: 1, defense: 2, speed: 1, ...extra });
function setup(party: unknown[], enemies: unknown[] = [foe('front', 0, 0), foe('back', 1, 2)]) {
  const encounter = readEncounters({ schemaVersion: 3, encounters: [{ id: 'test:encounter.special', name: 'Special', seed: 3, party, enemies }] }).encounters[0] as Encounter;
  const battle = new BattleSession(encounter, new Map(), actions);
  const menu = new BattleMenu();
  const context = (): MenuContext => {
    const state = battle.snapshot();
    return { phase: state.phase, active: state.active, combatants: state.combatants, items: [], actions, validate: command => battle.validate(command) };
  };
  menu.begin(context());
  return { battle, menu, context };
}
const entry = (menu: BattleMenu, id: string) => menu.state().entries.find(e => e.id === id)!;

describe('the Special menu', () => {
  it('lists the active member\'s skills with their MP cost and a description built from the data', () => {
    const { menu } = setup([member('hero', 0, 0, { skills: [CLEAVE, PIERCE] })]);
    expect(entry(menu, 'special')).toMatchObject({ enabled: true, help: 'Skills, magic and combo techs.' });
    menu.choose('special');
    expect(menu.state().level).toBe('skill');
    expect(menu.state().entries.map(e => [e.label, e.detail, e.name, e.enabled])).toEqual([
      ['Cleave', '4', 'Cleave (4 MP)', true], ['Pierce', '3', 'Pierce (3 MP)', true]]);
    expect(menu.state().help).toBe('Slash. Hits a whole lane. 4 MP.');
    expect(menu.column()).toMatchObject({ inactive: true, cursor: 1 }); // Special stays marked in the command column.
  });

  it('describes every demo skill in plain words', () => {
    expect([CLEAVE, PIERCE, VOLLEY, FIRE].map(id => describeAction(actions.get(id)!))).toEqual([
      'Slash. Hits a whole lane. 4 MP.',
      'Pierce. One enemy, 110% power, ignores one shielding ally. 3 MP.',
      'Pierce. Hits an area, weaker away from its centre, at any range, 80% power. 5 MP.',
      'Fire. One enemy, at any range, 130% power. 4 MP.',
    ]);
  });

  it('builds a skill command in three confirms, remembers skill and target, and backs out one level at a time', () => {
    const { battle, menu, context } = setup([member('mage', 0, 0, { mp: 8, skills: [FIRE] })]);
    menu.choose('special');
    expect(menu.confirm()).toEqual({ kind: 'none' });
    expect(menu.state()).toMatchObject({ level: 'target', target: 'front', area: null }); // Ranged: both enemies offered.
    expect(menu.state().entries.map(e => e.name)).toEqual(['Front', 'Back']);
    menu.move(1);
    expect(menu.confirm()).toEqual({ kind: 'command', command: { type: 'skill', action: FIRE, target: 'back' } });
    menu.cancel();
    expect(menu.state().level).toBe('skill'); // Cancel from targeting returns to the skill list...
    menu.cancel();
    expect(menu.state()).toMatchObject({ level: 'root', cursor: 1 }); // ...and then to Special.
    battle.command({ type: 'skill', action: FIRE, target: 'back' });
    expect(battle.snapshot().combatants.find(c => c.id === 'mage')!.mp).toBe(4);
    menu.begin(context());
    expect(menu.state().cursor).toBe(1); // Special remembered...
    menu.confirm(); menu.confirm();
    expect(menu.state().target).toBe('back'); // ...and the last target.
    battle.command({ type: 'skill', action: FIRE, target: 'back' });
    menu.begin(context());
    // 0 MP left: Special is disabled and says why, so the cursor starts on the first usable command instead.
    expect(entry(menu, 'special')).toMatchObject({ enabled: false, help: 'Not enough MP.' });
    expect(menu.state().cursor).toBe(0);
  });

  it('disables a skill the member cannot afford or aim, and says why', () => {
    const { menu } = setup([member('lancer', 0, 0, { mp: 3, reach: 'melee', skills: [CLEAVE, PIERCE] })], [foe('far', 0, 2), foe('near', 0, 0)]);
    menu.choose('special');
    const [cleave, pierce] = menu.state().entries;
    expect(cleave).toMatchObject({ enabled: false, help: 'Not enough MP. Slash. Hits a whole lane. 4 MP.' });
    expect(pierce!.enabled).toBe(true);
    expect(menu.state().cursor).toBe(1); // The first usable skill.
    menu.confirm();
    // Pierce is melee here: only the front-facing enemy is offered, and the help line names the one out of reach.
    expect(menu.state().entries.map(e => e.name)).toEqual(['Near']);
    expect(menu.state().help).toContain('Out of reach: Far.');
  });

  it('marks an area skill\'s shape while aiming, for the stage to light its cells', () => {
    const { menu } = setup([member('archer', 0, 0, { reach: 'ranged', skills: [VOLLEY] })]);
    menu.choose('special');
    menu.confirm();
    expect(menu.state()).toMatchObject({ level: 'target', area: 'radius' });
    menu.cancel();
    expect(menu.state().area).toBeNull();
  });

  it('says there are no specials for a member without skills, and lists nothing', () => {
    const { menu } = setup([member('hero', 0, 0)]);
    expect(entry(menu, 'special')).toMatchObject({ enabled: false, help: 'No specials yet.' });
  });

  it('targeting names the weaknesses revealed this battle, warns "Weak!" before a weakness hit, and says "Broken"', () => {
    const spear = { name: 'Spear', tags: ['pierce'] }, sword = { name: 'Sword', tags: ['slash'] };
    const { battle, menu, context } = setup([member('lancer', 0, 0, { weapon: spear, speed: 30 }), member('hero', 1, 0, { weapon: sword, speed: 29 })],
      [foe('bat', 0, 0, { affinities: { pierce: 'weak' }, shield: 1, hp: 200 })]);
    menu.choose('attack');
    expect(menu.state().help).toBe('Bat  200/200 HP'); // Nothing revealed yet, so nothing hinted.
    battle.command({ type: 'attack', target: 'bat' }); // The Lancer's pierce: weak, and its one shield point breaks.
    menu.begin(context());
    expect(battle.snapshot().active).toBe('hero');
    menu.choose('attack');
    expect(menu.state().help).toMatch(/^Bat {2}\d+\/200 HP {2}Weak: pierce {2}Broken$/); // The Hero's slash is not a weakness hit.
    for (let i = 0; i < 4 && battle.snapshot().active !== 'lancer'; i++) battle.command({ type: 'guard' }); // Guard is light: the Hero may go twice.
    menu.begin(context());
    expect(battle.snapshot().active).toBe('lancer');
    expect(battle.snapshot().combatants.find(c => c.id === 'bat')!.broken).toBe(true);
    menu.choose('attack');
    expect(menu.state().help).toMatch(/Weak: pierce {2}Weak! {2}Broken$/);
  });

  it('never hints at an affinity the party has not revealed: a hidden absorb outranks a known weakness', () => {
    const spear = { name: 'Fire spear', tags: ['pierce', 'fire'] };
    const { battle, menu, context } = setup([member('lancer', 0, 0, { weapon: { name: 'Spear', tags: ['pierce'] }, speed: 30 }), member('mage', 1, 0, { weapon: spear, speed: 29 })],
      [foe('slime', 0, 0, { affinities: { pierce: 'weak', fire: 'absorb' } })]);
    battle.command({ type: 'attack', target: 'slime' }); // Reveals pierce.
    menu.begin(context());
    menu.choose('attack');
    expect(menu.state().help).toContain('Weak: pierce');
    expect(menu.state().help).not.toContain('Weak!'); // Pierce and fire together would be absorbed.
  });

  it('opens its list where the Item list opens', () => {
    const layout = battleLayout(null);
    expect(entryRect(layout, 'skill', 2)).toEqual(entryRect(layout, 'item', 2));
  });
});
