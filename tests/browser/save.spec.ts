import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot } from './helpers';

const gallery='demo:map.gallery';
async function step(page:Page,key:string):Promise<void>{await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);await page.keyboard.down(key);try{await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true);}finally{await page.keyboard.up(key);}await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);}
async function openSaves(page:Page):Promise<void>{await page.keyboard.press('KeyI');await expect(page.locator('#inventory-dialog')).toBeVisible();await page.locator('#inventory-saves').click();await expect(page.locator('#save-dialog')).toBeVisible();await expect(page.locator('#save-slots .save-slot')).toHaveCount(3);}
const slot=(page:Page,index:number)=>page.locator('#save-slots .save-slot').nth(index);
async function confirm(page:Page,index:number,action:'Load'|'Save'|'Import here'|'Recover previous'):Promise<void>{
  const n=index+1;
  const label=action==='Save'?`Save to Slot ${n}`:action==='Load'?`Load Slot ${n}`:action==='Import here'?`Import to Slot ${n}`:`Recover Slot ${n}`;
  const button=slot(page,index).getByRole('button',{name:action,exact:true});
  await button.click();
  const dialog=page.locator('#save-confirmation');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
  await dialog.getByRole('button',{name:label,exact:true}).click();
  await expect(dialog).toBeHidden();
}
async function syntheticPad(page:Page):Promise<void>{await page.addInitScript(()=>{const pad={id:'Save fixture',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:20},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});});}
async function padButton(page:Page,index:number,pressed:boolean):Promise<void>{await page.evaluate(({index,pressed})=>Object.assign(navigator.getGamepads()[0]!.buttons[index]!,{pressed,value:pressed?1:0}),{index,pressed});}
async function tapPad(page:Page,index:number):Promise<void>{await padButton(page,index,true);await page.waitForTimeout(70);await padButton(page,index,false);await page.waitForTimeout(70);}

test('three-slot UI exposes real disabled Load controls and saves/loads a session in place',async({page})=>{
  await openRoom(page,'?map='+gallery);await step(page,'ArrowUp');await page.keyboard.press('KeyE');await expect(page.locator('#dialog-text')).toContainText('hidden line glows');await page.keyboard.press('Escape');
  expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(true);const savedTile=(await snapshot(page)).actorTile;
  await openSaves(page);for(let index=0;index<3;index++){await expect(slot(page,index)).toContainText('Empty');await expect(slot(page,index).getByRole('button',{name:'Load'})).toBeDisabled();}
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(page.locator('#save-status')).toContainText('Progress saved');await expect(slot(page,0)).toContainText('The Pillar Gallery');
  await page.locator('#save-close').click();await page.locator('#inventory-close').click();await step(page,'ArrowDown');expect((await snapshot(page)).actorTile).not.toEqual(savedTile);
  await openSaves(page);await confirm(page,0,'Load');await expect(page.locator('#save-dialog')).toBeHidden();await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
  const after=await snapshot(page);expect(after.actorTile).toEqual(savedTile);expect(after.session.facts['demo:fact.gallery.plaque-read']).toBe(true);expect(after.activeScenes).toBe(1);expect(after.sessionSubscribers).toBe(1);await expect(page.locator('#stage')).toBeFocused();
});

