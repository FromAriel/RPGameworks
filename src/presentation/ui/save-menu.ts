import type { SaveCheckpoint,SaveEnvelopeV1,SaveSlotId } from '../../domain/save';
import { createEnvelope } from '../../domain/save';
import type { PadInput } from '../../platform/gamepad-model';
import type { SessionController } from '../../runtime/session-controller';
import type { SaveService } from '../../runtime/save-service';
import { MenuNavigation } from './menu-navigation';

export class SaveMenu{
  private readonly navigation:MenuNavigation;private readonly lifetime=new AbortController();private readonly list:HTMLElement;private readonly status:HTMLElement;
  private readonly loadImport:HTMLButtonElement;
  private confirmKey:string|null=null;private imported:SaveEnvelopeV1|null=null;private busy=false;
  constructor(readonly element:HTMLDialogElement,private readonly service:SaveService,private readonly sessions:SessionController,
    private readonly checkpoint:()=>SaveCheckpoint,private readonly load:(envelope:SaveEnvelopeV1)=>Promise<void>,private readonly closeOwner:()=>void){
    const get=<T extends HTMLElement>(id:string):T=>{const node=element.querySelector<T>(`#${id}`);if(!node)throw new Error(`Missing save element: ${id}`);return node;};
    this.list=get('save-slots');this.status=get('save-status');this.loadImport=get('save-load-import');this.navigation=new MenuNavigation(element,()=>this.cancel());const options={signal:this.lifetime.signal};
    element.addEventListener('cancel',event=>{event.preventDefault();this.cancel();},options);get('save-close').addEventListener('click',()=>this.cancel(),options);
    get('save-refresh').addEventListener('click',()=>void this.refresh(),options);get('save-export-current').addEventListener('click',()=>this.exportCurrent(),options);
    get<HTMLInputElement>('save-import').addEventListener('change',event=>void this.acceptImport(event.currentTarget as HTMLInputElement),options);
    this.loadImport.addEventListener('click',()=>void this.loadImported(),options);
    this.list.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot-action]');if(button)void this.action(button);},options);
  }
  async open():Promise<void>{if(!this.element.open)this.element.showModal();this.navigation.reset();await this.refresh();this.element.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();}
  sample(pad:Readonly<PadInput>,deltaMs:number):void{if(this.element.open)this.navigation.sample(pad,deltaMs);}
  private async refresh():Promise<void>{if(this.busy)return;this.busy=true;this.status.textContent='Reading local save slots…';try{await this.service.refresh();this.render();this.status.textContent=this.imported?'Import ready. Choose “Import here” on a slot.':'Three manual slots. Empty slots cannot be loaded.';}catch(error){this.list.replaceChildren();this.status.textContent=`Local saves unavailable: ${error instanceof Error?error.message:String(error)}. You can still export current progress or load a valid import for this session.`;}finally{this.busy=false;}}
  private render():void{this.list.replaceChildren(...this.service.slots().map((slot,index)=>{
    const row=document.createElement('section');row.className='save-slot';const title=document.createElement('h3');title.textContent=`Slot ${index+1}`;const detail=document.createElement('p');detail.className='hint';
    const map=slot.record?this.service.context.index.maps.find(candidate=>candidate.id===slot.record!.current.checkpoint.mapId):null;
    detail.textContent=slot.error?`Invalid: ${slot.error}`:slot.record?`${map?.name??slot.record.current.checkpoint.mapId} · ${new Date(slot.record.current.savedAt).toLocaleString()} · revision ${slot.record.current.storageRevision}`:'Empty — Load and Export are unavailable.';
    const actions=document.createElement('div');actions.className='save-actions';
    const button=(action:string,label:string,disabled=false)=>{const value=document.createElement('button');value.type='button';value.dataset.slotAction=action;value.dataset.slot=slot.slotId;value.textContent=label;value.disabled=disabled;return value;};
    actions.append(button('save','Save'),button('load','Load',!slot.record||!!slot.error),button('export','Export',!slot.record||!!slot.error));if(slot.recoverable)actions.append(button('recover','Recover previous'));if(this.imported)actions.append(button('import','Import here'));
    row.append(title,detail,actions);return row;
  }));}
  private async action(button:HTMLButtonElement):Promise<void>{if(this.busy)return;const slotId=button.dataset.slot as SaveSlotId,action=button.dataset.slotAction!,key=`${action}:${slotId}`;
    if((action==='save'&&this.service.slots().find(slot=>slot.slotId===slotId)?.record)||(action==='load')||(action==='import')||(action==='recover')){if(this.confirmKey!==key){this.confirmKey=key;this.status.textContent=`Press “${button.textContent}” again to confirm replacing ${action==='load'?'the running session':'that slot'}.`;button.focus();return;}}
    this.confirmKey=null;this.busy=true;try{
      if(action==='save'){const result=await this.service.save(slotId,this.checkpoint(),this.sessions.current);this.status.textContent=result.kind==='written'?'Progress saved.':result.kind==='stale'?'Another tab changed this slot. Slot details were refreshed; review before trying again.':`Save failed (${result.reason}): ${result.message}`;}
      else if(action==='load'){await this.load(await this.service.load(slotId));this.status.textContent='Save loaded.';return;}
      else if(action==='export'){const envelope=await this.service.load(slotId);this.download(envelope);this.status.textContent='Save exported.';}
      else if(action==='import'&&this.imported){const result=await this.service.storeImport(slotId,this.imported);this.status.textContent=result.kind==='written'?'Import stored. Load the slot when ready.':result.kind==='stale'?'Another tab changed this slot. Review it before importing again.':`Import failed (${result.reason}): ${result.message}`;if(result.kind==='written'){this.imported=null;this.loadImport.hidden=true;}}
      else if(action==='recover'){const result=await this.service.recover(slotId);this.status.textContent=result.kind==='written'?'Previous valid revision recovered.':result.kind==='stale'?'Another tab changed this slot; recovery was not applied.':`Recovery failed: ${result.message}`;}
      this.render();
    }catch(error){this.status.textContent=error instanceof Error?error.message:String(error);}finally{this.busy=false;}
  }
  private async acceptImport(input:HTMLInputElement):Promise<void>{const file=input.files?.[0];input.value='';if(!file)return;try{this.imported=this.service.import(new Uint8Array(await file.arrayBuffer()));this.loadImport.hidden=false;this.confirmKey=null;this.render();this.status.textContent='Import validated. Store it in a slot or load it for this session.';}catch(error){this.imported=null;this.loadImport.hidden=true;this.status.textContent=`Import rejected: ${error instanceof Error?error.message:String(error)}`;}}
  private async loadImported():Promise<void>{if(!this.imported)return;if(this.confirmKey!=='load-import'){this.confirmKey='load-import';this.status.textContent='Press “Load validated import” again to replace the running session without storing it.';return;}const value=this.imported;this.confirmKey=null;await this.load(value);}
  private exportCurrent():void{try{this.download(createEnvelope('slot-1',1,this.service.context,this.checkpoint(),this.sessions.current));this.status.textContent='Current session exported. It was not written to a local slot.';}catch(error){this.status.textContent=error instanceof Error?error.message:String(error);}}
  private download(envelope:SaveEnvelopeV1):void{const blob=new Blob([this.service.exportText(envelope)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${envelope.gameId.replace(':','-')}-${envelope.slotId}-r${envelope.storageRevision}.json`;link.click();queueMicrotask(()=>URL.revokeObjectURL(url));}
  private cancel():void{if(this.confirmKey){this.confirmKey=null;this.status.textContent='Confirmation cancelled.';return;}this.close();this.closeOwner();}
  close():void{this.navigation.reset();if(this.element.open)this.element.close();}
  dispose():void{this.close();this.navigation.dispose();this.lifetime.abort();this.list.replaceChildren();}
}
