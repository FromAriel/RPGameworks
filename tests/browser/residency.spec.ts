import { test, expect, snapshot, openRoom } from './helpers';

const count=12;
const mapId=(index:number)=>`demo:map.residency-${index}`;
const mapFile=(index:number)=>`maps/residency-${index}.json`;
const makeMap=(index:number)=>({schemaVersion:1,id:mapId(index),name:`Residency fixture ${index+1}`,orientation:'orthogonal',tileSize:16,width:3,height:3,
  legend:{a:'floor-a'},layers:[{id:'ground',rows:['aaa','aaa','aaa']}],collision:['...','...','...'],defaultSpawn:'start',spawns:[{id:'start',x:0,y:1,facing:'right'}],
  objects:[{id:`demo:object.residency-${index}`,frame:'plaque',x:1,y:0,solid:true,states:[{id:'changed',when:{type:'factEquals',factId:'demo:fact.residency',value:true},frame:'plaque-read',visible:true},{id:'base',fallback:true,frame:'plaque',visible:true}]}],
  exits:[{id:'next',x:2,y:1,width:1,height:1,targetMap:mapId((index+1)%count),targetSpawn:'start'}],strings:{en:{'fixture.label':'Residency fixture'}},messages:[]});

test('test-only twelve-map residency tour keeps one room, one binding, and shared textures bounded',async({page})=>{
  test.setTimeout(60000);const maps=Array.from({length:count},(_,index)=>({id:mapId(index),file:mapFile(index)}));
  await page.route('**/generated/content/game.json',route=>route.fulfill({json:{schemaVersion:1,id:'demo:game.foundation',tileSize:16,saveCompatibilityVersion:1,start:{mapId:mapId(0),spawnId:'start'},maps,factsFile:'facts.aaaaaaaaaaaa.json',stateIndexFile:'state-index.aaaaaaaaaaaa.json'}}));
  await page.route('**/generated/content/facts.aaaaaaaaaaaa.json',route=>route.fulfill({json:{schemaVersion:1,facts:[{id:'demo:fact.residency',type:'boolean',default:false,scope:'global',persistence:'saved'}]}}));
  await page.route('**/generated/content/state-index.aaaaaaaaaaaa.json',route=>route.fulfill({json:{schemaVersion:1,gameId:'demo:game.foundation',saveCompatibilityVersion:1,maps:maps.map((_,index)=>({id:mapId(index),name:`Residency fixture ${index+1}`,width:3,height:3,spawns:['start']})),itemIds:[],factIds:['demo:fact.residency'],placementIds:maps.map((_,index)=>`demo:object.residency-${index}`)}}));
  for(let index=0;index<count;index++)await page.route(`**/generated/content/${mapFile(index)}`,route=>route.fulfill({json:makeMap(index)}));
  await openRoom(page,`?map=${mapId(0)}`);const baseline=await snapshot(page);expect(baseline.sessionSubscribers).toBe(1);expect(baseline.activeObjectBindings).toBe(1);
  for(let transition=1;transition<=count;transition++){await page.keyboard.down('ArrowRight');try{await expect.poll(async()=>(await snapshot(page)).transitions,{timeout:15000}).toBe(transition);}finally{await page.keyboard.up('ArrowRight');}await expect.poll(async()=>(await snapshot(page)).inputMode).toBe('exploration');}
  const final=await snapshot(page);expect(final.mapId).toBe(mapId(0));expect(final.activeScenes).toBe(1);expect(final.loadedMaps).toBe(1);expect(final.sessionSubscribers).toBe(1);expect(final.activeObjectBindings).toBe(1);expect(final.textureCount).toBe(baseline.textureCount);expect(final.displayObjects).toBe(baseline.displayObjects);expect(final.pendingSaveOperations).toBe(0);
});