test('a deliberate load restores IndexedDB progress after a full browser reload',async({page})=>{
  await openRoom(page,'?map='+gallery);await step(page,'ArrowUp');await page.keyboard.press('KeyE');await expect(page.locator('#interaction-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#interaction-dialog')).toBeHidden();await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');await page.locator('#tools-toggle').click();await page.locator('#inventory-saves').click();await expect(page.locator('#save-dialog')).toBeVisible();await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(page.locator('#save-status')).toContainText('Progress saved');
  await page.reload();await expect.poll(()=>page.evaluate(()=>window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');await page.locator('#stage').focus();expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(false);
  await page.locator('#tools-toggle').click();await expect(page.locator('#inventory-dialog')).toBeVisible();await page.locator('#inventory-saves').click();await expect(page.locator('#save-dialog')).toBeVisible();await expect(slot(page,0)).toContainText('The Pillar Gallery');await confirm(page,0,'Load');await expect.poll(async()=>(await snapshot(page)).mapId).toBe(gallery);expect((await snapshot(page)).session.facts['demo:fact.gallery.plaque-read']).toBe(true);
});

test('exports a deterministic JSON filename and imports a validated fixture into another slot',async({page})=>{
  await openRoom(page);await openSaves(page);await slot(page,0).getByRole('button',{name:'Save'}).click();
  const download=page.waitForEvent('download');await slot(page,0).getByRole('button',{name:'Export'}).click();expect((await download).suggestedFilename()).toBe('demo-game.foundation-slot-1-r1.json');
  await page.locator('#save-import').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-lens-collected.json')});await expect(page.locator('#save-status')).toContainText('Import validated');
  await confirm(page,1,'Import here');await expect(slot(page,1)).toContainText('The Pillar Gallery');await confirm(page,1,'Load');await expect.poll(async()=>(await snapshot(page)).mapId).toBe(gallery);
  const state=await snapshot(page);expect(state.mapId).toBe(gallery);expect(state.session.inventory['demo:item.lens']).toBe(1);expect(state.session.placements['demo:object.gallery.lens-chest']?.opened).toBe(true);
});

test('keyboard and controller navigate Save without a virtual pointer and isolate held input',async({page})=>{
  await syntheticPad(page);await openRoom(page);await tapPad(page,9);await expect(page.locator('#inventory-dialog')).toBeVisible();
  await tapPad(page,12);await tapPad(page,12);await expect(page.locator('#inventory-saves')).toBeFocused();await tapPad(page,2);await expect(page.locator('#save-dialog')).toBeVisible();await expect(slot(page,0).getByRole('button',{name:'Save'})).toBeFocused();
  await tapPad(page,2);await expect(page.locator('#save-status')).toContainText('Progress saved');await tapPad(page,1);await expect(page.locator('#inventory-dialog')).toBeVisible();await tapPad(page,1);await expect(page.locator('#stage')).toBeFocused();expect((await snapshot(page)).pendingSaveOperations).toBe(0);
  await page.keyboard.press('KeyI');await expect(page.locator('#inventory-dialog')).toBeVisible();await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');await expect(page.locator('#inventory-saves')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#save-dialog')).toBeVisible();
});

test('rejects malformed and incompatible imports without changing the running session',async({page})=>{
  await openRoom(page);const before=await snapshot(page);await openSaves(page);
  await page.locator('#save-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(page.locator('#save-status')).toContainText('not valid JSON');
  const incompatible=JSON.parse(readFileSync('tests/fixtures/saves/v1-empty.json','utf8'));incompatible.saveCompatibilityVersion=99;
  await page.locator('#save-import').setInputFiles({name:'future.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incompatible))});await expect(page.locator('#save-status')).toContainText('not compatible');
  expect((await snapshot(page)).session).toEqual(before.session);expect((await snapshot(page)).mapId).toBe(before.mapId);
});

test('failed destination preparation leaves the running room and session untouched',async({page})=>{
  await openRoom(page);await openSaves(page);await page.locator('#save-import').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-plaque-read.json')});await confirm(page,0,'Import here');
  const before=await snapshot(page);await page.route('**/generated/content/maps/gallery.*.json',route=>route.abort());await confirm(page,0,'Load');await expect(page.locator('#dialog-title')).toHaveText('Save could not load');
  const after=await snapshot(page);expect(after.mapId).toBe(before.mapId);expect(after.actorTile).toEqual(before.actorTile);expect(after.session).toEqual(before.session);expect(after.activeScenes).toBe(1);
});

test('two-page optimistic concurrency preserves the newer save and refreshes the stale tab',async({page,context})=>{
  await openRoom(page);await openSaves(page);await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(slot(page,0)).toContainText('revision 1');
  const stale=await context.newPage();await openRoom(stale);await openSaves(stale);await expect(slot(stale,0)).toContainText('revision 1');
  await confirm(page,0,'Save');await expect(slot(page,0)).toContainText('revision 2');
  await confirm(stale,0,'Save');await expect(stale.locator('#save-status')).toContainText('Another tab changed this slot');await expect(slot(stale,0)).toContainText('revision 2');
  await stale.close();
});

test('repeated save-window openings and in-place loads retain bounded ownership',async({page})=>{
  test.setTimeout(60000);await openRoom(page);const baseline=await snapshot(page);
  for(let cycle=0;cycle<6;cycle++){
    await openSaves(page);if(cycle===0)await slot(page,0).getByRole('button',{name:'Save'}).click();else await confirm(page,0,'Save');
    await page.locator('#save-close').click();await page.locator('#inventory-close').click();await step(page,'ArrowLeft');
    await openSaves(page);await confirm(page,0,'Load');await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
    const state=await snapshot(page);expect(state.activeScenes).toBe(1);expect(state.loadedMaps).toBe(1);expect(state.sessionSubscribers).toBe(0);expect(state.pendingSaveOperations).toBe(0);expect(state.displayObjects).toBe(baseline.displayObjects);expect(state.textureCount).toBe(baseline.textureCount);
  }
});

test('unavailable IndexedDB keeps gameplay and current-session export usable',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(globalThis,'indexedDB',{value:undefined,configurable:true}));await openRoom(page);await page.keyboard.press('KeyI');await page.locator('#inventory-saves').click();await expect(page.locator('#save-dialog')).toBeVisible();await expect(page.locator('#save-status')).toContainText('Local saves unavailable');
  const download=page.waitForEvent('download');await page.locator('#save-export-current').click();expect((await download).suggestedFilename()).toBe('demo-game.foundation-slot-1-r1.json');expect((await snapshot(page)).phase).toBe('ready');
});

test('confirmation dialog guards destructive slot actions with safe focus and held-input isolation',async({page})=>{
  await syntheticPad(page);await openRoom(page);await openSaves(page);
  await slot(page,0).getByRole('button',{name:'Save'}).click(); // Empty slot: one action, no dialog.
  await expect(page.locator('#save-confirmation')).toBeHidden();await expect(slot(page,0)).toContainText('revision 1');
  // Held X across the modal boundary re-edges after the reset but can neither re-confirm nor act underneath.
  await slot(page,0).getByRole('button',{name:'Save'}).focus();
  await padButton(page,2,true);await page.waitForTimeout(300); // X activates the focused Save once; held beyond the edge it must do nothing more.
  const dialog=page.locator('#save-confirmation');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Replace Slot 1?');await expect(dialog).toContainText('replaces the stored record in Slot 1');
  await expect(dialog).toHaveAttribute('data-skin-state','ready'); // Registered before compositor mount, so it is painted.
  await page.waitForTimeout(250);await expect(slot(page,0)).toContainText('revision 1'); // Held X confirms nothing.
  await padButton(page,2,false);await page.waitForTimeout(150);
  // While pending, sampled controller input reaches only the dialog navigation.
  await tapPad(page,13);await tapPad(page,13);
  expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  // B held across the close boundary cancels once; the held remainder cannot close the save menu underneath.
  await padButton(page,1,true);await page.waitForTimeout(300);
  await expect(dialog).toBeHidden();
  await expect(slot(page,0).getByRole('button',{name:'Save'})).toBeFocused();
  await expect(page.locator('#save-dialog')).toBeVisible();await expect(slot(page,0)).toContainText('revision 1');
  await padButton(page,1,false);await page.waitForTimeout(150);await expect(page.locator('#save-dialog')).toBeVisible();
  // Controller X after release/rearm confirms the exact action; focus lands on the new control after the write.
  await tapPad(page,2);await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
  await tapPad(page,13);await expect(dialog.getByRole('button',{name:'Save to Slot 1'})).toBeFocused();
  await tapPad(page,2);await expect(dialog).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('Progress saved');await expect(slot(page,0)).toContainText('revision 2');
  await expect(slot(page,0).getByRole('button',{name:'Save'})).toBeFocused();
  // Keyboard/pointer confirmation path behaves the same, including post-write focus restoration.
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Save to Slot 1',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.locator('#save-status')).toContainText('Progress saved');await expect(slot(page,0)).toContainText('revision 3');
  await expect(slot(page,0).getByRole('button',{name:'Save'})).toBeFocused();
  // Keyboard: Escape cancels, restores opener focus, and changes nothing.
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await expect(slot(page,0).getByRole('button',{name:'Save'})).toBeFocused();await expect(slot(page,0)).toContainText('revision 3');
  // Compact viewport keeps the dialog inside bounds.
  await page.setViewportSize({width:390,height:844});
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(dialog).toBeVisible();
  const box=(await dialog.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  // Forced colors retain structure and the safe initial focus.
  await page.emulateMedia({forcedColors:'active'});
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await page.emulateMedia({forcedColors:null});
});

test('confirmation dialog remains usable when the windowskin fails',async({page})=>{
  await page.route('**/Window-*.png',route=>route.abort());
  await openRoom(page);await openSaves(page);
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(slot(page,0)).toContainText('revision 1');
  await slot(page,0).getByRole('button',{name:'Save'}).click();
  const dialog=page.locator('#save-confirmation');
  await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('data-skin-state','fallback');
  await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  await expect(slot(page,0)).toContainText('revision 1');
});

test('a delayed import read cannot change the payload a confirmation will store',async({page})=>{
  await openRoom(page);await openSaves(page);
  await page.evaluate(()=>{ // Hold every envelope read past the dialog-open boundary.
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(this:File):Promise<ArrayBuffer>{
      return original.call(this).then(buffer=>new Promise(resolve=>setTimeout(()=>resolve(buffer),1200)));
    };
  });
  const dialog=page.locator('#save-confirmation');
  const files={first:{name:'lens.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-lens-collected.json')},
    second:{name:'plaque.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-plaque-read.json')}};
  await page.locator('#save-import').setInputFiles(files.first); // Previewed payload: lens envelope, revision 3.
  await expect(page.locator('#save-status')).toContainText('Import validated');
  await page.locator('#save-import').setInputFiles(files.second); // Slow plaque read (revision 1) is now in flight.
  await slot(page,1).getByRole('button',{name:'Import here'}).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('revision 3'); // The dialog binds the previewed envelope identity.
  await expect(page.locator('#save-status')).toContainText('Import validated'); // The late read lands and validates while the dialog is open.
  await expect(dialog).toContainText('revision 3'); // The confirmation still names the previewed payload, not the late one.
  await dialog.getByRole('button',{name:'Import to Slot 2',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(slot(page,1)).toContainText('The Pillar Gallery');
  // The stored record must be the previewed lens envelope (revision 3), not the late plaque envelope.
  await confirm(page,1,'Load');await expect.poll(async()=>(await snapshot(page)).mapId).toBe('demo:map.gallery');
  const state=await snapshot(page);
  expect(state.session.inventory['demo:item.lens']).toBe(1);
  expect(state.session.placements['demo:object.gallery.lens-chest']?.opened).toBe(true);
});

test('load validated import confirms with the exact action and replaces the running session',async({page})=>{
  await openRoom(page);await openSaves(page);
  await page.locator('#save-import').setInputFiles({name:'plaque.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-plaque-read.json')});
  await expect(page.locator('#save-status')).toContainText('Import validated');
  await page.locator('#save-load-import').click();
  const dialog=page.locator('#save-confirmation');
  await expect(dialog).toBeVisible();await expect(dialog).toContainText('Replace the running session?');
  await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
  await dialog.getByRole('button',{name:'Load import',exact:true}).click();await expect(dialog).toBeHidden();
  await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
  const state=await snapshot(page);
  expect(state.session.facts['demo:fact.gallery.plaque-read']).toBe(true);
  await expect(page.locator('#stage')).toBeFocused();
});

test('a late import read after disposal mutates nothing',async({page})=>{
  await openRoom(page);await openSaves(page);
  await page.evaluate(()=>{ // Hold the read across the disposal boundary.
    const original=File.prototype.arrayBuffer;
    File.prototype.arrayBuffer=function(this:File):Promise<ArrayBuffer>{
      return original.call(this).then(buffer=>new Promise(resolve=>setTimeout(()=>resolve(buffer),400)));
    };
  });
  await page.locator('#save-import').setInputFiles({name:'lens.json',mimeType:'application/json',buffer:readFileSync('tests/fixtures/saves/v1-lens-collected.json')});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}))); // Dispose mid-read.
  await page.waitForTimeout(700); // The read lands after disposal.
  await expect(page.locator('#page-error-notice')).toBeHidden();
  expect(await page.evaluate(()=>window.__RPGAMEWORKS__)).toBeUndefined();
  expect(await page.locator('#save-slots button').count()).toBe(0); // Rows stay cleared; no late render or status write.
});

