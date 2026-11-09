import { test, expect, openRoom, snapshot } from './helpers';

const SUPPLY = 'demo:map.supply-room';
const encounter = 'demo:encounter.practice-sigil';

async function approach(page: import('@playwright/test').Page): Promise<void> {
  await openRoom(page, `?map=${SUPPLY}`);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBe(3);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.press('ArrowLeft');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.practice-sigil');
}

test('practice battle accepts commands, resolves first, and restores exploration focus', async ({ page }) => {
  await approach(page);
  const before = (await snapshot(page)).session;
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(encounter);
  await expect(page.locator('#interaction-dialog')).toContainText('24/24 HP');
  await page.getByRole('button', {name:'Guard'}).click();
  expect((await snapshot(page)).battle?.phase).toBe('result');
  await expect(page.locator('#interaction-dialog')).toContainText('guard');
  await expect(page.getByRole('button', {name:'Continue'})).toHaveCount(1);
  await page.getByRole('button', {name:'Continue'}).click();
  await page.getByRole('button', {name:'Attack'}).click();
  await expect(page.locator('#interaction-dialog')).toContainText('damage');
  await expect.poll(async () => (await snapshot(page)).activeEffects).toBe(0);
  for(let rounds=0;rounds<8 && (await snapshot(page)).battle?.phase!=='victory';rounds++){
    await page.getByRole('button', {name:'Continue'}).click();
    await page.getByRole('button', {name:'Attack'}).click();
  }
  expect((await snapshot(page)).battle?.phase).toBe('victory');
  await page.getByRole('button', {name:'Finish'}).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('command');
  await page.getByRole('button', {name:'Leave'}).click();
  await expect(page.locator('#stage')).toBeFocused();
});

test('failed catalog load leaves the room playable', async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', route => route.fulfill({status:503,body:'unavailable'}));
  await approach(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toContainText('could not load');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  expect((await snapshot(page)).mapId).toBe(SUPPLY);
});

test('narrow battle supports controller cancel and pointer Leave without owned-resource growth', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(() => Object.defineProperty(navigator,'getGamepads',{
    configurable:true,value:()=>[(window as typeof window & {__BATTLE_PAD__?: unknown}).__BATTLE_PAD__ ?? null],
  }));
  await approach(page);
  const base=await snapshot(page);
  const pad=async(buttons:number[])=>{
    await page.evaluate(buttons=>{(window as typeof window & {__BATTLE_PAD__?: unknown}).__BATTLE_PAD__={
      id:'Battle controller',index:0,mapping:'standard',connected:true,axes:[0,0],
      buttons:Array.from({length:20},(_,index)=>({pressed:buttons.includes(index),value:buttons.includes(index)?1:0})),
    };},buttons);
    await page.waitForTimeout(120);
  };
  for(let entry=0;entry<3;entry++){
    await page.keyboard.press('KeyE');
    await expect.poll(async()=>(await snapshot(page)).battle?.phase).toBe('command');
    await expect(page.locator('#interaction-dialog')).toBeInViewport();
    if(entry===0){await pad([]);await pad([1]);await pad([]);}
    else await page.getByRole('button',{name:'Leave',exact:true}).click();
    await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');
    await expect(page.locator('#stage')).toBeFocused();
    const state=await snapshot(page);
    expect(state.actorTile).toEqual(base.actorTile);
    expect(state.textureCount).toBe(base.textureCount);
    expect(state.displayObjects).toBe(base.displayObjects);
    expect(state.activeEffects).toBe(0);
    expect(state.session).toEqual(base.session);
  }
});

test('authored defeat offers Retry with the same opening state and a safe Leave', async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json',async route=>{
    const response=await route.fetch();
    const catalog=await response.json() as {encounters:{enemy:{attack:number}}[]};
    catalog.encounters[0]!.enemy.attack=30;
    await route.fulfill({json:catalog});
  });
  await approach(page);
  const before=(await snapshot(page)).session;
  await page.keyboard.press('KeyE');
  await expect.poll(async()=>(await snapshot(page)).battle?.phase).toBe('command');
  await page.getByRole('button',{name:'Guard'}).click();
  await expect.poll(async()=>(await snapshot(page)).battle?.phase).toBe('result');
  await page.getByRole('button',{name:'Continue'}).click();
  await page.getByRole('button',{name:'Guard'}).click();
  await expect.poll(async()=>(await snapshot(page)).battle?.phase).toBe('defeat');
  await page.getByRole('button',{name:'Retry'}).click();
  expect((await snapshot(page)).battle).toMatchObject({phase:'command',round:1,heroHp:24,enemyHp:18});
  await page.getByRole('button',{name:'Leave',exact:true}).click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});
