import type { Page } from '@playwright/test';
import { test,expect,openRoom,snapshot } from './helpers';

async function step(page:Page,key:string):Promise<void>{
  await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try{await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true);}finally{await page.keyboard.up(key);}
  await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(false);
}
async function walk(page:Page,key:string,count:number):Promise<void>{for(let i=0;i<count;i++)await step(page,key);}
async function exit(page:Page,key:string,mapId:string):Promise<void>{await page.keyboard.down(key);try{await expect.poll(async()=>(await snapshot(page)).mapId).toBe(mapId);}finally{await page.keyboard.up(key);}await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');}
async function face(page:Page,key:string):Promise<void>{await page.keyboard.down(key);await page.waitForTimeout(120);await page.keyboard.up(key);await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);}
async function interact(page:Page):Promise<void>{await page.keyboard.down('KeyE');try{await expect(page.locator('#interaction-dialog')).toBeVisible();}finally{await page.keyboard.up('KeyE');}}
async function close(page:Page):Promise<void>{await page.keyboard.press('Escape');await expect(page.locator('#interaction-dialog')).toBeHidden();}

test('accepting and completing Mara’s quest updates the Journal and Gallery light',async({page},info)=>{
  test.setTimeout(120_000);
  await openRoom(page,'?map=demo:map.gallery');
  await step(page,'ArrowUp');await interact(page);await expect(page.locator('#dialog-text')).toContainText('hidden line glows');await close(page);
  await step(page,'ArrowDown');await walk(page,'ArrowLeft',2);await exit(page,'ArrowLeft','demo:map.workshop');
  await walk(page,'ArrowLeft',7);await step(page,'ArrowDown');await interact(page);
  await expect(page.locator('#dialog-choices')).toContainText('Accept the lens quest');
  await page.locator('[data-dialogue-choice="accept"]').click();
  expect((await snapshot(page)).session.quests['demo:quest.gallery-light']).toBe('active');
  await expect(page.locator('[data-dialogue-choice="hand-in"]')).toHaveCount(0);
  await page.locator('[data-dialogue-choice="wrap-up"]').click();await expect(page.locator('#interaction-dialog')).toBeHidden();
  await interact(page);await expect(page.locator('[data-dialogue-choice="hand-in"]')).toHaveCount(0);await close(page);
  await page.keyboard.press('KeyI');await page.locator('#inventory-journal').click();await expect(page.locator('#journal-body')).toContainText('Bring Mara the polished lens');await page.locator('#inventory-close').click();
  await step(page,'ArrowUp');await exit(page,'ArrowRight','demo:map.gallery');
  await walk(page,'ArrowDown',2);await walk(page,'ArrowRight',5);await interact(page);await expect(page.locator('#dialog-text')).toContainText('polished lens');await close(page);
  expect((await snapshot(page)).session.inventory['demo:item.lens']).toBe(1);
  await walk(page,'ArrowLeft',5);await walk(page,'ArrowUp',2);await exit(page,'ArrowLeft','demo:map.workshop');
  await walk(page,'ArrowLeft',7);await step(page,'ArrowDown');await interact(page);
  await page.locator('[data-dialogue-choice="hand-in"]').click();await expect(page.locator('#dialog-text')).toContainText('light');await close(page);
  const state=(await snapshot(page)).session;expect(state.quests['demo:quest.gallery-light']).toBe('completed');expect(state.inventory['demo:item.lens']).toBeUndefined();
  await page.keyboard.press('KeyI');await page.locator('#inventory-journal').click();await expect(page.locator('#journal-body')).toContainText('shines again');await page.locator('#inventory-close').click();
  await step(page,'ArrowUp');await exit(page,'ArrowRight','demo:map.gallery');
  await page.screenshot({path:info.outputPath('gallery-light-restored.png')});
  expect((await snapshot(page)).session.quests['demo:quest.gallery-light']).toBe('completed');
});

test('a lens found before acceptance can be kept or handed to Mara immediately',async({page})=>{
  test.setTimeout(120_000);
  await openRoom(page,'?map=demo:map.gallery');
  await step(page,'ArrowUp');await interact(page);await close(page);
  await step(page,'ArrowDown');await step(page,'ArrowDown');await walk(page,'ArrowRight',4);
  await face(page,'ArrowDown');await interact(page);await close(page);
  expect((await snapshot(page)).session.inventory['demo:item.lens']).toBe(1);
  await walk(page,'ArrowLeft',4);await step(page,'ArrowUp');await walk(page,'ArrowLeft',2);await exit(page,'ArrowLeft','demo:map.workshop');
  await walk(page,'ArrowLeft',7);await step(page,'ArrowDown');await interact(page);
  await expect(page.locator('#dialog-text')).toContainText('May I take it?');
  await expect(page.locator('#dialog-choices')).toContainText('Keep it for now');
  await page.locator('[data-dialogue-choice="later"]').click();
  expect((await snapshot(page)).session.quests['demo:quest.gallery-light']).toBeUndefined();
  expect((await snapshot(page)).session.inventory['demo:item.lens']).toBe(1);
  await interact(page);await page.locator('[data-dialogue-choice="hand-in"]').click();
  await expect(page.locator('#dialog-text')).toContainText('Gallery light');await close(page);
  const state=(await snapshot(page)).session;
  expect(state.quests['demo:quest.gallery-light']).toBe('completed');expect(state.inventory['demo:item.lens']).toBeUndefined();
  await interact(page);await expect(page.locator('[data-dialogue-choice="hand-in"]')).toHaveCount(0);await close(page);
});

