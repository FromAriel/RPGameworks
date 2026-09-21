import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, openRoom, openTools, closeTools, snapshot, setEffects } from './helpers';
const gallery='demo:map.gallery', workshop='demo:map.workshop', lens='demo:item.lens';
const chest='demo:object.gallery.lens-chest';
async function step(page:Page,key:string):Promise<void> {
  await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try {await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true);}
  finally {await page.keyboard.up(key);}
  await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);
}
async function chestFromStart(page:Page):Promise<void> {
  await step(page,'ArrowDown');await step(page,'ArrowDown');
  for(let i=0;i<3;i++)await step(page,'ArrowRight');
  expect((await snapshot(page)).actorTile).toEqual({x:7,y:8});
}
async function collect(page:Page):Promise<void> {
  await page.keyboard.press('KeyE');await expect(page.locator('#interaction-dialog')).toBeVisible();
  await expect(page.locator('#dialog-text')).toContainText('found a polished lens');
  await page.keyboard.press('Escape');await expect(page.locator('#interaction-dialog')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
}
async function cross(page:Page,key:string,target:string):Promise<void> {
  await page.keyboard.down(key);
  try {await expect.poll(async()=>(await snapshot(page)).mapId).toBe(target);}
  finally {await page.keyboard.up(key);}
  await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
}
async function syntheticPad(page:Page):Promise<void> {
  await page.addInitScript(()=>{
    const pad={id:'M2 fixture',index:0,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:20},()=>({pressed:false,value:0}))};
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
  });
}
async function padButton(page:Page,index:number,pressed:boolean):Promise<void> {
  await page.evaluate(({index,pressed})=>Object.assign(navigator.getGamepads()[0]!.buttons[index]!,{pressed,value:pressed?1:0}),{index,pressed});
}
async function tapPad(page:Page,index:number):Promise<void> {
  await padButton(page,index,true);await page.waitForTimeout(70);await padButton(page,index,false);await page.waitForTimeout(70);
}

test('chest grants once, reconstructs after actual room travel and room restart, but not reload',async({page},info)=>{
  await openRoom(page,'?map='+gallery);await chestFromStart(page);await collect(page);
  let state=(await snapshot(page)).session;expect(state.inventory[lens]).toBe(1);expect(state.placements[chest]?.opened).toBe(true);
  await page.keyboard.press('KeyE');await expect(page.locator('#dialog-text')).toContainText('already took');
  await page.keyboard.press('Escape');await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(state);
  for(let i=0;i<5;i++)await step(page,'ArrowLeft');
  await step(page,'ArrowUp');await step(page,'ArrowUp');await cross(page,'ArrowLeft',workshop);
  await cross(page,'ArrowRight',gallery);
  expect((await snapshot(page)).session).toEqual(state);
  await openTools(page,'debug');await page.locator('#restart').click();await closeTools(page);
  await expect.poll(async()=>(await snapshot(page)).phase).toBe('ready');
  expect((await snapshot(page)).session).toEqual(state);
  await page.keyboard.press('KeyI');await expect(page.locator('#inventory-dialog')).toBeVisible();
  const lensRow=page.locator('[data-item-id="'+lens+'"]');
  await expect(lensRow.locator('.ui-list-row__label')).toHaveText('Polished lens');
  await expect(lensRow.locator('.ui-list-row__trailing')).toHaveText('× 1');
  await expect(page.locator('#inventory-dialog')).toHaveAttribute('data-skin-state','ready');
  await page.screenshot({path:info.outputPath('m2-inventory-wide.png')});
  await page.reload();await expect.poll(()=>page.evaluate(()=>window.__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  expect((await snapshot(page)).session.inventory).toEqual({});
  expect((await snapshot(page)).session.placements).toEqual({});
});

test('Menu opens real inventory with no tools, empty state, and working Settings route',async({page})=>{
  await openRoom(page);await page.locator('#tools-toggle').click();
  await expect(page.locator('#inventory-dialog')).toBeVisible();await expect(page.locator('#tools-panel')).toBeHidden();
  await expect(page.locator('#item-name')).toHaveText('Empty inventory');
  await expect(page.locator('#inventory-close')).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(page.locator('#inventory-settings')).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#tools-panel')).toBeVisible();
  await expect(page.locator('#inventory-dialog')).toBeHidden();await closeTools(page);
});

test('menu queued during movement stops at a safe tile and cannot move or burst underneath it',async({page})=>{
  await openRoom(page);await page.keyboard.down('ArrowRight');
  await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true);
  await page.keyboard.press('KeyI');await page.keyboard.up('ArrowRight');
  await expect(page.locator('#inventory-dialog')).toBeVisible();const before=await snapshot(page);
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('#inventory-close')).toBeFocused();
  await page.keyboard.press('Space'); // Confirm Return to game, not an exploration burst.
  await expect(page.locator('#inventory-dialog')).toBeHidden();
  await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');
  const after=await snapshot(page);expect(after.actorTile).toEqual(before.actorTile);expect(after.burstRequests).toBe(before.burstRequests);
  await expect(page.locator('#stage')).toBeFocused();
});

