import type { Page } from '@playwright/test';
import { test, expect, openRoom, openTools, closeTools, snapshot } from './helpers';

// Page windows on baked Pixel Frame frames (decision 0010, W2.3). Replaces the W1 atlas checks; the surfaces keep the
// same [data-window-skin] / data-skin-state contract.
const dialog = '#interaction-dialog';
const MANIFEST = /\/generated\/frames\/manifest\.json$/;
async function talk(page: Page): Promise<void> {
  await page.keyboard.down('ArrowDown');
  try { await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true); }
  finally { await page.keyboard.up('ArrowDown'); }
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  expect((await snapshot(page)).actorTile).toEqual({x:10,y:7});
  await page.keyboard.press('KeyE');
  await expect(page.locator(dialog)).toBeVisible();
}
const paintings = (page: Page) => page.locator('[data-window-skin]').evaluateAll(elements => elements.map(e => (e as HTMLElement).dataset.skinPaints ?? '0'));
const frameSource = (page: Page, selector: string) => page.locator(selector).evaluate(e => getComputedStyle(e).borderImageSource);

test('frames load lazily once from the bake manifest, while the clean launch keeps only the game canvas', async ({page}) => {
  const manifests:string[]=[], images:string[]=[];
  page.on('request',r=>{if(MANIFEST.test(r.url()))manifests.push(r.url());if(/\/generated\/frames\/page-[a-z]+\.[0-9a-f]{12}\.png$/.test(r.url()))images.push(r.url());});
  await openRoom(page); await expect(page.locator('canvas')).toHaveCount(1); expect(manifests).toHaveLength(0);
  await openTools(page); await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-state','ready');
  expect(await frameSource(page,'#tools-panel')).toMatch(/generated\/frames\/page-raised\.[0-9a-f]{12}\.png/);
  expect(await page.locator('#tools-title').evaluate(e=>getComputedStyle(e).borderImageSource)).toMatch(/nameplate-raised/);
  await closeTools(page); await talk(page);
  await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  expect(manifests).toHaveLength(1); expect(new Set(images).size).toBe(1); await expect(page.locator('canvas')).toHaveCount(1);
});

test('real Settings has a nameplate title and a framed section divider', async ({page},info) => {
  await openRoom(page); await openTools(page);
  await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-title-mode','plate');
  await expect(page.locator('.skin-divider')).toHaveAttribute('data-skin-state','ready');
  expect(await page.locator('.skin-divider').evaluate(e=>getComputedStyle(e,'::after').borderImageSource)).toMatch(/page-raised/);
  await expect(page.locator('#tools-title')).toHaveText('Settings');
  await expect(page.locator('#options-tab')).toBeFocused();
  const initial=await snapshot(page); await page.locator('#effects').uncheck();
  expect((await snapshot(page)).effectsEnabled).toBe(false);expect((await snapshot(page)).actorTile).toEqual(initial.actorTile);
  await page.screenshot({path:info.outputPath('w2-settings-wide.png')});
  await page.locator('#debug-tab').click();await expect(page.locator('#tools-title')).toHaveText('Debug');
  await expect(page.locator('#skin-status')).toContainText('classic-blue');await closeTools(page);
  await expect(page.locator('#stage')).toBeFocused();
});

