import type { MapDefinition } from '../content/generated/map';
import type { Condition, DependencyKey, SessionAction, SessionState } from './session';
import { conditionDependencies } from './session';

export type Placement=MapDefinition['objects'][number];
export interface ResolvedInteraction{readonly messageId?:string;readonly dialogueId?:string;readonly rejectionMessageId?:string;readonly prerequisites?:Condition;readonly actions:readonly SessionAction[]}
export interface ResolvedObjectState{readonly objectId:string;readonly stateId:string;readonly frame:string;readonly visible:boolean;readonly solid:boolean;readonly interaction?:ResolvedInteraction}

function authoredStates(object:Placement):readonly NonNullable<Placement['states']>[number][]{
  if(object.states)return object.states;
  if(object.chest)return [
    {id:'opened',when:{type:'placementOpened',placementId:'self',value:true},frame:object.chest.openedFrame,visible:true,interaction:{messageId:object.chest.emptyMessageId}},
    {id:'closed',fallback:true,frame:object.frame,visible:true,interaction:{messageId:object.chest.openedMessageId,rejectionMessageId:object.chest.emptyMessageId,actions:[{type:'changeItem',itemId:object.chest.itemId,delta:object.chest.quantity},{type:'markPlacementOpened',placementId:'self'}]}},
  ] as readonly NonNullable<Placement['states']>[number][];
  return [{id:'default',fallback:true,frame:object.frame,visible:true,...(object.messageId?{interaction:{messageId:object.messageId}}:{})}] as readonly NonNullable<Placement['states']>[number][];
}
export function objectDependencies(object:Placement):ReadonlySet<DependencyKey>{
  const keys=new Set<DependencyKey>();
  for(const state of authoredStates(object)){
    if(state.when)for(const key of conditionDependencies(state.when as Condition,object.id))keys.add(key);
    if(state.interaction?.prerequisites)for(const key of conditionDependencies(state.interaction.prerequisites as Condition,object.id))keys.add(key);
  }
  return keys;
}
export function objectFrames(object:Placement):readonly string[]{return authoredStates(object).map(state=>state.frame);}
export function resolveObjectState(object:Placement,session:SessionState):ResolvedObjectState{
  const states=authoredStates(object);const state=states.find(candidate=>candidate.when?session.evaluate(candidate.when as Condition,object.id):candidate.fallback)??states.at(-1)!;
  const interaction=state.interaction?{...(state.interaction.messageId?{messageId:state.interaction.messageId}:{}),...(state.interaction.dialogueId?{dialogueId:state.interaction.dialogueId}:{}),...(state.interaction.rejectionMessageId?{rejectionMessageId:state.interaction.rejectionMessageId}:{}),...(state.interaction.prerequisites?{prerequisites:state.interaction.prerequisites as Condition}:{}),actions:(state.interaction.actions??[]) as readonly SessionAction[]}:undefined;
  return{objectId:object.id,stateId:state.id,frame:state.frame,visible:state.visible,solid:state.solid??object.solid,...(interaction?{interaction}:{})};
}
