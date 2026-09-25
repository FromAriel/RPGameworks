/** Static authoring inventory. Inputs have already passed the content validator. */

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const pointer = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Follow authored graph edges only; conditions and gameplay solvability are out of scope. */
function reachable(start, edges) {
  const seen = new Set();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of edges.get(id) ?? []) if (!seen.has(next)) pending.push(next);
  }
  return seen;
}

/** @param {import('../src/content/generated/game.js').GameManifest} game
 * @param {ReadonlyMap<string, import('../src/content/generated/map.js').MapDefinition>} maps
 * @param {import('../src/content/generated/items.js').ItemCatalog} items
 * @param {import('../src/content/generated/facts.js').FactCatalog} facts
 * @param {{quests: readonly {id:string}[]}} quests
 */
export function createAuthoringReport(game, maps, items, facts, quests) {
  const definitions = new Map();
  const key = (kind, file, id) => `${kind}\u0000${file}\u0000${id}`;
  const define = (kind, id, file, path) => {
    definitions.set(key(kind, file, id), {kind, id, file, path, referencedBy: []});
  };
  const reference = (kind, id, targetFile, file, ownerId, path) => {
    const target = definitions.get(key(kind, targetFile, id));
    if (target) target.referencedBy.push({file, id: ownerId, path});
  };
  const itemFile = game.itemsFile ?? 'items.json';
  const factFile = game.factsFile ?? 'facts.json';
  const questFile = game.questsFile ?? 'quests.json';
  const objectFiles = new Map();
  for (const [index, entry] of game.maps.entries()) {
    const map = maps.get(entry.id);
    define('map', entry.id, 'game.json', `/maps/${index}/id`);
    if (!map) continue;
    map.messages?.forEach((message, i) => define('message', message.id, entry.file, `/messages/${i}/id`));
    map.dialogues?.forEach((dialogue, i) => define('dialogue', dialogue.id, entry.file, `/dialogues/${i}/id`));
    map.objects.forEach((object, i) => { define('object', object.id, entry.file, `/objects/${i}/id`); objectFiles.set(object.id, entry.file); });
    for (const stringKey of Object.keys(map.strings?.en ?? {})) define('string', stringKey, entry.file, `/strings/en/${pointer(stringKey)}`);
  }
  items.items.forEach((item, i) => define('item', item.id, itemFile, `/items/${i}/id`));
  for (const stringKey of Object.keys(items.strings.en)) define('string', stringKey, itemFile, `/strings/en/${pointer(stringKey)}`);
  facts.facts.forEach((fact, i) => define('fact', fact.id, factFile, `/facts/${i}/id`));
  quests.quests.forEach((quest, i) => define('quest', quest.id, questFile, `/quests/${i}/id`));

  const condition = (node, file, ownerId, path, selfId) => {
    if (!node) return;
    if (node.type === 'all' || node.type === 'any') node.conditions.forEach((child, i) => condition(child, file, ownerId, `${path}/conditions/${i}`, selfId));
    else if (node.type === 'not') condition(node.condition, file, ownerId, `${path}/condition`, selfId);
    else if (node.type === 'itemAtLeast') reference('item', node.itemId, itemFile, file, ownerId, `${path}/itemId`);
    else if (node.type === 'factEquals') reference('fact', node.factId, factFile, file, ownerId, `${path}/factId`);
    else if (node.type === 'questStateEquals') reference('quest', node.questId, questFile, file, ownerId, `${path}/questId`);
    else if (node.type === 'placementOpened') {
      const id = node.placementId === 'self' ? selfId : node.placementId;
      if (id) reference('object', id, objectFiles.get(id), file, ownerId, `${path}/placementId`);
    }
  };
  const actions = (list, file, ownerId, path, selfId) => list?.forEach((action, i) => {
    const at = `${path}/${i}`;
    if (action.type === 'changeItem') reference('item', action.itemId, itemFile, file, ownerId, `${at}/itemId`);
    else if (action.type === 'setFact') reference('fact', action.factId, factFile, file, ownerId, `${at}/factId`);
    else if (action.type === 'setQuestState') reference('quest', action.questId, questFile, file, ownerId, `${at}/questId`);
    else if (action.type === 'markPlacementOpened') {
      const id = action.placementId === 'self' ? selfId : action.placementId;
      if (id) reference('object', id, objectFiles.get(id), file, ownerId, `${at}/placementId`);
    }
  });
  const local = (kind, id, file, ownerId, path) => { if (id) reference(kind, id, file, file, ownerId, path); };
  reference('map', game.start.mapId, 'game.json', 'game.json', game.id, '/start/mapId');
  items.items.forEach((item, i) => {
    reference('string', item.nameKey, itemFile, itemFile, item.id, `/items/${i}/nameKey`);
    reference('string', item.descriptionKey, itemFile, itemFile, item.id, `/items/${i}/descriptionKey`);
  });
  const edges = new Map([...maps.keys()].map(id => [id, new Set()]));
  const reverse = new Map([...maps.keys()].map(id => [id, new Set()]));
  for (const entry of game.maps) {
    const map = maps.get(entry.id);
    if (!map) continue;
    const file = entry.file;
    map.messages?.forEach((message, i) => {
      local('string', message.speakerKey, file, message.id, `/messages/${i}/speakerKey`);
      message.pages.forEach((page, p) => local('string', page, file, message.id, `/messages/${i}/pages/${p}`));
    });
    map.dialogues?.forEach((dialogue, i) => {
      dialogue.entries.forEach((entry, e) => condition(entry.when, file, dialogue.id, `/dialogues/${i}/entries/${e}/when`));
      dialogue.nodes.forEach((node, n) => {
        const at = `/dialogues/${i}/nodes/${n}`;
        local('string', node.speakerKey, file, dialogue.id, `${at}/speakerKey`);
        node.pages.forEach((page, p) => local('string', page, file, dialogue.id, `${at}/pages/${p}`));
        node.choices?.forEach((choice, c) => {
          const choiceAt = `${at}/choices/${c}`;
          local('string', choice.labelKey, file, dialogue.id, `${choiceAt}/labelKey`);
          local('string', choice.disabledReasonKey, file, dialogue.id, `${choiceAt}/disabledReasonKey`);
          condition(choice.when, file, dialogue.id, `${choiceAt}/when`);
          condition(choice.enabledWhen, file, dialogue.id, `${choiceAt}/enabledWhen`);
          actions(choice.actions, file, dialogue.id, `${choiceAt}/actions`);
        });
      });
    });
    map.objects.forEach((object, i) => {
      const at = `/objects/${i}`;
      local('message', object.messageId, file, object.id, `${at}/messageId`);
      if (object.chest) {
        reference('item', object.chest.itemId, itemFile, file, object.id, `${at}/chest/itemId`);
        local('message', object.chest.openedMessageId, file, object.id, `${at}/chest/openedMessageId`);
        local('message', object.chest.emptyMessageId, file, object.id, `${at}/chest/emptyMessageId`);
      }
      object.states?.forEach((state, s) => {
        const stateAt = `${at}/states/${s}`;
        condition(state.when, file, object.id, `${stateAt}/when`, object.id);
        const interaction = state.interaction;
        if (!interaction) return;
        local('message', interaction.messageId, file, object.id, `${stateAt}/interaction/messageId`);
        local('message', interaction.rejectionMessageId, file, object.id, `${stateAt}/interaction/rejectionMessageId`);
        local('dialogue', interaction.dialogueId, file, object.id, `${stateAt}/interaction/dialogueId`);
        condition(interaction.prerequisites, file, object.id, `${stateAt}/interaction/prerequisites`, object.id);
        actions(interaction.actions, file, object.id, `${stateAt}/interaction/actions`, object.id);
      });
    });
    map.exits.forEach((exit, i) => {
      const at = `/exits/${i}`;
      reference('map', exit.targetMap, 'game.json', file, exit.id, `${at}/targetMap`);
      local('message', exit.rejectionMessageId, file, exit.id, `${at}/rejectionMessageId`);
      condition(exit.prerequisites, file, exit.id, `${at}/prerequisites`);
      edges.get(map.id).add(exit.targetMap);
      reverse.get(exit.targetMap).add(map.id);
    });
  }
  const forwardReach = reachable(game.start.mapId, edges);
  const returnReach = reachable(game.start.mapId, reverse);
  const sorted = [...definitions.values()].sort((a, b) => compare(a.file, b.file) || compare(a.path, b.path) || compare(a.kind, b.kind) || compare(a.id, b.id));
  const warnings = [];
  for (const definition of sorted) {
    definition.referencedBy.sort((a, b) => compare(a.file, b.file) || compare(a.path, b.path) || compare(a.id, b.id));
    if (['message', 'dialogue', 'string', 'item', 'fact', 'quest'].includes(definition.kind) && definition.referencedBy.length === 0) {
      warnings.push({severity: 'warning', code: 'orphan-definition', file: definition.file, id: definition.id, path: definition.path, message: `Unreferenced ${definition.kind} definition`});
    }
  }
  for (const entry of game.maps) {
    const map = maps.get(entry.id);
    if (!map) continue;
    if (!forwardReach.has(entry.id)) warnings.push({severity: 'warning', code: 'unreachable-map', file: entry.file, id: entry.id, path: '/id', message: 'No structural exit path from the game start'});
    if (entry.id !== game.start.mapId && !returnReach.has(entry.id)) warnings.push({severity: 'warning', code: 'no-return-path', file: entry.file, id: entry.id, path: '/exits', message: 'No structural exit path back to the game start'});
  }
  warnings.sort((a, b) => compare(a.file, b.file) || compare(a.path, b.path) || compare(a.code, b.code) || compare(a.id, b.id));
  return {schemaVersion: 1, gameId: game.id,
    summary: {maps: maps.size, definitions: sorted.length, references: sorted.reduce((sum, item) => sum + item.referencedBy.length, 0), warnings: warnings.length},
    definitions: sorted, warnings};
}