test('controller Menu opens inventory, keeps held inputs isolated, and cancel restores exploration',async({page})=>{
  await syntheticPad(page);await openRoom(page);await expect(page.locator('#controller-brief')).toContainText('Ready');
  await padButton(page,9,true);await expect(page.locator('#inventory-dialog')).toBeVisible();
  await page.waitForTimeout(220);await expect(page.locator('#inventory-dialog')).toBeVisible();
  await padButton(page,9,false);await page.waitForTimeout(120);
  await tapPad(page,12);await expect(page.locator('#inventory-settings')).toBeFocused();
  await tapPad(page,2);await expect(page.locator('#options-panel')).toBeVisible();
  const before=await snapshot(page);await tapPad(page,13); // moves to next real focus target, not character
  expect((await snapshot(page)).actorTile).toEqual(before.actorTile);
  await padButton(page,1,true);await expect(page.locator('#tools-panel')).toBeHidden();
  await padButton(page,0,true);await page.waitForTimeout(200);expect((await snapshot(page)).burstRequests).toBe(0);
  await padButton(page,1,false);await padButton(page,0,false);await page.waitForTimeout(120);
  await tapPad(page,0);await expect.poll(async()=>(await snapshot(page)).burstRequests).toBe(1);
});

test('v2 custom bindings survive v3 migration and use an unoccupied menu button',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('rpgameworks.controller.v2',JSON.stringify({version:2,enabled:true,allowUnmapped:false,
    deadzone:.4,axisX:2,axisY:3,invertX:true,invertY:false,buttons:{up:12,down:13,left:14,right:15,burst:9,interact:4,cancel:5}})));
  await openRoom(page);await openTools(page);await page.locator('#controller-settings summary').click();
  await expect(page.locator('#controller-button-burst')).toHaveValue('9');await expect(page.locator('#controller-button-interact')).toHaveValue('4');
  await expect(page.locator('#controller-button-menu')).not.toHaveValue('9');await expect(page.locator('#controller-deadzone')).toHaveValue('40');
  const stored=await page.evaluate(()=>({old:JSON.parse(localStorage.getItem('rpgameworks.controller.v2')!),current:JSON.parse(localStorage.getItem('rpgameworks.controller.v3')!)}));
  expect(stored.old.version).toBe(2);expect(stored.current.version).toBe(3);
  for(const [key,value] of Object.entries(stored.old.buttons))expect(stored.current.buttons[key]).toBe(value);
  await closeTools(page);await page.keyboard.press('KeyI');await expect(page.locator('#inventory-prompt')).toContainText('button 4');
});

test('second chest stack failure keeps its closed state and correct inventory',async({page})=>{
  await page.route('**/generated/content/maps/gallery.*.json',async route=>{
    const response=await route.fetch(), data=await response.json(), first=data.objects.find((o:{id:string})=>o.id===chest);
    data.objects.push({...first,id:'demo:object.gallery.second',x:7,y:9});await route.fulfill({json:data});
  });
  await openRoom(page,'?map='+gallery);await chestFromStart(page);await collect(page);
  // Face a solid chest below without taking a step.
  await page.keyboard.down('ArrowDown');await expect.poll(async()=>(await snapshot(page)).facing).toBe('down');await page.keyboard.up('ArrowDown');
  await page.keyboard.press('KeyE');await expect(page.locator('#dialog-text')).toContainText('unchanged');
  const state=(await snapshot(page)).session;expect(state.inventory[lens]).toBe(1);
  expect(state.placements['demo:object.gallery.second']).toBeUndefined();expect(state.revision).toBe(1);
});

