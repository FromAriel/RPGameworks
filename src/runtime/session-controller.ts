import type { DependencyKey, SessionDefinitions, TransactionRequest, TransactionResult } from '../domain/session';
import { SessionState } from '../domain/session';

type Committed = Extract<TransactionResult,{kind:'committed'}>;
export class SessionController {
  private listeners = new Set<{dependencies:ReadonlySet<DependencyKey>;listener:(result:Committed)=>void}>();
  constructor(private active:SessionState){}
  get current():SessionState{return this.active;}
  get subscriberCount():number{return this.listeners.size;}
  transact(request:TransactionRequest,selfId?:string):TransactionResult{
    const result=this.active.transact(request,selfId);
    if(result.kind==='committed')for(const entry of this.listeners)if([...result.changed].some(key=>entry.dependencies.has(key)))entry.listener(result);
    return result;
  }
  subscribe(dependencies:ReadonlySet<DependencyKey>,listener:(result:Committed)=>void):()=>void{
    const entry={dependencies,listener};this.listeners.add(entry);return()=>{this.listeners.delete(entry);};
  }
  activate(candidate:SessionState):void{this.active=candidate;this.listeners.clear();}
  candidate(definitions:SessionDefinitions,data:ConstructorParameters<typeof SessionState>[1]):SessionState{return new SessionState(definitions,data);}
}