test('the archive clerk uses the same item hand-in flow across the keyed Storeroom',async({page})=>{
  test.setTimeout(120_000);
  await openRoom(page,'?map=demo:map.gallery');
  await step(page,'ArrowDown');await walk(page,'ArrowRight',7);await step(page,'ArrowUp');await step(page,'ArrowUp');await face(page,'ArrowRight');await interact(page);await expect(page.locator('#dialog-text')).toContainText('gate clatters open');await close(page);
  await step(page,'ArrowDown');await step(page,'ArrowRight');await step(page,'ArrowRight');await walk(page,'ArrowUp',3);await walk(page,'ArrowRight',3);
  await interact(page);await expect(page.locator('#dialog-text')).toContainText('archive ledger');await page.locator('[data-dialogue-choice="accept"]').click();
  await expect(page.locator('[data-dialogue-choice="hand-in"]')).toHaveCount(0);
  await page.locator('[data-dialogue-choice="wrap-up"]').click();await expect(page.locator('#interaction-dialog')).toBeHidden();
  await interact(page);await expect(page.locator('[data-dialogue-choice="hand-in"]')).toHaveCount(0);await close(page);
  expect((await snapshot(page)).session.quests['demo:quest.archive-ledger']).toBe('active');
  await walk(page,'ArrowUp',2);await walk(page,'ArrowRight',5);await interact(page);await expect(page.locator('#dialog-text')).toContainText('brass key');await close(page);
  await walk(page,'ArrowDown',2);await face(page,'ArrowLeft');await interact(page);await expect(page.locator('#dialog-text')).toContainText('unlocked');await close(page);
  await exit(page,'ArrowLeft','demo:map.storeroom');
  await walk(page,'ArrowRight',2);await face(page,'ArrowUp');await interact(page);await expect(page.locator('#dialog-text')).toContainText('archive ledger');await close(page);
  expect((await snapshot(page)).session.inventory['demo:item.archive-ledger']).toBe(1);
  await walk(page,'ArrowLeft',3);await exit(page,'ArrowLeft','demo:map.gallery');
  await step(page,'ArrowUp');await walk(page,'ArrowLeft',4);await step(page,'ArrowDown');await face(page,'ArrowLeft');await interact(page);
  await page.locator('[data-dialogue-choice="hand-in"]').click();await expect(page.locator('#dialog-text')).toContainText('safe again');await close(page);
  let state=(await snapshot(page)).session;expect(state.quests['demo:quest.archive-ledger']).toBe('completed');expect(state.inventory['demo:item.archive-ledger']).toBeUndefined();expect(state.inventory['demo:item.brass-key']).toBe(1);
  await page.keyboard.press('KeyI');await page.locator('#inventory-journal').click();await expect(page.locator('#journal-body')).toContainText('ledger back');await page.locator('#inventory-saves').click();
  await page.locator('#save-slots .save-slot').first().getByRole('button',{name:'Save'}).click();await expect(page.locator('#save-status')).toContainText('Progress saved');
  await page.reload();await expect.poll(()=>page.evaluate(()=>(window as any).__RPGAMEWORKS__?.snapshot().phase)).toBe('ready');
  await page.locator('#tools-toggle').click();await page.locator('#inventory-saves').click();await page.locator('#save-slots .save-slot').first().getByRole('button',{name:'Load'}).click();
  await page.locator('#save-confirmation').getByRole('button',{name:'Load Slot 1'}).click();await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
  state=(await snapshot(page)).session;expect(state.quests['demo:quest.archive-ledger']).toBe('completed');expect(state.inventory['demo:item.brass-key']).toBe(1);
});

test('controller selects a dialogue choice and cancel returns to exploration',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[(window as any).__QUEST_PAD__??null]});});
  await openRoom(page,'?map=demo:map.gallery&spawn=from-storeroom');
  await step(page,'ArrowUp');await walk(page,'ArrowLeft',4);await step(page,'ArrowDown');await face(page,'ArrowLeft');await interact(page);
  const pad=async(buttons:number[])=>{await page.evaluate(buttons=>{(window as any).__QUEST_PAD__={id:'Quest controller',index:0,mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:20},(_,index)=>({pressed:buttons.includes(index),value:buttons.includes(index)?1:0}))};},buttons);await page.waitForTimeout(100);};
  await pad([]);await pad([2]);await expect.poll(async()=>(await snapshot(page)).session.quests['demo:quest.archive-ledger']).toBe('active');
  await pad([]);await pad([1]);await expect(page.locator('#interaction-dialog')).toBeHidden();await expect(page.locator('#stage')).toBeFocused();
});
