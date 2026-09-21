import { openTools, openControllerSettings, enableTouch } from './helpers';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot } from './helpers';

const WORKSHOP = 'demo:map.workshop', GALLERY = 'demo:map.gallery';
const dialog = '#interaction-dialog';

async function step(page: Page, key: string): Promise<void> {
  // Modal actions are consumed on the next game update, not by keyboard.press itself.
  // Observe the real handoff; never focus the stage or bypass gameplay from this helper.
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true);
  } finally {
    await page.keyboard.up(key);
  }
  await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(false);
}
async function caretaker(page: Page): Promise<void> {
  await step(page, 'ArrowDown'); // (10,7), facing the solid caretaker at (10,8).
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.workshop.caretaker');
}
async function cross(page: Page, key: string, target: string): Promise<void> {
  await page.keyboard.down(key);
  await expect.poll(async () => (await snapshot(page)).mapId).toBe(target);
  await page.keyboard.up(key);
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator(dialog)).not.toBeVisible();
}
async function pad(page: Page, axes = [0, 0], buttons: number[] = []): Promise<void> {
  await page.evaluate(({axes,buttons}) => {
    (window as any).__INTERACTION_PAD__ = {id:'Synthetic interaction test',index:0,mapping:'standard',connected:true,axes,
      buttons:Array.from({length:20},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))};
  }, {axes,buttons});
  await page.waitForTimeout(70);
}
async function fakePad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[(window as any).__INTERACTION_PAD__ ?? null]});
  });
}

 test('caretaker dialogue locks movement, advances once per press, and returns focus', async ({page}, info) => {
  await openRoom(page); await caretaker(page);
  await page.keyboard.down('KeyE');
  await expect(page.locator(dialog)).toBeVisible();
  await expect(page.locator('#dialog-title')).toContainText('Mara');
  await page.waitForTimeout(350);
  expect((await snapshot(page)).messagePage).toBe(1);
  await page.keyboard.up('KeyE');
  const tile=(await snapshot(page)).actorTile;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  expect((await snapshot(page)).actorTile).toEqual(tile);
  expect((await snapshot(page)).burstRequests).toBe(0);
  await page.screenshot({path:info.outputPath('caretaker-dialogue.png'),fullPage:true});
  await page.keyboard.press('Enter');
  await expect(page.locator('#dialog-text')).toContainText('lit doorway');
  await page.keyboard.press('Enter');
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect(page.locator('#stage')).toBeFocused();
  await page.waitForTimeout(200); expect((await snapshot(page)).messageId).toBeNull();
  await step(page,'ArrowLeft'); expect((await snapshot(page)).actorTile.x).toBe(9);
});

 test('controller interaction owns the modal and held actions do not leak across it', async ({page}) => {
  await fakePad(page); await openRoom(page); await caretaker(page); await pad(page);
  await pad(page,[0,0],[2,0]);
  await expect(page.locator(dialog)).toBeVisible();
  expect((await snapshot(page)).messagePage).toBe(1); expect((await snapshot(page)).burstRequests).toBe(0);
  await pad(page,[1,0],[2,0]); await page.waitForTimeout(200);
  expect((await snapshot(page)).actorTile).toEqual({x:10,y:7}); expect((await snapshot(page)).messagePage).toBe(1);
  await pad(page); await pad(page,[0,0],[2]);
  await expect.poll(async()=>(await snapshot(page)).messagePage).toBe(2);
  await pad(page); await pad(page,[0,0],[1]);
  await expect(page.locator(dialog)).not.toBeVisible();
  await pad(page,[1,0],[1]); await page.waitForTimeout(250);
  expect((await snapshot(page)).actorTile).toEqual({x:10,y:7});
  await pad(page); await pad(page,[0,0],[0]);
  await expect.poll(async()=>(await snapshot(page)).burstRequests).toBe(1);
});

 test('real doors load only their destination, preserve the document, and use named spawns', async ({page}) => {
  const maps:string[]=[];page.on('request',request=>{if(request.url().includes('/content/maps/'))maps.push(request.url());});
  await openRoom(page);
  const marker=await page.evaluate(()=>{(window as any).__DOCUMENT_MARKER__=Math.random();return (window as any).__DOCUMENT_MARKER__;});
  await cross(page,'ArrowRight',GALLERY);
  expect((await snapshot(page)).actorTile).toEqual({x:2,y:6}); expect((await snapshot(page)).facing).toBe('right');
  expect((await snapshot(page)).spawnId).toBe('from-workshop'); expect(maps).toHaveLength(2);
  await cross(page,'ArrowLeft',WORKSHOP);
  expect((await snapshot(page)).actorTile).toEqual({x:17,y:6}); expect((await snapshot(page)).facing).toBe('left');
  expect((await snapshot(page)).transitions).toBe(2); expect(maps).toHaveLength(3);
  expect(await page.evaluate(()=>(window as any).__DOCUMENT_MARKER__)).toBe(marker);
  expect((await snapshot(page)).loadedMaps).toBe(1);
});

 test('the gallery plaque uses authored text and works with pointer actions on a narrow screen', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await openRoom(page,'?map=demo:map.gallery');
  await enableTouch(page);
  await step(page,'ArrowUp'); // start (4,6) -> (4,5), plaque at (4,4).
  await page.locator('#interact').click();
  await expect(page.locator('#dialog-title')).toHaveText('Brass plaque');
  await expect(page.locator('#dialog-text')).toContainText('polished lens once focused');
  expect((await snapshot(page)).actorTile).toEqual({x:4,y:5});
  const box=(await page.locator(dialog).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:info.outputPath('plaque-narrow.png'),fullPage:true});
  await page.locator('#dialog-advance').click();
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect(page.locator('#stage')).toBeFocused();
});

 test('plaque fact commits once and reconstructs after travel and room restart',async({page})=>{
  await openRoom(page,'?map='+GALLERY);await step(page,'ArrowUp');await page.keyboard.press('KeyE');await expect(page.locator('#dialog-text')).toContainText('hidden line glows');await page.keyboard.press('Escape');
  const committed=(await snapshot(page)).session;expect(committed.facts['demo:fact.gallery.plaque-read']).toBe(true);expect(committed.revision).toBe(1);
  await page.keyboard.press('KeyE');await expect(page.locator('#dialog-text')).toContainText('revealed line still glows');await page.keyboard.press('Escape');expect((await snapshot(page)).session.revision).toBe(1);
  await step(page,'ArrowDown');await cross(page,'ArrowLeft',WORKSHOP);await cross(page,'ArrowRight',GALLERY);expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(true);
  await openTools(page,'debug');await page.locator('#restart').click();await expect.poll(async()=>(await snapshot(page)).phase).toBe('ready');expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(true);
 });

