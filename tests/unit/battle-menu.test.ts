import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BattleSession } from '../../src/domain/battle';
import { BattleMenu } from '../../src/domain/battle-menu';
import type { MenuContext, MenuItemInfo } from '../../src/domain/battle-menu';
import { readEncounters } from '../../src/content/validation.mjs';
import type { Encounter } from '../../src/domain/battle';

const practice = readEncounters(JSON.parse(readFileSync('tests/fixtures/encounters/authored-party.json', 'utf8'))).encounters[0]! as Encounter;
const TONIC = 'demo:item.tonic';
const tonic = (count: number): MenuItemInfo => ({ id: TONIC, name: 'Workshop tonic', count, help: 'Restores 12 HP.' });

function setup(items: MenuItemInfo[] = [], encounter: Encounter = practice) {
  const battle = new BattleSession(encounter, new Map([[TONIC, { heal: 12 }]]));
  const menu = new BattleMenu();
  const context = (): MenuContext => {
    const state = battle.snapshot();
    return { phase: state.phase, active: state.active, combatants: state.combatants, items, validate: command => battle.validate(command) };
  };
  menu.begin(context());
  return { battle, menu, context };
}

describe('battle menu', () => {
  it('offers Attack, Special, Item, Guard, Move and Run, with reasons for what is unavailable', () => {
    const { menu } = setup();
    const state = menu.state();
    expect(state).toMatchObject({ level: 'root', cursor: 0, help: 'Strike one enemy.', target: null });
    expect(state.entries.map(entry => [entry.label, entry.enabled])).toEqual([
      ['Attack', true], ['Special', false], ['Item', false], ['Guard', true], ['Move', true], ['Run', true]]);
    expect(state.entries[1]!.help).toBe('No specials yet.');
    expect(state.entries[2]!.help).toBe('No usable items.');
  });

  it('attacks in two confirms, remembers command and target, and skips defeated targets', () => {
    const { battle, menu, context } = setup();
    expect(menu.confirm()).toEqual({ kind: 'none' });
    expect(menu.state()).toMatchObject({ level: 'target', target: 'sigil' }); // First living enemy by slot.
    expect(menu.state().entries.map(entry => entry.name)).toEqual(['Clay Golem', 'Bat']); // Enemies only.
    menu.move(1);
    const outcome = menu.confirm();
    expect(outcome).toEqual({ kind: 'command', command: { type: 'attack', target: 'shard' } });
    battle.command({ type: 'attack', target: 'shard' });
    menu.begin(context());
    expect(menu.state().cursor).toBe(0); // Attack remembered.
    menu.confirm();
    expect(menu.state().target).toBe('shard'); // Last target remembered.
    battle.command({ type: 'attack', target: 'shard' }); // 10 HP shard: 6 then 6 damage defeats it.
    expect(battle.snapshot().combatants.find(c => c.id === 'shard')!.hp).toBe(0);
    menu.begin(context());
    menu.confirm();
    expect(menu.state()).toMatchObject({ target: 'sigil' });
    expect(menu.state().entries.map(entry => entry.name)).toEqual(['Clay Golem']);
  });

  it('backs out one level at a time without committing; at the top Cancel only points at Run', () => {
    const { menu } = setup([tonic(2)]);
    menu.confirm(); // Attack → targets.
    menu.cancel();
    expect(menu.state()).toMatchObject({ level: 'root', cursor: 0 });
    menu.choose('item');
    expect(menu.state().level).toBe('item');
    menu.confirm();
    expect(menu.state()).toMatchObject({ level: 'target', target: 'hero' });
    menu.cancel();
    expect(menu.state().level).toBe('item'); // An item's target backs out to the item list.
    menu.cancel();
    expect(menu.state()).toMatchObject({ level: 'root', cursor: 2 });
    menu.cancel();
    expect(menu.state()).toMatchObject({ level: 'root', cursor: 5, help: 'Escape from this battle.' });
  });

  it('uses an item on the most injured ally and builds exactly the kernel command', () => {
    const { menu } = setup([tonic(2)]);
    expect(menu.state().entries[2]).toMatchObject({ enabled: true, help: 'Use an item.' }); // The opening hit leaves the hero at 29/30.
    menu.choose('item');
    expect(menu.state().entries).toEqual([{ id: `item:${TONIC}`, label: 'Workshop tonic', name: 'Workshop tonic (2)', detail: '2', enabled: true, help: 'Restores 12 HP.' }]);
    menu.confirm();
    expect(menu.state().entries.map(entry => entry.name)).toEqual(['Hero']); // Only allies the kernel accepts.
    expect(menu.confirm()).toEqual({ kind: 'command', command: { type: 'item', itemId: TONIC, target: 'hero' } });
  });

  it('explains a full-HP item and never offers it', () => {
    const fast: Encounter = { ...practice, party: [{ ...practice.party[0]!, speed: 30 }] }; // The hero opens unhurt.
    const { menu } = setup([tonic(1)], fast);
    expect(menu.state().entries[2]).toMatchObject({ enabled: false, help: 'HP is already full.' });
    expect(menu.choose('item')).toEqual({ kind: 'none' });
    expect(menu.state().level).toBe('root');
  });

  it('offers only enemies the active fighter can reach, and the help line names the rest (decision 0014)', () => {
    const drill = readEncounters(JSON.parse(readFileSync('tests/fixtures/encounters/authored-party.json', 'utf8'))).encounters[1]! as Encounter;
    const { battle, menu } = setup([], drill);
    expect(battle.snapshot().active).toBe('archer'); // The fastest member: ranged, so it may target anyone.
    menu.confirm();
    expect(menu.state().entries.map(entry => entry.name)).toEqual(['Two-Headed Ogre', 'Clay Golem', 'Bat']);
    expect(menu.state().help).toBe('Two-Headed Ogre  60/60 HP');
    const hero = { ...drill, party: drill.party.map(c => (c.id === 'hero' ? { ...c, speed: 30 } : c)) };
    const melee = setup([], hero).menu;
    melee.confirm();
    expect(melee.state().entries.map(entry => entry.name)).toEqual(['Two-Headed Ogre', 'Clay Golem']); // The bat is behind the golem.
    expect(melee.state().help).toBe('Two-Headed Ogre  60/60 HP  Out of reach: Bat.');
  });

  it('Move lists the other cells with what each would mean, builds a move or a swap, and cancels back to Move (M5.4c)', () => {
    const drill = readEncounters(JSON.parse(readFileSync('tests/fixtures/encounters/authored-party.json', 'utf8'))).encounters[1]! as Encounter;
    const { battle, menu } = setup([], drill);
    expect(battle.snapshot().active).toBe('archer'); // At lane 1, depth 1 (middle lane, behind the hero).
    menu.choose('move');
    const state = menu.state();
    expect(state.level).toBe('move');
    expect(state.entries).toHaveLength(8); // Every cell but the archer's own.
    expect(state.entries.map(e => e.name)).toEqual(['Top lane, front', 'Top lane, middle', 'Top lane, back', 'Swap with Hero', 'Middle lane, back',
      'Swap with Lancer', 'Bottom lane, middle', 'Swap with Mage']);
    expect(state.entries[0]!.help).toBe('Front-facing there.');
    expect(state.entries[4]!.help).toBe('Shielded there by 1 ally (20% less damage).'); // Behind the hero.
    expect(state.entries[3]!.help).toBe('Swap places with Hero. Front-facing there.');
    expect(state.entries[6]!.help).toBe('Shielded there by 1 ally (20% less damage).'); // Behind the lancer, ahead of the mage.
    expect(state).toMatchObject({ cursor: 0, cell: { lane: 0, depth: 0 } });
    expect(menu.column()).toMatchObject({ inactive: true, cursor: 4 }); // The command column keeps Move marked.
    menu.cancel();
    expect(menu.state()).toMatchObject({ level: 'root', cursor: 4 });
    menu.choose('move');
    expect(menu.choose('cell:1,0')).toEqual({ kind: 'command', command: { type: 'move', to: { lane: 1, depth: 0 } } });
    menu.begin({ phase: 'command', active: 'archer', combatants: battle.snapshot().combatants, items: [], validate: c => battle.validate(c) });
    menu.choose('move');
    expect(menu.choose('cell:0,2')).toEqual({ kind: 'command', command: { type: 'move', to: { lane: 0, depth: 2 } } });
  });

  it('offers the end-of-battle choices for each outcome', () => {
    const { battle, menu, context } = setup();
    battle.command({ type: 'escape' });
    menu.begin(context());
    expect(menu.state()).toMatchObject({ level: 'end', help: 'Escaped. Return to the room.' });
    expect(menu.confirm()).toEqual({ kind: 'end', choice: 'leave' });
    const defeat = { ...context(), phase: 'defeat' as const, active: null };
    menu.begin(defeat);
    expect(menu.state().entries.map(entry => entry.id)).toEqual(['retry', 'leave']);
    menu.begin({ ...defeat, phase: 'victory' });
    expect(menu.choose('finish')).toEqual({ kind: 'end', choice: 'finish' });
  });
});
