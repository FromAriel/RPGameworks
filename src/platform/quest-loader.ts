import { readQuests } from '../content/validation.mjs';
import type { QuestDefinition } from '../domain/session';
import type { LoadedMap } from './map-loader';
import { fetchContent } from './map-loader';

export async function loadQuestCatalog(base:URL,content:LoadedMap,signal:AbortSignal):Promise<readonly QuestDefinition[]>{
  const value=content.game.questsFile?await fetchContent(new URL(`generated/content/${content.game.questsFile}`,base),signal):{schemaVersion:1,quests:[]};
  return readQuests(value).quests as readonly QuestDefinition[];
}