for (const fault of ['http','malformed','blocked-spawn','missing-spawn','missing-frame'] as const) {
  test(`destination ${fault} failure preserves the old room and retries safely`, async ({page}) => {
    let broken=true, calls=0;
    await page.route('**/generated/content/maps/gallery.*.json', async route => {
      calls+=1;
      if(!broken) return route.continue();
      if(fault==='http') return route.fulfill({status:503,body:'Unavailable'});
      if(fault==='malformed') return route.fulfill({body:'not json'});
      const map=JSON.parse(readFileSync('content/games/demo/maps/gallery.json','utf8'));
      if(fault==='blocked-spawn') map.spawns[1].x=0;
      if(fault==='missing-spawn') map.spawns=map.spawns.slice(0,1);
      if(fault==='missing-frame') map.legend.a='absent';
      return route.fulfill({json:map});
    });
    await openRoom(page); const old=await snapshot(page);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('transition-error');
    await page.keyboard.up('ArrowRight');
    const failed=await snapshot(page);
    expect(failed.mapId).toBe(WORKSHOP); expect(failed.actorTile).toEqual({x:18,y:6}); expect(failed.moving).toBe(false);
    expect(failed.displayObjects).toBe(old.displayObjects); expect(failed.textureCount).toBe(old.textureCount);
    expect(failed.phase).toBe('ready'); expect(failed.transitions).toBe(0); expect(failed.failedTransitions).toBe(1);
    await expect(page.locator('#error')).toBeHidden();
    broken=false; await page.locator('#dialog-advance').click();
    await expect.poll(async()=>(await snapshot(page)).mapId).toBe(GALLERY);
    await expect(page.locator(dialog)).not.toBeVisible(); expect(calls).toBe(2);
  });
}

 test('cancellation ignores a late destination and requires exit re-entry before retry', async ({page}) => {
  let release!:()=>void, calls=0;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/generated/content/maps/gallery.*.json', async route => {
    calls+=1;
    if(calls===1) await pending;
    try { await route.continue(); } catch { /* The first request was deliberately aborted. */ }
  });
  await openRoom(page); await page.keyboard.down('ArrowRight');
  await expect.poll(()=>calls).toBe(1); await expect(page.locator('#dialog-title')).toHaveText('Opening doorway');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); expect(calls).toBe(1);
  await page.locator('#dialog-cancel').click();
  await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
  release(); await page.waitForTimeout(250);
  expect((await snapshot(page)).mapId).toBe(WORKSHOP); expect((await snapshot(page)).cancelledTransitions).toBe(1);
  expect(calls).toBe(1);
  await step(page,'ArrowLeft'); await cross(page,'ArrowRight',GALLERY); expect(calls).toBe(2);
});

 test('timeout is recoverable and staying on a failed exit does not retry automatically', async ({page}) => {
  test.setTimeout(30_000);
  await page.route('**/generated/content/maps/gallery.*.json', async route => {
    await new Promise(resolve=>setTimeout(resolve,9000));
    try { await route.continue(); } catch { /* expected timeout */ }
  });
  await openRoom(page); await page.keyboard.down('ArrowRight');
  await expect(page.locator('#dialog-text')).toContainText('timed out',{timeout:12000});
  await page.keyboard.up('ArrowRight'); await page.keyboard.press('Escape');
  await expect(page.locator(dialog)).not.toBeVisible(); await page.waitForTimeout(250);
  expect((await snapshot(page)).mapId).toBe(WORKSHOP); expect((await snapshot(page)).failedTransitions).toBe(1);
  await step(page,'ArrowLeft'); expect((await snapshot(page)).actorTile.x).toBe(17);
});

 test('twenty round trips keep scene objects, textures, input responses, and particles bounded', async ({page}) => {
  test.setTimeout(90000);
  await openRoom(page); const initial=await snapshot(page);
  let galleryObjects=0;
  for(let i=0;i<20;i+=1){
    await cross(page,'ArrowRight',GALLERY); const gallery=await snapshot(page);
    if(i===0)galleryObjects=gallery.displayObjects;
    expect(gallery.displayObjects).toBe(galleryObjects); expect(gallery.activeScenes).toBe(1);
    await cross(page,'ArrowLeft',WORKSHOP); const room=await snapshot(page);
    expect(room.displayObjects).toBe(initial.displayObjects); expect(room.textureCount).toBe(initial.textureCount);
    expect(room.loadedMaps).toBe(1); expect(room.activeScenes).toBe(1); expect(room.aliveParticles).toBe(0);
  }
  expect((await snapshot(page)).transitions).toBe(40);
  await page.keyboard.press('Space'); await expect.poll(async()=>(await snapshot(page)).burstRequests).toBe(1);
  await page.waitForTimeout(200); expect((await snapshot(page)).burstRequests).toBe(1);
  await openTools(page, 'debug'); await page.locator('#restart').click(); await expect.poll(async()=>(await snapshot(page)).starts).toBe(2);
  expect((await snapshot(page)).mapId).toBe(WORKSHOP); expect((await snapshot(page)).stops).toBe(1);
});

 test('literal authored text is not executed, and turning effects off does not break dialogue or travel', async ({page}) => {
  await page.route('**/generated/content/maps/workshop.*.json',route=>{
    const map=JSON.parse(readFileSync('content/games/demo/maps/workshop.json','utf8'));
    map.strings.en['caretaker.welcome']='<img src=x onerror=alert(1)> 世界 🌟';
    return route.fulfill({json:map});
  });
  await page.emulateMedia({reducedMotion:'reduce'}); await openRoom(page); await caretaker(page);
  await page.keyboard.press('KeyE'); await expect(page.locator('#dialog-text')).toHaveText('<img src=x onerror=alert(1)> 世界 🌟');
  await expect(page.locator('#dialog-text img')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect(page.locator('#stage')).toBeFocused();
  await step(page,'ArrowUp');
  expect((await snapshot(page)).actorTile).toEqual({x:10,y:6});
  await cross(page,'ArrowRight',GALLERY);
  expect((await snapshot(page)).effectsEnabled).toBe(false);
});

 test('legacy remapping survives reload without conflicting with new dialogue bindings', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('rpgameworks.controller.v1',JSON.stringify({
    version:1,enabled:true,allowUnmapped:false,deadzone:0.4,axisX:2,axisY:3,invertX:true,invertY:false,
    buttons:{up:12,down:13,left:14,right:15,burst:2},
  })));
  await openRoom(page); await openControllerSettings(page);
  await expect(page.locator('#controller-button-burst')).toHaveValue('2');
  await expect(page.locator('#controller-button-interact')).not.toHaveValue('2');
  await expect(page.locator('#controller-deadzone')).toHaveValue('40');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rpgameworks.controller.v3')!).version)).toBe(3);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rpgameworks.controller.v1')!).version)).toBe(1);
});
