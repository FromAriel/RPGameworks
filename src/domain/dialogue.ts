import type { MapDefinition } from '../content/generated/map';
import type { SessionAction, SessionState, Condition } from './session';

export type Dialogue = NonNullable<MapDefinition['dialogues']>[number];
export type DialogueChoice = Dialogue['nodes'][number]['choices'] extends (infer C)[] | undefined ? C : never;
export interface AvailableChoice { readonly id:string; readonly label:string; readonly enabled:boolean; readonly reason?:string }

/** Map-local authored graph. It reads domain state and leaves all mutations to SessionState.transact. */
export class DialogueSession {
  private node:Dialogue['nodes'][number];
  private pageIndex=0;
  constructor(readonly graph:Dialogue,readonly owner:string,private readonly strings:Readonly<Record<string,string>>,private readonly session:SessionState){
    const entry=graph.entries.find(candidate=>!candidate.when||session.evaluate(candidate.when as Condition,owner));
    if(!entry)throw new Error(`Dialogue ${graph.id} has no available entry`);
    this.node=this.find(entry.nodeId);
  }
  private find(id:string):Dialogue['nodes'][number]{const node=this.graph.nodes.find(candidate=>candidate.id===id);if(!node)throw new Error(`Dialogue ${this.graph.id} references missing node ${id}`);return node;}
  get speaker():string{return this.strings[this.node.speakerKey]??this.node.speakerKey;}
  get text():string{return this.strings[this.node.pages[this.pageIndex]!]??this.node.pages[this.pageIndex]!;}
  get page():number{return this.pageIndex+1;}
  get total():number{return this.node.pages.length;}
  get atChoices():boolean{return this.pageIndex===this.node.pages.length-1&&!!this.node.choices?.length;}
  advance():boolean{if(this.pageIndex+1<this.node.pages.length){this.pageIndex++;return true;}return false;}
  choices():readonly AvailableChoice[]{return(this.node.choices??[]).filter(choice=>!choice.when||this.session.evaluate(choice.when as Condition,this.owner)).map(choice=>({id:choice.id,label:this.strings[choice.labelKey]??choice.labelKey,enabled:!choice.enabledWhen||this.session.evaluate(choice.enabledWhen as Condition,this.owner),...(choice.disabledReasonKey?{reason:this.strings[choice.disabledReasonKey]??choice.disabledReasonKey}:{})}));}
  select(id:string):{readonly actions:readonly SessionAction[];readonly nextNodeId?:string;readonly prerequisites?:Condition}{
    const choice=this.node.choices?.find(candidate=>candidate.id===id);if(!choice||!this.choices().some(candidate=>candidate.id===id&&candidate.enabled))throw new Error(`Unavailable dialogue choice: ${id}`);
    return{actions:(choice.actions??[]) as readonly SessionAction[],...(choice.nextNodeId?{nextNodeId:choice.nextNodeId}:{}),...(choice.enabledWhen?{prerequisites:choice.enabledWhen as Condition}:{})};
  }
  move(id:string):void{this.node=this.find(id);this.pageIndex=0;}
}