test('the confirmation gate exception is scoped to its owning Save/Load dialog',async({page})=>{
  await syntheticPad(page);await openRoom(page);
  // An unrelated confirmation open over exploration must not unlock gamepad polling.
  await page.evaluate(()=>{const unrelated=document.createElement('dialog');unrelated.id='unrelated-confirmation';unrelated.className='ui-confirmation';unrelated.setAttribute('open','');unrelated.append('Unrelated confirmation');document.body.append(unrelated);});
  await tapPad(page,0);await tapPad(page,2);
  expect((await snapshot(page)).burstRequests).toBe(0);
  expect((await snapshot(page)).inputMode).toBe('exploration');
  await page.evaluate(()=>document.getElementById('unrelated-confirmation')!.remove());
  // The Save/Load confirmation keeps polling alive for its owner while pending.
  await openSaves(page);await expect(page.locator('#save-slots [role="group"]')).toHaveCount(3);
  await expect(slot(page,0)).toHaveAttribute('aria-labelledby','slot-1-title');
  await slot(page,0).getByRole('button',{name:'Save'}).click();await expect(slot(page,0)).toContainText('revision 1'); // Empty slot: one action.
  await slot(page,0).getByRole('button',{name:'Save'}).focus();
  await padButton(page,2,true);await page.waitForTimeout(300); // X opens the owner's confirmation for the occupied slot.
  const dialog=page.locator('#save-confirmation');
  await expect(dialog).toBeVisible();
  await padButton(page,2,false);await page.waitForTimeout(150);
  await tapPad(page,13);await expect(dialog.getByRole('button',{name:'Save to Slot 1'})).toBeFocused(); // Polling alive for the owner.
  await padButton(page,1,true);await page.waitForTimeout(300);await expect(dialog).toBeHidden(); // B held across the boundary cancels once.
  await padButton(page,1,false);await page.waitForTimeout(150);await expect(page.locator('#save-dialog')).toBeVisible();
});