test('Mara uses her real title and a banded fill that follows the window height at wide and narrow sizes', async ({page},info) => {
  await openRoom(page); await talk(page);
  await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  await expect(page.locator(dialog)).toHaveAttribute('data-skin-title-mode','plate');
  await expect(page.locator('#dialog-title')).toContainText('Mara');
  const fill=async()=>page.locator(dialog).evaluate(e=>({image:e.style.backgroundImage,height:e.clientHeight,scale:Number.parseInt(getComputedStyle(e).getPropertyValue('--skin-scale'),10)}));
  const wide=await fill();
  expect(wide.image).toMatch(/^linear-gradient/);
  // At most one hard-stop band per 4 logical pixels of the padding box; neighbouring bands that round to the same
  // colour merge into one stop.
  const bands=Math.ceil(Math.ceil(wide.height/wide.scale)/4), stops=new Set(wide.image.match(/rgb\([^)]*\)/g)).size;
  expect(stops).toBeGreaterThan(bands/2);expect(stops).toBeLessThanOrEqual(bands);
  await page.screenshot({path:info.outputPath('w2-dialogue-wide.png')});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>(await fill()).image).not.toBe(wide.image); // Repainted for the new height and scale.
  await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  await page.screenshot({path:info.outputPath('w2-dialogue-narrow.png')});
  const tile=(await snapshot(page)).actorTile;
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(160);await page.keyboard.up('ArrowRight');
  expect((await snapshot(page)).actorTile).toEqual(tile);
  await page.keyboard.press('Enter');await expect.poll(async()=>(await snapshot(page)).messagePage).toBe(2);
  await page.keyboard.press('Escape');await expect(page.locator(dialog)).toBeHidden();await expect(page.locator('#stage')).toBeFocused();
});

