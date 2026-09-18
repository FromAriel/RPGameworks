import { test, expect, openRoom, snapshot } from './helpers';

test('long dialogue starts at the first line and page changes reset only its text scroller', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.route('**/generated/content/maps/*workshop*',async route=>{
    const response=await route.fetch(), data=await response.json(), message=data.messages[0];
    data.strings.en[message.pages[0]]='FIRST LINE.\n'+('A readable long paragraph.\n').repeat(35);
    data.strings.en[message.pages[1]]='SECOND PAGE.\n'+('A second long paragraph.\n').repeat(35);
    await route.fulfill({json:data});
  });
  await openRoom(page);
  await page.keyboard.down('ArrowDown');
  try { await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true); }
  finally { await page.keyboard.up('ArrowDown'); }
  await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);
  expect((await snapshot(page)).actorTile).toEqual({x:10,y:7});
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toBeVisible();
  await expect(page.locator('#interaction-dialog')).toHaveAttribute('data-skin-state','ready');
  const scroll=page.locator('.dialog-scroll');
  expect(await scroll.evaluate(e=>e.scrollTop)).toBe(0);
  await expect(page.locator('#dialog-advance')).toBeFocused();
  await scroll.hover(); await page.mouse.wheel(0,400);
  await expect.poll(()=>scroll.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await page.locator('#dialog-advance').click();
  await expect.poll(async()=>(await snapshot(page)).messagePage).toBe(2);
  expect(await scroll.evaluate(e=>e.scrollTop)).toBe(0);
  await expect(page.locator('#dialog-text')).toContainText('SECOND PAGE.');
  await page.keyboard.press('Escape');
  await expect(page.locator('#interaction-dialog')).toBeHidden();
  await expect(page.locator('#stage')).toBeFocused();
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toBeVisible();
  expect(await scroll.evaluate(e=>e.scrollTop)).toBe(0);
});