test('invalid chest item in destination fails safely and leaves current room and session intact',async({page})=>{
  await page.route('**/generated/content/maps/gallery.*.json',async route=>{
    const response=await route.fetch(), data=await response.json();const object=data.objects.find((o:{id:string})=>o.id===chest);object.states.flatMap((s:{interaction?:{actions?:{type:string;itemId?:string}[]}})=>s.interaction?.actions??[]).find((a:{type:string})=>a.type==='changeItem').itemId='demo:item.missing';await route.fulfill({json:data});
  });
  await openRoom(page);await page.keyboard.down('ArrowRight');
  await expect(page.locator('#dialog-title')).toHaveText('The doorway could not open');await page.keyboard.up('ArrowRight');
  expect((await snapshot(page)).mapId).toBe(workshop);expect((await snapshot(page)).session.inventory).toEqual({});
  await page.locator('#dialog-cancel').click();await expect(page.locator('#stage')).toBeFocused();
});

test('inventory stays usable at narrow sizes, with skin failure, and with literal Unicode text',async({page},info)=>{
  await page.setViewportSize({width:390,height:650});
  await page.route('**/Window-*.png',route=>route.abort());
  await page.route('**/generated/content/items.*.json',async route=>{
    const response=await route.fetch(), data=await response.json();data.strings.en['lens.name']='<img onerror=alert(1)> 世界';await route.fulfill({json:data});
  });
  await openRoom(page,'?map='+gallery);await chestFromStart(page);await collect(page);await page.keyboard.press('KeyI');
  await expect(page.locator('#inventory-dialog')).toHaveAttribute('data-skin-state','fallback');
  await expect(page.locator('#item-name')).toContainText('<img');await expect(page.locator('#inventory-dialog img')).toHaveCount(0);
  const box=(await page.locator('#inventory-dialog').boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:info.outputPath('m2-inventory-narrow-fallback.png')});await page.keyboard.press('Escape');await expect(page.locator('#stage')).toBeFocused();
});

test('repeated inventory opens preserve state, scene counts and single atlas loading',async({page})=>{
  const requests:string[]=[];page.on('request',r=>{if(/Window-.*png/.test(r.url()))requests.push(r.url());});
  await openRoom(page,'?map='+gallery);await chestFromStart(page);await collect(page);const before=await snapshot(page);
  for(let i=0;i<12;i++) {await page.keyboard.press('KeyI');await expect(page.locator('#inventory-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#stage')).toBeFocused();}
  const after=await snapshot(page);expect(after.session).toEqual(before.session);expect(after.starts).toBe(before.starts);expect(after.displayObjects).toBe(before.displayObjects);
  expect(requests).toHaveLength(1);await expect(page.locator('[data-window-skin]')).toHaveCount(5);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  await expect(page.locator('#inventory-list button')).toHaveCount(0);expect(await page.evaluate(()=>window.__RPGAMEWORKS__)).toBeUndefined();
});

test('missing item catalog reports a visible loading error without a fake empty inventory',async({page})=>{
  await page.route('**/generated/content/items.*.json',route=>route.abort());await page.goto('./');
  await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#inventory-dialog')).toBeHidden();
});

test('effects disabled cannot change chest rewards',async({page})=>{
  await openRoom(page,'?map='+gallery);await setEffects(page,false);await chestFromStart(page);await collect(page);
  expect((await snapshot(page)).session.inventory[lens]).toBe(1);expect((await snapshot(page)).effectsEnabled).toBe(false);
});

