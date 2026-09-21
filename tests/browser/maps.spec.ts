import { openTools } from './helpers';
import { readFileSync } from 'node:fs';
import { test, expect, snapshot, openRoom } from './helpers';
const original = (): any => JSON.parse(readFileSync('content/games/demo/maps/workshop.json','utf8'));
const registry = (): any => JSON.parse(readFileSync('content/games/demo/game.json','utf8'));

 test('starting workshop only fetches its own map payload',async({page})=>{
  const requested:string[]=[];page.on('request',r=>requested.push(r.url()));
  await openRoom(page);
  const state=await snapshot(page);expect(state.mapId).toBe('demo:map.workshop');expect(state.loadedMaps).toBe(1);
  expect(state.collisionCells).toBe(240);expect(state.exits).toBe(1);
  expect(requested.filter(url=>url.includes('/content/maps/'))).toHaveLength(1);
  expect(requested.some(url=>url.includes('/gallery.'))).toBe(false);
});

 test('larger gallery uses the same renderer, named spawn and authored collision',async({page},info)=>{
  await openRoom(page,'?map=demo:map.gallery');
  let state=await snapshot(page);
  expect(state.mapWidth).toBe(24);expect(state.mapHeight).toBe(14);expect(state.collisionCells).toBe(336);
  expect(state.displayObjects).toBe(343);expect(state.activeScenes).toBe(1);expect(state.loadedMaps).toBe(1);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async()=>(await snapshot(page)).actorTile.x).toBe(5);
  await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');
  state=await snapshot(page);expect(state.actorTile).toEqual({x:5,y:6});expect(state.moving).toBe(false);
  expect(Number.isInteger(state.camera.x)).toBe(true);expect(Number.isInteger(state.camera.y)).toBe(true);
  await page.screenshot({path:info.outputPath('gallery-desktop.png'),fullPage:true});
  await openRoom(page,'?map=demo:map.gallery&spawn=from-workshop');
  expect((await snapshot(page)).actorTile).toEqual({x:2,y:6});expect((await snapshot(page)).facing).toBe('right');
});

 test('preview selector reloads into a selected map and restart retains it',async({page})=>{
  await openRoom(page);
  await openTools(page, 'debug');
  // Navigation replaces the execution context. Wait for the new document before polling it.
  await Promise.all([
    page.waitForURL(url => url.searchParams.get('map') === 'demo:map.gallery', { waitUntil: 'load' }),
    page.locator('#map-preview').selectOption('demo:map.gallery'),
  ]);
  await expect.poll(()=>page.evaluate(()=>window.__RPGAMEWORKS__?.snapshot().mapId)).toBe('demo:map.gallery');
  await expect.poll(async()=>(await snapshot(page)).phase).toBe('ready');
  const initial=await snapshot(page);
  for(let i=1;i<=6;i++){
    await openTools(page, 'debug'); await page.locator('#restart').click();
    await expect.poll(async()=>(await snapshot(page)).starts).toBe(initial.starts+i);
    const state=await snapshot(page);expect(state.displayObjects).toBe(initial.displayObjects);expect(state.textureCount).toBe(initial.textureCount);expect(state.stops).toBe(i);
  }
});

 test('an added content-only map needs no scene subclass',async({page})=>{
  const game=registry();delete game.itemsFile;delete game.factsFile;game.stateIndexFile='state-index.aaaaaaaaaaaa.json';game.maps.push({id:'demo:map.fixture',file:'maps/fixture.json'});
  const map=original();Object.assign(map,{id:'demo:map.fixture',name:'Content-only fixture',width:2,height:2,layers:[{id:'floor',rows:['aa','aa']}],collision:['..','..'],spawns:[{id:'start',x:0,y:0,facing:'up'}],objects:[],exits:[]});
  await page.route('**/generated/content/game.json',route=>route.fulfill({json:game}));
  await page.route('**/generated/content/state-index.aaaaaaaaaaaa.json',route=>route.fulfill({json:{schemaVersion:1,gameId:game.id,saveCompatibilityVersion:1,maps:[{id:'demo:map.fixture',name:'Content-only fixture',width:2,height:2,spawns:['start']}],itemIds:[],factIds:[],placementIds:[]}}));
  await page.route('**/generated/content/maps/fixture.json',route=>route.fulfill({json:map}));
  await openRoom(page,'?map=demo:map.fixture');
  const state=await snapshot(page);expect(state.mapName).toBe('Content-only fixture');expect(state.displayObjects).toBe(6);expect(state.actorTile).toEqual({x:0,y:0});
});

for(const mode of ['malformed','blocked-spawn','wrong-id','missing-frame'] as const){
  test(`bad map ${mode} never reaches a ready state`,async({page})=>{
    const data=original();
    if(mode==='blocked-spawn')data.spawns[0].x=0;
    if(mode==='wrong-id')data.id='demo:map.wrong';
    if(mode==='missing-frame')data.legend.a='nonexistent';
    await page.route('**/generated/content/maps/workshop.*.json',route=>route.fulfill(mode==='malformed'?{body:'broken JSON'}:{json:data}));
    await page.goto('./');await expect(page.locator('#error')).toBeVisible();
    expect(await page.evaluate(()=>window.__RPGAMEWORKS__?.snapshot().phase)).not.toBe('ready');
    await expect(page.locator('#restart')).toBeDisabled();
  });
}

 test('unregistered map and invalid spawn show actionable errors',async({page})=>{
  await page.goto('./?map=demo:map.absent');await expect(page.locator('#error')).toContainText('Unknown map ID');
  await page.goto('./?spawn=absent');await expect(page.locator('#error')).toContainText('unknown spawn ID');
});

 test('missing content manifest is a visible load failure',async({page})=>{
  await page.route('**/generated/content/game.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('./');await expect(page.locator('#error')).toContainText('HTTP 404');
  await expect(page.locator('canvas')).toHaveCount(0);
});
