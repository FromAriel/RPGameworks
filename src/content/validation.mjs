import validateMap from './generated/map-validator.mjs';
import validateGame from './generated/game-validator.mjs';
import validateItems from './generated/items-validator.mjs';
import validateFacts from './generated/facts-validator.mjs';
import { createCollision } from '../domain/map.mjs';

/** @typedef {import('./generated/map.js').MapDefinition} MapDefinition */
/** @typedef {import('./generated/game.js').GameManifest} GameManifest */
/** @typedef {import('./generated/items.js').ItemCatalog} ItemCatalog */
/** @typedef {import('./generated/facts.js').FactCatalog} FactCatalog */
/** @typedef {{file: string, id: string, path: string, message: string, value: unknown}} ContentIssue */
const MAX_ISSUES = 20;

export class ContentError extends Error {
  /** @param {readonly ContentIssue[]} issues */
  constructor(issues) {
    super(issues.map((issue) => `${issue.file} [${issue.id}] ${issue.path || '/'}: ${issue.message} (value: ${JSON.stringify(issue.value)?.slice(0, 100) ?? 'missing'})`).join('\n'));
    this.name = 'ContentError';
    this.issues = issues;
  }
}

/** Clone/freeze authored definitions; never freeze or retain a caller's mutable object.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function freezeCopy(value) {
  const copy = structuredClone(value);
  /** @param {unknown} item */
  function freeze(item) {
    if (item !== null && typeof item === 'object') {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(copy);
  return copy;
}

/** @param {unknown} value @param {string} path @returns {unknown} */
function atPath(value, path) {
  for (const part of path.split('/').slice(1)) {
    if (value === null || typeof value !== 'object') return undefined;
    value = /** @type {Record<string, unknown>} */ (value)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return value;
}

/** @param {unknown} value @param {string} file
 * @param {readonly {instancePath: string, message?: string, params: Record<string, unknown>}[] | null | undefined} errors
 * @returns {never}
 */
function schemaFailure(value, file, errors) {
  const id = value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : 'unknown';
  throw new ContentError((errors ?? []).slice(0, MAX_ISSUES).map((error) => {
    const property = error.params['additionalProperty'] ?? error.params['missingProperty'];
    const path = `${error.instancePath}${typeof property === 'string' ? '/' + property : ''}`;
    return { file, id, path, message: error.message ?? 'Schema mismatch', value: atPath(value, path) };
  }));
}

/** @param {unknown} value @param {string} file @returns {GameManifest} */
export function readGame(value, file = 'game.json') {
  if (!validateGame(value)) schemaFailure(value, file, validateGame.errors);
  const data = /** @type {GameManifest} */ (value);
  /** @type {ContentIssue[]} */ const issues = [];
  const ids = new Set();
  const files = new Set();
  data.maps.forEach((entry, index) => {
    if (ids.has(entry.id)) issues.push({file, id: data.id, path: `/maps/${index}/id`, message: 'Duplicate map ID', value: entry.id});
    if (files.has(entry.file)) issues.push({file, id: data.id, path: `/maps/${index}/file`, message: 'Duplicate map file', value: entry.file});
    ids.add(entry.id); files.add(entry.file);
  });
  if (!ids.has(data.start.mapId)) issues.push({file, id: data.id, path: '/start/mapId', message: 'Start map is not registered', value: data.start.mapId});
  if (issues.length) throw new ContentError(issues.slice(0, MAX_ISSUES));
  return freezeCopy(data);
}

/** @param {unknown} value @param {string} file @returns {ItemCatalog} */
export function readItems(value, file = 'items.json') {
  if (!validateItems(value)) schemaFailure(value, file, validateItems.errors);
  const data = /** @type {ItemCatalog} */ (value);
  /** @type {ContentIssue[]} */ const issues = [];
  const ids = new Set();
  data.items.forEach((item, index) => {
    if (ids.has(item.id)) issues.push({file, id:item.id, path:`/items/${index}/id`, message:'Duplicate item ID', value:item.id});
    ids.add(item.id);
    for (const key of [item.nameKey, item.descriptionKey]) {
      if (!Object.hasOwn(data.strings.en, key)) issues.push({file, id:item.id, path:`/items/${index}`, message:'Missing item string', value:key});
    }
  });
  for (const [key, text] of Object.entries(data.strings.en)) {
    if (!text.trim()) issues.push({file, id:'catalog', path:`/strings/en/${key}`, message:'String must contain visible text', value:text});
  }
  if (issues.length) throw new ContentError(issues.slice(0, MAX_ISSUES));
  return freezeCopy(data);
}

/** @param {unknown} value @param {string} file @returns {FactCatalog} */
export function readFacts(value, file = 'facts.json') {
  if (!validateFacts(value)) schemaFailure(value, file, validateFacts.errors);
  const data = /** @type {FactCatalog} */ (value);
  const seen = new Set();
  /** @type {ContentIssue[]} */ const issues=[];
  data.facts.forEach((fact,index)=>{if(seen.has(fact.id))issues.push({file,id:fact.id,path:`/facts/${index}/id`,message:'Duplicate fact ID',value:fact.id});seen.add(fact.id);});
  if(issues.length)throw new ContentError(issues.slice(0,MAX_ISSUES));
  return freezeCopy(data);
}

/** @param {any} value @param {string=} file */
export function readQuests(value,file='quests.json'){
  /** @param {string} path @param {string} message @param {unknown} actual */
  const bad=(path,message,actual)=>{throw new ContentError([{file,id:'quest-catalog',path,message,value:actual}]);};
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='quests,schemaVersion'||value.schemaVersion!==1||!Array.isArray(value.quests)||value.quests.length>64)bad('/','Invalid quest catalog',value);
  const seen=new Set();
  for(const[index,quest]of value.quests.entries()){
    if(!quest||typeof quest!=='object'||Array.isArray(quest)||Object.keys(quest).sort().join(',')!=='completedText,id,objective,title'||
      !/^[a-z][a-z0-9-]{0,31}:quest\.[a-z][a-z0-9.-]{0,95}$/.test(quest.id)||seen.has(quest.id)||
      [quest.title,quest.objective,quest.completedText].some(text=>typeof text!=='string'||!text.trim()||text.length>500))bad(`/quests/${index}`,'Invalid or duplicate quest',quest);
    seen.add(quest.id);
  }
  return freezeCopy(value);
}

/** @param {MapDefinition} map @param {ItemCatalog} catalog @param {string} file */
export function validateMapItems(map, catalog, file = 'map.json') {
  const items = new Map(catalog.items.map(item => [item.id, item]));
  /** @type {ContentIssue[]} */ const issues = [];
  /** @param {any} condition @param {string} path */
  function conditionItems(condition,path){
    if(condition.type==='all'||condition.type==='any')for(let index=0;index<condition.conditions.length;index+=1)conditionItems(condition.conditions[index],`${path}/conditions/${index}`);
    else if(condition.type==='not')conditionItems(condition.condition,`${path}/condition`);
    else if(condition.type==='itemAtLeast'&&!items.has(condition.itemId))issues.push({file,id:map.id,path:`${path}/itemId`,message:'Unknown condition item',value:condition.itemId});
  }
  map.objects.forEach((object, index) => {
    if (object.chest) {
      const item = items.get(object.chest.itemId);
      if (!item) issues.push({file, id:map.id, path:`/objects/${index}/chest/itemId`, message:'Unknown chest item', value:object.chest.itemId});
      else if (object.chest.quantity > item.maxStack) issues.push({file, id:map.id, path:`/objects/${index}/chest/quantity`, message:'Chest quantity exceeds item stack limit', value:object.chest.quantity});
    }
    object.states?.forEach((state,stateIndex)=>{
      if(state.when)conditionItems(state.when,`/objects/${index}/states/${stateIndex}/when`);
      if(state.interaction?.prerequisites)conditionItems(state.interaction.prerequisites,`/objects/${index}/states/${stateIndex}/interaction/prerequisites`);
      state.interaction?.actions?.forEach((action,actionIndex)=>{
        if(action.type==='changeItem'&&!items.has(action.itemId))issues.push({file,id:map.id,path:`/objects/${index}/states/${stateIndex}/interaction/actions/${actionIndex}/itemId`,message:'Unknown action item',value:action.itemId});
      });
    });
  });
  map.exits.forEach((exit,index)=>{
    if(exit.prerequisites)conditionItems(exit.prerequisites,`/exits/${index}/prerequisites`);
  });
  if (issues.length) throw new ContentError(issues.slice(0, MAX_ISSUES));
}

/** @param {MapDefinition} map @param {FactCatalog} catalog @param {string} file */
export function validateMapFacts(map,catalog,file='map.json'){
  const facts=new Set(catalog.facts.map(fact=>fact.id));
  /** @type {ContentIssue[]} */const issues=[];
  /** @param {any} condition @param {string} path @param {number} depth @param {{count:number}} total @param {string} selfId */
  function condition(condition,path,depth,total,selfId){
    total.count+=1;if(total.count>64){issues.push({file,id:map.id,path,message:'Condition exceeds 64 nodes',value:total.count});return;}
    if(depth>8){issues.push({file,id:map.id,path,message:'Condition exceeds depth 8',value:depth});return;}
    if(condition.type==='all'||condition.type==='any'){for(let index=0;index<condition.conditions.length;index+=1)conditionFn(condition.conditions[index],`${path}/conditions/${index}`,depth+1,total,selfId);}
    else if(condition.type==='not')conditionFn(condition.condition,`${path}/condition`,depth+1,total,selfId);
    else if(condition.type==='factEquals'&&!facts.has(condition.factId))issues.push({file,id:map.id,path:`${path}/factId`,message:'Unknown condition fact',value:condition.factId});
    else if(condition.type==='placementOpened'&&condition.placementId==='self'&&!selfId)issues.push({file,id:map.id,path:`${path}/placementId`,message:'Exit condition cannot use self',value:condition.placementId});
    else if(condition.type==='placementOpened'&&condition.placementId!=='self'&&!/^[a-z][a-z0-9-]{0,31}:object\.[a-z][a-z0-9.-]{0,95}$/.test(condition.placementId))issues.push({file,id:selfId,path:`${path}/placementId`,message:'Invalid condition placement',value:condition.placementId});
  }
  const conditionFn=condition;
  map.objects.forEach((object,index)=>{
    const states=object.states;if(!states)return;
    const seen=new Set();let fallbacks=0;
    states.forEach((state,stateIndex)=>{
      const path=`/objects/${index}/states/${stateIndex}`;
      if(seen.has(state.id))issues.push({file,id:object.id,path:`${path}/id`,message:'Duplicate object state ID',value:state.id});seen.add(state.id);
      if(state.fallback){fallbacks+=1;if(stateIndex!==states.length-1)issues.push({file,id:object.id,path,message:'Fallback state must be last',value:state.id});}
      if(state.when)conditionFn(state.when,`${path}/when`,1,{count:0},object.id);
      if(state.interaction?.prerequisites)conditionFn(state.interaction.prerequisites,`${path}/interaction/prerequisites`,1,{count:0},object.id);
      state.interaction?.actions?.forEach((action,actionIndex)=>{if(action.type==='setFact'&&!facts.has(action.factId))issues.push({file,id:object.id,path:`${path}/interaction/actions/${actionIndex}/factId`,message:'Unknown action fact',value:action.factId});});
    });
    if(fallbacks!==1)issues.push({file,id:object.id,path:`/objects/${index}/states`,message:'Exactly one fallback state is required',value:fallbacks});
  });
  map.exits.forEach((exit,index)=>{
    if(exit.prerequisites)conditionFn(exit.prerequisites,`/exits/${index}/prerequisites`,1,{count:0},'');
  });
  if(issues.length)throw new ContentError(issues.slice(0,MAX_ISSUES));
}

/** @param {MapDefinition} map @param {readonly {id:string}[]} quests @param {ItemCatalog} items @param {FactCatalog} facts @param {string=} file */
export function validateMapDialogues(map,quests,items,facts,file='map.json'){
  const questIds=new Set(quests.map(quest=>quest.id)),itemIds=new Set(items.items.map(item=>item.id)),factIds=new Set(facts.facts.map(fact=>fact.id));
  /** @type {ContentIssue[]} */const issues=[];
  /** @param {any} node @param {string} path */
  function condition(node,path,depth=1,total={count:0}){total.count+=1;if(depth>8||total.count>64){issues.push({file,id:map.id,path,message:'Condition exceeds depth or node limit',value:depth});return;}
    if(node.type==='all'||node.type==='any')node.conditions.forEach(/** @param {any} child @param {number} index */(child,index)=>condition(child,`${path}/conditions/${index}`,depth+1,total));
    else if(node.type==='not')condition(node.condition,`${path}/condition`,depth+1,total);
    else if(node.type==='questStateEquals'&&!questIds.has(node.questId))issues.push({file,id:map.id,path,message:'Unknown quest',value:node.questId});
    else if(node.type==='itemAtLeast'&&!itemIds.has(node.itemId))issues.push({file,id:map.id,path,message:'Unknown item',value:node.itemId});
    else if(node.type==='factEquals'&&!factIds.has(node.factId))issues.push({file,id:map.id,path,message:'Unknown fact',value:node.factId});
  }
  /** @param {any} actions @param {string} path */
  function checkActions(actions,path){actions?.forEach(/** @param {any} action @param {number} index */(action,index)=>{const p=`${path}/${index}`;
    if(action.type==='setQuestState'&&!questIds.has(action.questId))issues.push({file,id:map.id,path:p,message:'Unknown quest action',value:action.questId});
    if(action.type==='changeItem'&&!itemIds.has(action.itemId))issues.push({file,id:map.id,path:p,message:'Unknown item action',value:action.itemId});
    if(action.type==='setFact'&&!factIds.has(action.factId))issues.push({file,id:map.id,path:p,message:'Unknown fact action',value:action.factId});
  });}
  map.dialogues?.forEach((dialogue,d)=>{dialogue.entries.forEach((entry,e)=>{if(entry.when)condition(entry.when,`/dialogues/${d}/entries/${e}/when`);});
    dialogue.nodes.forEach((node,n)=>node.choices?.forEach((choice,c)=>{const path=`/dialogues/${d}/nodes/${n}/choices/${c}`;
      if(choice.when)condition(choice.when,`${path}/when`);if(choice.enabledWhen)condition(choice.enabledWhen,`${path}/enabledWhen`);checkActions(choice.actions,`${path}/actions`);
    }));
  });
  map.objects.forEach((object,o)=>object.states?.forEach((state,s)=>{if(state.when)condition(state.when,`/objects/${o}/states/${s}/when`);if(state.interaction?.prerequisites)condition(state.interaction.prerequisites,`/objects/${o}/states/${s}/interaction/prerequisites`);checkActions(state.interaction?.actions,`/objects/${o}/states/${s}/interaction/actions`);}));
  map.exits.forEach((exit,e)=>{if(exit.prerequisites)condition(exit.prerequisites,`/exits/${e}/prerequisites`);});
  if(issues.length)throw new ContentError(issues.slice(0,MAX_ISSUES));
}

/** Structural and local semantic validation; shared by build tools and browser.
 * @param {unknown} value @param {string} file @param {readonly string[]=} frames
 * @returns {MapDefinition}
 */
export function readMap(value, file = 'map.json', frames) {
  if (!validateMap(value)) schemaFailure(value, file, validateMap.errors);
  const map = /** @type {MapDefinition} */ (value);
  /** @type {ContentIssue[]} */ const issues = [];
  /** @param {string} path @param {string} message @param {unknown} value @param {string=} id */
  const issue = (path, message, value, id = map.id) => {
    if (issues.length < MAX_ISSUES) issues.push({file, id, path, message, value});
  };
  /** @param {{id: string}[]} items @param {string} path */
  function unique(items, path) {
    const seen = new Set();
    items.forEach((entry, index) => {
      if (seen.has(entry.id)) issue(`${path}/${index}/id`, 'Duplicate scoped ID', entry.id);
      seen.add(entry.id);
    });
  }
  /** @param {string[]} rows @param {string} path @param {boolean} visual */
  function rows(rows, path, visual) {
    if (rows.length !== map.height) issue(path, `Expected ${map.height} rows`, rows.length);
    rows.forEach((row, y) => {
      if (row.length !== map.width) issue(`${path}/${y}`, `Expected ${map.width} cells`, row.length);
      if (visual) [...row].forEach((symbol, x) => {
        if (symbol !== '.' && !Object.hasOwn(map.legend, symbol)) issue(`${path}/${y}/${x}`, 'Unknown legend symbol', symbol);
      });
    });
  }
  unique(map.layers, '/layers'); unique(map.spawns, '/spawns'); unique(map.objects, '/objects'); unique(map.exits, '/exits');
  map.layers.forEach((layer, index) => rows(layer.rows, `/layers/${index}/rows`, true));
  rows(map.collision, '/collision', false);
  const available = frames ? new Set(frames) : null;
  for (const [symbol, frame] of Object.entries(map.legend)) {
    if (available && !available.has(frame)) issue(`/legend/${symbol}`, 'Atlas frame does not exist', frame);
  }
  const solidCells = new Set();
  map.objects.forEach((object, index) => {
    if (object.x >= map.width || object.y >= map.height) issue(`/objects/${index}`, 'Object outside map bounds', {x: object.x, y: object.y});
    if (available && !available.has(object.frame)) issue(`/objects/${index}/frame`, 'Atlas frame does not exist', object.frame);
    object.states?.forEach((state,stateIndex)=>{
      if(available&&!available.has(state.frame))issue(`/objects/${index}/states/${stateIndex}/frame`,'Atlas frame does not exist',state.frame);
      if(state.interaction?.prerequisites&&!state.interaction.rejectionMessageId)issue(`/objects/${index}/states/${stateIndex}/interaction`,'Access-gated interaction requires rejectionMessageId',state.id);
    });
    const cell = `${object.x},${object.y}`;
    if (object.solid && solidCells.has(cell)) issue(`/objects/${index}`, 'Overlapping solid objects', cell);
    if (object.solid) solidCells.add(cell);
  });
  const grid = createCollision(map);
  map.spawns.forEach((spawn, index) => {
    if (!grid.canEnter(spawn.x, spawn.y)) issue(`/spawns/${index}`, 'Spawn outside map or on a blocked cell', {x: spawn.x, y: spawn.y}, spawn.id);
  });
  if (!map.spawns.some((spawn) => spawn.id === map.defaultSpawn)) issue('/defaultSpawn', 'Default spawn does not exist', map.defaultSpawn);
  const exitCells = new Set();
  map.exits.forEach((exit, index) => {
    if(exit.prerequisites&&!exit.rejectionMessageId)issue(`/exits/${index}`,'Access-gated exit requires rejectionMessageId',exit.id);
    if (exit.x + exit.width > map.width || exit.y + exit.height > map.height) {
      issue(`/exits/${index}`, 'Exit rectangle outside map bounds', exit); return;
    }
    for (let y = exit.y; y < exit.y + exit.height; y += 1) {
      for (let x = exit.x; x < exit.x + exit.width; x += 1) {
        const opening=map.objects.find(object=>object.x===x&&object.y===y&&object.states?.some(state=>state.solid===false));
        if (!grid.canEnter(x, y) && !(map.collision[y]?.[x]==='.'&&exit.prerequisites&&opening)) issue(`/exits/${index}`, 'Exit contains a blocked cell', {x, y});
        const cell = `${x},${y}`;
        if (exitCells.has(cell)) issue(`/exits/${index}`, 'Overlapping exit rectangles', cell);
        exitCells.add(cell);
      }
    }
  });
  const messages = map.messages ?? [];
  unique(messages, '/messages');
  const dialogues=map.dialogues??[];
  unique(dialogues,'/dialogues');
  const strings = map.strings?.en ?? {};
  for (const [key, text] of Object.entries(strings)) {
    if (!text.trim()) issue(`/strings/en/${key}`, 'String must contain visible text', text);
  }
  messages.forEach((message, index) => {
    if (!Object.hasOwn(strings, message.speakerKey)) issue(`/messages/${index}/speakerKey`, 'Missing English string', message.speakerKey, message.id);
    message.pages.forEach((key, page) => {
      if (!Object.hasOwn(strings, key)) issue(`/messages/${index}/pages/${page}`, 'Missing English string', key, message.id);
    });
  });
  dialogues.forEach((dialogue,index)=>{
    const path=`/dialogues/${index}`,nodes=new Set(dialogue.nodes.map(node=>node.id));
    if(nodes.size!==dialogue.nodes.length)issue(`${path}/nodes`,'Duplicate dialogue node ID',dialogue.id);
    if(dialogue.entries.at(-1)?.when||dialogue.entries.slice(0,-1).some(entry=>!entry.when))issue(`${path}/entries`,'Exactly one unconditional entry must be last',dialogue.id);
    dialogue.entries.forEach((entry,entryIndex)=>{if(!nodes.has(entry.nodeId))issue(`${path}/entries/${entryIndex}/nodeId`,'Missing dialogue node',entry.nodeId,dialogue.id);});
    dialogue.nodes.forEach((node,nodeIndex)=>{
      if(!Object.hasOwn(strings,node.speakerKey))issue(`${path}/nodes/${nodeIndex}/speakerKey`,'Missing dialogue string',node.speakerKey,dialogue.id);
      node.pages.forEach((key,page)=>{if(!Object.hasOwn(strings,key))issue(`${path}/nodes/${nodeIndex}/pages/${page}`,'Missing dialogue string',key,dialogue.id);});
      const choiceIds=new Set();
      node.choices?.forEach((choice,choiceIndex)=>{
        const choicePath=`${path}/nodes/${nodeIndex}/choices/${choiceIndex}`;
        if(choiceIds.has(choice.id))issue(`${choicePath}/id`,'Duplicate dialogue choice ID',choice.id);choiceIds.add(choice.id);
        if(!Object.hasOwn(strings,choice.labelKey))issue(`${choicePath}/labelKey`,'Missing dialogue string',choice.labelKey,dialogue.id);
        if(choice.enabledWhen&&!choice.disabledReasonKey)issue(choicePath,'Disabled choice requires a reason',choice.id);
        if(choice.disabledReasonKey&&!Object.hasOwn(strings,choice.disabledReasonKey))issue(`${choicePath}/disabledReasonKey`,'Missing dialogue string',choice.disabledReasonKey,dialogue.id);
        if(choice.nextNodeId&&!nodes.has(choice.nextNodeId))issue(`${choicePath}/nextNodeId`,'Missing dialogue node',choice.nextNodeId,dialogue.id);
      });
    });
    const reached=new Set(dialogue.entries.map(entry=>entry.nodeId));let prior=-1;
    while(prior!==reached.size){prior=reached.size;for(const node of dialogue.nodes)if(reached.has(node.id))for(const choice of node.choices??[])if(choice.nextNodeId)reached.add(choice.nextNodeId);}
    for(const node of dialogue.nodes)if(!reached.has(node.id))issue(`${path}/nodes`,'Unreachable dialogue node',node.id);
  });
  map.exits.forEach((exit,index)=>{
    if(exit.rejectionMessageId&&!messages.some(message=>message.id===exit.rejectionMessageId))issue(`/exits/${index}/rejectionMessageId`,'Message does not exist',exit.rejectionMessageId);
  });
  const interactionCells = new Set();
  map.objects.forEach((object, index) => {
    if (!object.messageId && !object.chest && !object.states) return;
    if ([object.messageId,object.chest,object.states].filter(Boolean).length>1) issue(`/objects/${index}`, 'Choose messageId, chest, or states', object.id);
    if (object.chest) {
      if (!object.solid) issue(`/objects/${index}/solid`, 'A chest must be a solid adjacent interaction', object.solid);
      if (available && !available.has(object.chest.openedFrame)) issue(`/objects/${index}/chest/openedFrame`, 'Atlas frame does not exist', object.chest.openedFrame);
    }
    const stateMessages=object.states?.flatMap(state=>state.interaction?[...(state.interaction.messageId?[state.interaction.messageId]:[]),...(state.interaction.rejectionMessageId?[state.interaction.rejectionMessageId]:[])]:[])??[];
    for (const id of object.chest ? [object.chest.openedMessageId, object.chest.emptyMessageId] : object.states?stateMessages:[object.messageId]) {
      if (!messages.some(message => message.id === id)) issue(`/objects/${index}`, 'Message does not exist', id);
    }
    object.states?.forEach((state,stateIndex)=>{const interaction=state.interaction;if(!interaction)return;
      if(!!interaction.messageId===!!interaction.dialogueId)issue(`/objects/${index}/states/${stateIndex}/interaction`,'Choose exactly one message or dialogue',object.id);
      if(interaction.dialogueId&&(interaction.actions||interaction.prerequisites||interaction.rejectionMessageId))issue(`/objects/${index}/states/${stateIndex}/interaction`,'Dialogue interaction cannot also run message actions or denial',object.id);
      if(interaction.dialogueId&&!dialogues.some(dialogue=>dialogue.id===interaction.dialogueId))issue(`/objects/${index}/states/${stateIndex}/interaction/dialogueId`,'Dialogue does not exist',interaction.dialogueId);
    });
    const cell = `${object.x},${object.y}`;
    if (interactionCells.has(cell)) issue(`/objects/${index}`, 'Ambiguous interaction cell', cell);
    interactionCells.add(cell);
    if (![grid.canEnter(object.x - 1, object.y), grid.canEnter(object.x + 1, object.y),
      grid.canEnter(object.x, object.y - 1), grid.canEnter(object.x, object.y + 1)].some(Boolean)) {
      issue(`/objects/${index}`, 'Interaction has no walkable adjacent tile', cell);
    }
  });
  if (issues.length) throw new ContentError(issues);
  return freezeCopy(map);
}

/** Complete build-time graph checks. Runtime does not fetch all maps to repeat them.
 * @param {GameManifest} game @param {ReadonlyMap<string, MapDefinition>} maps @param {ItemCatalog=} catalog
 */
export function validateWorld(game, maps, catalog) {
  /** @type {ContentIssue[]} */ const issues = [];
  const objectIds = new Set();
  const registered = new Set(game.maps.map((entry) => entry.id));
  /** @param {string} file @param {string} id @param {string} path @param {string} message @param {unknown} value */
  const issue = (file, id, path, message, value) => {
    if (issues.length < MAX_ISSUES) issues.push({file, id, path, message, value});
  };
  for (const entry of game.maps) {
    const map = maps.get(entry.id);
    if (!map || map.id !== entry.id) { issue(entry.file, entry.id, '/id', 'Registered map is missing or has a different ID', map?.id); continue; }
    if (catalog) validateMapItems(map, catalog, entry.file);
    for (const object of map.objects) {
      if (objectIds.has(object.id)) issue(entry.file, map.id, '/objects', 'Duplicate world placement ID', object.id);
      objectIds.add(object.id);
    }
    map.exits.forEach((exit, index) => {
      const target = registered.has(exit.targetMap) ? maps.get(exit.targetMap) : undefined;
      if (!target) issue(entry.file, exit.id, `/exits/${index}/targetMap`, 'Target map does not exist', exit.targetMap);
      else if (!target.spawns.some((spawn) => spawn.id === exit.targetSpawn)) issue(entry.file, exit.id, `/exits/${index}/targetSpawn`, 'Target spawn does not exist', exit.targetSpawn);
    });
  }
  /** @param {any} condition @param {string} file @param {string} mapId @param {string} path @param {string} selfId */
  function placementReferences(condition,file,mapId,path,selfId){
    if(condition.type==='all'||condition.type==='any')for(let index=0;index<condition.conditions.length;index+=1)placementReferences(condition.conditions[index],file,mapId,`${path}/conditions/${index}`,selfId);
    else if(condition.type==='not')placementReferences(condition.condition,file,mapId,`${path}/condition`,selfId);
    else if(condition.type==='placementOpened'&&condition.placementId==='self'&&!selfId)issue(file,mapId,`${path}/placementId`,'Exit condition cannot use self',condition.placementId);
    else if(condition.type==='placementOpened'&&condition.placementId!=='self'&&!objectIds.has(condition.placementId))issue(file,mapId,`${path}/placementId`,'Unknown condition placement',condition.placementId);
  }
  for(const entry of game.maps){const map=maps.get(entry.id);map?.objects.forEach((object,objectIndex)=>object.states?.forEach((state,stateIndex)=>{if(state.when)placementReferences(state.when,entry.file,map.id,`/objects/${objectIndex}/states/${stateIndex}/when`,object.id);if(state.interaction?.prerequisites)placementReferences(state.interaction.prerequisites,entry.file,map.id,`/objects/${objectIndex}/states/${stateIndex}/interaction/prerequisites`,object.id);state.interaction?.actions?.forEach((action,actionIndex)=>{if(action.type==='markPlacementOpened'&&action.placementId!=='self'&&!objectIds.has(action.placementId))issue(entry.file,map.id,`/objects/${objectIndex}/states/${stateIndex}/interaction/actions/${actionIndex}/placementId`,'Unknown action placement',action.placementId);});}));map?.exits.forEach((exit,exitIndex)=>{if(exit.prerequisites)placementReferences(exit.prerequisites,entry.file,map.id,`/exits/${exitIndex}/prerequisites`,'');});}
  for(const entry of game.maps){const map=maps.get(entry.id);map?.dialogues?.forEach((dialogue,d)=>{
    dialogue.entries.forEach((candidate,e)=>{if(candidate.when)placementReferences(candidate.when,entry.file,map.id,`/dialogues/${d}/entries/${e}/when`,'');});
    dialogue.nodes.forEach((node,n)=>node.choices?.forEach((choice,c)=>{const path=`/dialogues/${d}/nodes/${n}/choices/${c}`;
      if(choice.when)placementReferences(choice.when,entry.file,map.id,`${path}/when`,'');
      if(choice.enabledWhen)placementReferences(choice.enabledWhen,entry.file,map.id,`${path}/enabledWhen`,'');
      choice.actions?.forEach((action,a)=>{if(action.type==='markPlacementOpened'&&!objectIds.has(action.placementId))issue(entry.file,map.id,`${path}/actions/${a}/placementId`,'Unknown action placement',action.placementId);});
    }));
  });}
  const start = maps.get(game.start.mapId);
  if (!start?.spawns.some((spawn) => spawn.id === game.start.spawnId)) issue('game.json', game.id, '/start/spawnId', 'Start spawn does not exist', game.start.spawnId);
  if (maps.size !== game.maps.length) issue('game.json', game.id, '/maps', 'Registered and supplied map counts differ', maps.size);
  if (issues.length) throw new ContentError(issues);
}