// Reusable authoring proof: a larger list is collected through ordinary interactions, not a write-capable debug hook.
test('many content-authored items scroll and select directly without consuming them',async({page},info)=>{
  test.setTimeout(60000);await syntheticPad(page);await page.setViewportSize({width:390,height:650});
  await page.route('**/generated/content/items.*.json',async route=>{
    const data=JSON.parse(readFileSync('content/games/demo/items.json','utf8'));data.items=[];data.strings.en={};
    for(let i=0;i<14;i++){data.items.push({id:`demo:item.test-${i}`,nameKey:`name.${i}`,descriptionKey:`description.${i}`,maxStack:9});data.strings.en[`name.${i}`]=`Keepsake ${i+1}`;data.strings.en[`description.${i}`]=`Distinct description ${i+1}`;}
    await route.fulfill({json:data});
  });
  await page.route('**/generated/content/maps/gallery.*.json',async route=>{
    const data=JSON.parse(readFileSync('content/games/demo/maps/gallery.json','utf8'));const template=data.objects.find((o:{id:string})=>o.id===chest);
    data.layers[0].rows=data.layers[0].rows.map((r:string,y:number)=>y===0||y===13?r:'#'+'a'.repeat(22)+'#');
    data.collision=data.collision.map((r:string,y:number)=>y===0||y===13?r:'#'+'.'.repeat(22)+'#');
    data.objects=[];data.spawns[0]={id:'start',x:2,y:5,facing:'right'};
    for(let i=0;i<14;i++){const copy=structuredClone(template);copy.id=`demo:object.test-${i}`;copy.x=i+3;copy.y=4;copy.states.flatMap((s:{interaction?:{actions?:{type:string;itemId?:string}[]}})=>s.interaction?.actions??[]).find((a:{type:string})=>a.type==='changeItem').itemId=`demo:item.test-${i}`;data.objects.push(copy);}
    await route.fulfill({json:data});
  });
  await openRoom(page,'?map='+gallery);
  for(let i=0;i<14;i++) {
    await step(page,'ArrowRight');await page.keyboard.down('ArrowUp');await expect.poll(async()=>(await snapshot(page)).facing).toBe('up');await page.keyboard.up('ArrowUp');
    await collect(page);
  }
  const state=(await snapshot(page)).session;expect(Object.keys(state.inventory)).toHaveLength(14);
  await page.keyboard.press('KeyI');await expect(page.locator('#inventory-list button')).toHaveCount(14);
  for(let i=0;i<11;i++)await page.keyboard.press('ArrowDown');
  await expect(page.locator('#item-name')).toHaveText('Keepsake 12');
  expect(await page.locator('#inventory-list').evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await tapPad(page,13);await expect(page.locator('#item-name')).toHaveText('Keepsake 13');
  await tapPad(page,2);expect((await snapshot(page)).session).toEqual(state);
  await page.screenshot({path:info.outputPath('m2-inventory-list-narrow.png')});
});

test('direct configuration steps skip conflicts and text entry does not close the menu',async({page})=>{
  await syntheticPad(page);await openRoom(page);await openTools(page);await page.locator('#controller-settings summary').click();
  await page.locator('#controller-axis-x').focus();await page.waitForTimeout(120);await tapPad(page,15);
  await expect(page.locator('#controller-axis-x')).toHaveValue('2'); // Y already occupies axis 1.
  await page.locator('#controller-button-burst').focus();await page.waitForTimeout(120);await tapPad(page,15);
  await expect(page.locator('#controller-button-burst')).toHaveValue('3'); // Skip cancel=1 and interact=2.
  await expect(page.locator('#controller-button-interact')).toHaveValue('2');
  await page.locator('#controller-report-button').click();const report=await page.locator('#controller-report').inputValue();
  await page.keyboard.press('KeyI');await expect(page.locator('#tools-panel')).toBeVisible();
  await expect(page.locator('#controller-report')).toHaveValue(report);
  const before=await snapshot(page);await page.waitForTimeout(150);expect((await snapshot(page)).actorTile).toEqual(before.actorTile);
});

test('disconnect and reconnect during inventory never consume a held confirm or cancel',async({page})=>{
  await syntheticPad(page);await openRoom(page,'?map='+gallery);await chestFromStart(page);await collect(page);
  await tapPad(page,9);await expect(page.locator('#inventory-dialog')).toBeVisible();const before=(await snapshot(page)).session;
  await page.evaluate(()=>{(navigator.getGamepads()[0] as unknown as {connected:boolean}).connected=false;});
  await page.waitForTimeout(150);await expect(page.locator('#inventory-dialog')).toBeVisible();
  await padButton(page,1,true);await page.evaluate(()=>{(navigator.getGamepads()[0] as unknown as {connected:boolean}).connected=true;});
  await page.waitForTimeout(200);await expect(page.locator('#inventory-dialog')).toBeVisible();
  expect((await snapshot(page)).session).toEqual(before);
  await padButton(page,1,false);await page.waitForTimeout(120);await tapPad(page,1);
  await expect(page.locator('#inventory-dialog')).toBeHidden();await expect(page.locator('#stage')).toBeFocused();
});
