import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readMap } from '../../src/content/validation.mjs';
import { createActor, advanceActor } from '../../src/domain/movement';
import { createInteractionLookup, ExitLatch, MessageSession } from '../../src/domain/interaction';
import { TransitionTask } from '../../src/runtime/transition';
import { ACTIONS, PadLatch, defaultControllerConfig, parseControllerConfig } from '../../src/platform/gamepad-model';
import type { MapDefinition } from '../../src/content/generated/map';
import type { PadState } from '../../src/platform/gamepad-model';

const workshop = (): MapDefinition => JSON.parse(readFileSync('content/games/demo/maps/workshop.json', 'utf8'));
const legacy = () => {
  const current = defaultControllerConfig();
  const { interact: _interact, cancel: _cancel, menu: _menu, ...buttons } = current.buttons;
  return { ...current, version: 1, buttons };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe('authored messages', () => {
  it('uses the facing adjacent tile and refuses interaction mid-step', () => {
    const actor = createActor(10, 7), lookup = createInteractionLookup(readMap(workshop()));
    expect(lookup(actor)?.objectId).toBe('demo:object.workshop.caretaker');
    actor.facing = 'up'; expect(lookup(actor)).toBeNull();
    actor.facing = 'down'; actor.motion = { from: {x:10,y:6}, to:{x:10,y:7}, elapsedMs:20 };
    expect(lookup(actor)).toBeNull();
  });
  it('advances bounded pages without changing the definition', () => {
    const map = readMap(workshop()), actor = createActor(10, 7);
    const target=createInteractionLookup(map)(actor)!;const message=map.messages!.find(candidate=>candidate.id==='caretaker-intro')!;
    const session = new MessageSession(target.objectId,message,map.strings!.en);
    expect(session.page).toBe(1); expect(session.speaker).toContain('Mara');
    expect(session.advance()).toBe(true); expect(session.page).toBe(2);
    expect(session.advance()).toBe(false); expect(session.page).toBe(2);
    expect(map.messages![0]!.pages).toHaveLength(2); expect(Object.isFrozen(map.strings!.en)).toBe(true);
  });
  it('continues to read old v1 maps without message fields', () => {
    const map = workshop(); delete map.messages; delete map.strings;
    map.objects = map.objects.filter((object) => !object.messageId);
    expect(readMap(map).id).toBe(map.id);
    expect(createInteractionLookup(map)(createActor(10, 7))).toBeNull();
  });
  it.each(['missing-message', 'missing-string', 'duplicate-message', 'duplicate-interaction', 'whitespace', 'too-long', 'too-many-pages', 'unknown-field', 'blocked-adjacency'])(
    'rejects invalid %s before gameplay', (kind) => {
      const map = workshop();
      const object = map.objects.find((item) => item.messageId)!;
      if (kind === 'missing-message') object.messageId = 'absent';
      if (kind === 'missing-string') delete map.strings!.en['caretaker.name'];
      if (kind === 'duplicate-message') map.messages!.push({...map.messages![0]!});
      if (kind === 'duplicate-interaction') map.objects.push({...object, id:'demo:object.duplicate', solid:false});
      if (kind === 'whitespace') map.strings!.en['caretaker.name'] = ' \n\t ';
      if (kind === 'too-long') map.strings!.en['caretaker.name'] = 'x'.repeat(1501);
      if (kind === 'too-many-pages') map.messages![0]!.pages = Array(9).fill('caretaker.name');
      if (kind === 'unknown-field') Object.assign(map.messages![0]!, { script:'eval(1)' });
      if (kind === 'blocked-adjacency') { object.x = 0; object.y = 0; }
      expect(() => readMap(map)).toThrow();
    },
  );
  it('keeps Unicode and apparent HTML as literal text', () => {
    const map = workshop(); map.strings!.en['caretaker.welcome'] = '<img src=x onerror=alert(1)> — 世界 🌟';
    expect(readMap(map).strings!.en['caretaker.welcome']).toBe(map.strings!.en['caretaker.welcome']);
  });
});

describe('door trigger boundaries', () => {
  it('triggers once upon entry and rearms only after leaving', () => {
    const exits = workshop().exits, latch = new ExitLatch(exits, {x:17,y:6});
    expect(latch.arrive({x:18,y:6})?.id).toBe('to-gallery');
    expect(latch.arrive({x:18,y:6})).toBeNull();
    expect(latch.arrive({x:17,y:6})).toBeNull();
    expect(latch.arrive({x:18,y:6})?.id).toBe('to-gallery');
  });
  it('suppresses spawn-on-exit loops and uses half-open rectangles', () => {
    const latch = new ExitLatch(workshop().exits, {x:18,y:6});
    expect(latch.arrive({x:18,y:6})).toBeNull();
    expect(latch.arrive({x:19,y:6})).toBeNull();
    expect(latch.arrive({x:18,y:6})?.id).toBe('to-gallery');
  });
  it.each([30, 60, 120, 144])('stops precisely at the door at %s Hz, discarding cross-map time debt', (hz) => {
    const actor = createActor(17,6);
    let arrivals = 0;
    for (let i=0; i<100 && arrivals===0; i+=1) advanceActor(actor,'right',1000/hz,()=>true,()=>{arrivals+=1; return false;});
    expect(actor.tile).toEqual({x:18,y:6}); expect(actor.motion).toBeNull(); expect(arrivals).toBe(1);
  });
});

describe('owned asynchronous transfers', () => {
  it('rejects duplicate requests without invoking their loader', async () => {
    const task = new TransitionTask<number>(), source = deferred<number>(); let committed=0, duplicates=0;
    const first=task.run(()=>source.promise,(value)=>{committed=value;});
    expect(task.pending).toBe(true);
    expect(await task.run(async()=>{duplicates+=1;return 9;},()=>{})).toEqual({kind:'busy'});
    source.resolve(7); expect(await first).toEqual({kind:'committed'});
    expect(committed).toBe(7); expect(duplicates).toBe(0); expect(task.pending).toBe(false);
  });
  it('cancels old generations even if the old loader ignores abort', async () => {
    const task = new TransitionTask<number>(), old = deferred<number>(); const commits:number[]=[]; let signal!:AbortSignal;
    const first=task.run((value)=>{signal=value;return old.promise;},(value)=>commits.push(value));
    task.cancel(); expect(signal.aborted).toBe(true); task.cancel();
    expect(await task.run(async()=>2,(value)=>commits.push(value))).toEqual({kind:'committed'});
    old.resolve(1); expect(await first).toEqual({kind:'cancelled'}); expect(commits).toEqual([2]);
  });
  it('reports load failure and permits a retry', async () => {
    const task = new TransitionTask<number>(); let commits=0;
    expect(await task.run(async()=>{throw new Error('missing map');},()=>{commits+=1;})).toMatchObject({kind:'failed'});
    expect(task.pending).toBe(false); expect(commits).toBe(0);
    expect(await task.run(async()=>1,()=>{commits+=1;})).toEqual({kind:'committed'}); expect(commits).toBe(1);
  });
  it('reports a preparation/commit exception instead of a false success', async () => {
    const result=await new TransitionTask<number>().run(async()=>1,()=>{throw new Error('missing frame');});
    expect(result).toMatchObject({kind:'failed', error:expect.objectContaining({message:'missing frame'})});
  });
  it('disposal prevents delayed activation and future loads', async () => {
    const task = new TransitionTask<number>(), source=deferred<number>(); let commits=0;
    const pending=task.run(()=>source.promise,()=>{commits+=1;}); task.dispose(); task.dispose(); source.resolve(1);
    expect(await pending).toEqual({kind:'cancelled'});
    expect(await task.run(async()=>2,()=>{commits+=1;})).toEqual({kind:'cancelled'}); expect(commits).toBe(0);
  });
});

describe('controller action compatibility', () => {
  it('migrates v1 without overwriting existing custom buttons or axes', () => {
    const old = legacy(); old.buttons.burst=2; old.buttons.left=1; old.axisX=2; old.axisY=3;
    const migrated=parseControllerConfig(old)!;
    expect(migrated.version).toBe(3); expect(migrated.axisX).toBe(2);
    for (const [action,value] of Object.entries(old.buttons)) expect(migrated.buttons[action as keyof typeof old.buttons]).toBe(value);
    expect(new Set(ACTIONS.map((action)=>migrated.buttons[action])).size).toBe(ACTIONS.length);
    expect(old).not.toHaveProperty('buttons.interact');
  });
  it('rejects invented actions in v1 rather than silently dropping them', () => {
    const old=legacy(); Object.assign(old.buttons,{invented:8}); expect(parseControllerConfig(old)).toBeNull();
  });
  it('interaction and cancel use edges and cannot cross a context reset', () => {
    const neutral:PadState={id:'Test',index:0,mapping:'standard',connected:true,axes:[0,0],buttons:[0,0,0]};
    const pressed={...neutral,buttons:[0,1,1]}; const latch=new PadLatch(), config=defaultControllerConfig();
    latch.sample(neutral,config,true);
    expect(latch.sample(pressed,config,true)).toMatchObject({interact:true,cancel:true,burst:false});
    expect(latch.sample(pressed,config,true)).toMatchObject({interact:false,cancel:false});
    latch.reset(); expect(latch.sample(pressed,config,true)).toMatchObject({interact:false,cancel:false});
    latch.sample(neutral,config,true); expect(latch.sample(pressed,config,true).interact).toBe(true);
  });
});