test('odd widths reframe without clipping or changing the game state', async ({page},info) => {
  await openRoom(page);await talk(page);const before=await snapshot(page);
  for(const width of [377,403,517,639,815]) {
    await page.setViewportSize({width,height:650});await page.waitForTimeout(70);
    const b=(await page.locator(dialog).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);
    expect(await page.locator(dialog).evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  }
  const after=await snapshot(page);expect(after.starts).toBe(before.starts);expect(after.actorTile).toEqual(before.actorTile);
  await page.screenshot({path:info.outputPath('w2-dialogue-odd-width.png')});
});

test('long Unicode titles wrap inside the nameplate and long literal content stays scrollable', async ({page},info) => {
  await page.setViewportSize({width:343,height:620});
  await page.route('**/generated/content/maps/*workshop*',async route=>{
    const response=await route.fetch(); const data=await response.json();
    const msg=data.messages[0]; data.strings.en[msg.speakerKey]='Mara — Keeper of the Silver Archive · 世界 · A deliberately lengthy speaker name';
    data.strings.en[msg.pages[0]]=('<b>Not markup</b> A long, readable line. 世界 🌟\n').repeat(20);
    await route.fulfill({json:data});
  });
  await openRoom(page);await talk(page);
  await expect(page.locator(dialog)).toHaveAttribute('data-skin-title-mode','plate');
  await expect(page.locator('#dialog-title')).toContainText('世界');
  const title=(await page.locator('#dialog-title').boundingBox())!, box=(await page.locator(dialog).boundingBox())!;
  expect(title.x).toBeGreaterThanOrEqual(box.x);expect(title.x+title.width).toBeLessThanOrEqual(box.x+box.width);
  await expect(page.locator('#dialog-text b')).toHaveCount(0);
  expect(await page.locator('.dialog-scroll').evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  await page.locator('#dialog-cancel').click();await expect(page.locator(dialog)).toBeHidden();
  await page.keyboard.press('KeyE');await expect(page.locator(dialog)).toBeVisible();
  await page.screenshot({path:info.outputPath('w2-long-title.png')});
});

test('hidden or idle chrome does not repaint on game frames or Debug updates', async ({page}) => {
  await openRoom(page);await openTools(page,'debug');await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-state','ready');
  await page.waitForTimeout(150);const counts=await paintings(page);
  await page.waitForTimeout(600);expect(await paintings(page)).toEqual(counts);
  await closeTools(page);const hidden=await paintings(page);await page.waitForTimeout(600);expect(await paintings(page)).toEqual(hidden);
});

test('repeated menu and dialogue use keeps decoration and input ownership bounded', async ({page}) => {
  await openRoom(page);await openTools(page);await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-state','ready');await closeTools(page);
  await talk(page);await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  const initial=await snapshot(page);
  for(let i=0;i<8;i++) {
    await page.keyboard.press('Escape');await expect(page.locator(dialog)).toBeHidden();
    await openTools(page);await closeTools(page);await page.keyboard.press('KeyE');await expect(page.locator(dialog)).toBeVisible();
  }
  expect((await snapshot(page)).starts).toBe(initial.starts);expect((await snapshot(page)).displayObjects).toBe(initial.displayObjects);
  await expect(page.locator('[data-window-skin]')).toHaveCount(6);await expect(page.locator('canvas')).toHaveCount(1);
  await page.keyboard.press('Enter');await expect.poll(async()=>(await snapshot(page)).messagePage).toBe(2);
});

for(const fault of ['missing','invalid','timeout'] as const) {
 test(`frames ${fault} falls back without blocking dialogue, focus, or map travel`, async ({page}) => {
   await page.route(MANIFEST,async route=>{
     if(fault==='missing')await route.abort();
     else if(fault==='invalid')await route.fulfill({json:{schemaVersion:2}});
     else {await new Promise(r=>setTimeout(r,5500));try{await route.fallback();}catch{/* page may be closing */}}
   });
   await openRoom(page);await talk(page);await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','fallback');
   expect(await frameSource(page,dialog)).toBe('none');
   await expect(page.locator('#dialog-text')).not.toBeEmpty();await page.keyboard.press('Escape');
   await expect(page.locator(dialog)).toBeHidden();await expect(page.locator('#stage')).toBeFocused();
   await openTools(page,'debug');await expect(page.locator('#skin-status')).toContainText('unavailable');await closeTools(page);
   await page.keyboard.down('ArrowUp');
   try { await expect.poll(async()=>(await snapshot(page)).moving,{intervals:[10]}).toBe(true); }
   finally { await page.keyboard.up('ArrowUp'); }
   await expect.poll(async()=>(await snapshot(page)).moving).toBe(false);
   expect((await snapshot(page)).actorTile).toEqual({x:10,y:6});
   await page.keyboard.down('ArrowRight');
   try { await expect.poll(async()=>(await snapshot(page)).mapId).toBe('demo:map.gallery'); }
   finally { await page.keyboard.up('ArrowRight'); }
   await expect(page.locator('#error')).toBeHidden();
 });
}

test('forced colours replace the frames with system borders', async ({page}) => {
  await page.emulateMedia({forcedColors:'active'});
  await openRoom(page);await talk(page);await expect(page.locator(dialog)).toHaveAttribute('data-skin-state','ready');
  expect(await frameSource(page,dialog)).toBe('none');
  expect(await page.locator('#dialog-title').evaluate(e=>getComputedStyle(e).borderImageSource)).toBe('none');
  await expect(page.locator('#dialog-text')).not.toBeEmpty();
});

test('Settings remains usable on a narrow screen with a visible focus cue', async ({page},info) => {
 await page.setViewportSize({width:390,height:844});await openRoom(page);await openTools(page);
 await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-state','ready');
 const closeBox=await page.locator('#tools-close').boundingBox();
 expect(closeBox!.width).toBeGreaterThanOrEqual(44); // Shared touch-target token at compact width.
 await page.keyboard.press('Tab');
 const outline=await page.evaluate(()=>document.activeElement?getComputedStyle(document.activeElement).outlineStyle:'none');
 expect(outline).toBe('dashed');
 await page.screenshot({path:info.outputPath('w2-settings-narrow.png')});
 await page.locator('#controller-settings summary').click();await page.locator('#controller-return').click();
 await expect(page.locator('#tools-panel')).toBeHidden();await expect(page.locator('#stage')).toBeFocused();
});

test('application disposal clears decoration and cancels future invalidations', async ({page}) => {
  await openRoom(page); await openTools(page);
  await expect(page.locator('#tools-panel')).toHaveAttribute('data-skin-state','ready');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
  await page.setViewportSize({width:901,height:707});
  await page.evaluate(()=>{ document.getElementById('tools-panel')!.hidden=false; document.getElementById('tools-title')!.textContent='Disposed'; });
  await page.waitForTimeout(200);
  expect(await paintings(page)).toEqual(['0','0','0','0','0','0']);
  expect(await page.locator('[data-window-skin]').evaluateAll(es=>es.every(e=>!(e as HTMLElement).style.backgroundImage))).toBe(true);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--pf-page-src'))).toBe('');
  expect(await page.evaluate(()=>window.__RPGAMEWORKS__)).toBeUndefined();
});
