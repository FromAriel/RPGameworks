import type { SaveCheckpoint,SaveEnvelopeV1,SaveSlotId } from '../../domain/save';
import { createEnvelope } from '../../domain/save';
import type { PadInput } from '../../platform/gamepad-model';
import type { SessionController } from '../../runtime/session-controller';
import type { SaveService } from '../../runtime/save-service';
import type { ConfirmationController, ConfirmationDialogParts, UiIntent, UiStatusKind } from './components';
import { mountConfirmation, mountStatus } from './components';
import { MenuNavigation } from './menu-navigation';

interface SlotRequest { readonly title:string; readonly body:string; readonly confirmLabel:string }

export class SaveMenu{
  private readonly navigation:MenuNavigation;private readonly lifetime=new AbortController();private readonly list:HTMLElement;
  private readonly statusPresenter:ReturnType<typeof mountStatus>;
  private readonly loadImport:HTMLButtonElement;
  private readonly confirmation:ConfirmationController;private readonly confirmationNav:MenuNavigation;
  /** Held X/B re-edge after a modal-boundary reset, so sampling waits for one neutral pad frame. */
  private awaitingNeutralPad=true;
  private disposed=false;private imported:SaveEnvelopeV1|null=null;private busy=false;
  constructor(readonly element:HTMLDialogElement,private readonly service:SaveService,private readonly sessions:SessionController,
    private readonly checkpoint:()=>SaveCheckpoint,private readonly load:(envelope:SaveEnvelopeV1)=>Promise<void>,private readonly closeOwner:()=>void,
    confirmationParts:ConfirmationDialogParts,clearInputs:()=>void,private readonly checkpointReason:(checkpoint:SaveCheckpoint)=>string|null=()=>null){
    const get=<T extends HTMLElement>(id:string):T=>{const node=element.querySelector<T>(`#${id}`);if(!node)throw new Error(`Missing save element: ${id}`);return node;};
    this.list=get('save-slots');this.loadImport=get('save-load-import');
    this.statusPresenter=mountStatus(get('save-status'));
    this.navigation=new MenuNavigation(element,()=>this.cancel());
    this.confirmationNav=new MenuNavigation(confirmationParts.dialog,()=>confirmationParts.cancel.click());
    // The input gate lets a pending confirmation supersede polling only for this owner.
    confirmationParts.dialog.dataset.ownerModal=element.id;
    this.confirmation=mountConfirmation(confirmationParts,{
      clearHeldInputs:()=>clearInputs(), // Both modal boundaries clear held gameplay/menu input.
      onOpen:()=>{this.awaitingNeutralPad=false;},
      onClose:()=>{this.awaitingNeutralPad=false;},
    });
    const options={signal:this.lifetime.signal};
    element.addEventListener('cancel',event=>{event.preventDefault();this.cancel();},options);get('save-close').addEventListener('click',()=>this.cancel(),options);
    get('save-refresh').addEventListener('click',()=>void this.refresh(),options);get('save-export-current').addEventListener('click',()=>this.exportCurrent(),options);
    get<HTMLInputElement>('save-import').addEventListener('change',event=>void this.acceptImport(event.currentTarget as HTMLInputElement),options);
    this.loadImport.addEventListener('click',()=>void this.loadImported(),options);
    this.list.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot-action]');if(button)void this.action(button);},options);
  }
  async open():Promise<void>{if(!this.element.open)this.element.showModal();this.navigation.reset();await this.refresh();this.element.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled)')?.focus();}
  sample(pad:Readonly<PadInput>,deltaMs:number):void{
    if(!this.element.open)return;
    if(this.confirmation.pending||!this.awaitingNeutralPad){
      // One neutral frame re-arms sampling after each modal boundary; until then a held
      // X/B (which re-edges after reset) can neither drive the dialog nor the menu below.
      if(this.confirmation.pending&&this.awaitingNeutralPad)this.confirmationNav.sample(pad,deltaMs);
      else if(!pad.direction&&!pad.interact&&!pad.cancel&&!pad.menu&&!pad.burst)this.awaitingNeutralPad=true;
      return;
    }
    this.navigation.sample(pad,deltaMs);
  }
  private set(kind:UiStatusKind,message:string):void{this.statusPresenter.set(kind,message);}
  /** A successful write rerenders the row; return focus to the same action, then its slot, then a visible fallback. */
  private refocus(action:string,slotId:SaveSlotId):void{
    const next=this.list.querySelector<HTMLButtonElement>(`button[data-slot-action="${action}"][data-slot="${slotId}"]`)
      ??this.list.querySelector<HTMLButtonElement>(`button[data-slot="${slotId}"]:not(:disabled)`)
      ??this.element.querySelector<HTMLButtonElement>('#save-close');
    next?.focus({preventScroll:true});
  }
  private async refresh():Promise<void>{
    if(this.disposed||this.busy)return;
    this.busy=true;this.set('pending','Reading local save slots…');
    try{await this.service.refresh();if(this.disposed)return;this.render();this.set('information',this.imported?'Import ready. Choose “Import here” on a slot.':'Three manual slots. Empty slots cannot be loaded.');}
    catch(error){if(this.disposed)return;this.list.replaceChildren();this.set('failure',`Local saves unavailable: ${error instanceof Error?error.message:String(error)}. You can still export current progress or load a valid import for this session.`);}
    finally{this.busy=false;}
  }
  private render():void{this.list.replaceChildren(...this.service.slots().map((slot,index)=>{
    const row=document.createElement('section');row.className='save-slot ui-inset';
    row.setAttribute('role','group');row.setAttribute('aria-labelledby',`${slot.slotId}-title`);
    const title=document.createElement('h3');title.className='ui-inset__title';title.id=`${slot.slotId}-title`;title.textContent=`Slot ${index+1}`;
    const body=document.createElement('div');body.className='ui-inset__body';const detail=document.createElement('p');detail.className='hint';
    const map=slot.record?this.service.context.index.maps.find(candidate=>candidate.id===slot.record!.current.checkpoint.mapId):null;
    detail.textContent=slot.error?`Invalid: ${slot.error}`:slot.record?`${map?.name??slot.record.current.checkpoint.mapId} · ${new Date(slot.record.current.savedAt).toLocaleString()} · revision ${slot.record.current.storageRevision}`:'Empty — Load and Export are unavailable.';
    body.append(detail);
    const actions=document.createElement('div');actions.className='save-actions';
    const button=(action:string,label:string,intent:UiIntent='secondary',disabled=false)=>{const value=document.createElement('button');value.type='button';value.className='ui-action-button';value.dataset.intent=intent;value.dataset.slotAction=action;value.dataset.slot=slot.slotId;value.textContent=label;value.disabled=disabled;return value;};
    const occupied=!slot.error&&!!slot.record;
    actions.append(
      button('save','Save',occupied?'danger':'primary'),
      button('load','Load','danger',!occupied),
      button('export','Export','secondary',!occupied));
    if(slot.recoverable)actions.append(button('recover','Recover previous','danger'));
    if(this.imported)actions.append(button('import','Import here','danger'));
    row.append(title,body,actions);return row;
  }));}
  /** The dialog names the exact slot, consequence, and previewed payload; the service rechecks staleness after confirmation. */
  private request(action:string,slotId:SaveSlotId,imported?:SaveEnvelopeV1|null):SlotRequest{
    const slot=Number(slotId.replace('slot-',''));
    if(action==='save')return{title:`Replace Slot ${slot}?`,body:`Saving replaces the stored record in Slot ${slot} with current progress.`,confirmLabel:`Save to Slot ${slot}`};
    if(action==='load')return{title:`Load Slot ${slot}?`,body:`Loading replaces the running session with the Slot ${slot} record. Unsaved progress is lost.`,confirmLabel:`Load Slot ${slot}`};
    if(action==='import'){const revision=imported?.storageRevision??'?',saved=imported?new Date(imported.savedAt).toISOString():'?';
      return{title:`Replace Slot ${slot}?`,body:`Importing replaces the stored record in Slot ${slot} with the validated import (revision ${revision}, saved ${saved}).`,confirmLabel:`Import to Slot ${slot}`};}
    return{title:`Recover Slot ${slot}?`,body:`Recovery replaces the current revision in Slot ${slot} with its previous valid revision.`,confirmLabel:`Recover Slot ${slot}`};
  }
  private async confirm(request:SlotRequest):Promise<boolean>{
    const confirmed=await this.confirmation.confirm({...request,intent:'danger'});
    return this.disposed?false:confirmed;
  }
  private async action(button:HTMLButtonElement):Promise<void>{
    if(this.disposed||this.busy||this.confirmation.pending)return;
    const slotId=button.dataset.slot as SaveSlotId,action=button.dataset.slotAction!;
    // Snapshot now: whatever the dialog previews is exactly what a confirmation stores.
    const importedSnapshot=action==='import'?this.imported:null;
    const occupied=!action.startsWith('load')&&!!this.service.slots().find(slot=>slot.slotId===slotId)?.record;
    if((action==='save'&&occupied)||action==='load'||action==='import'||action==='recover'){
      if(!await this.confirm(this.request(action,slotId,importedSnapshot))){if(!this.disposed)this.set('information','Action cancelled. Nothing was changed.');return;}
      if(this.disposed)return;
    }
    this.busy=true;
    try{
      if(action==='save'){const refusal=this.checkpointReason(this.checkpoint());if(refusal){this.set('failure',refusal);return;} // No confirm, no write, no movement: the player stays on the tile with the reason.
        const result=await this.service.save(slotId,this.checkpoint(),this.sessions.current);if(result.kind==='written')this.set('success','Progress saved.');else if(result.kind==='stale')this.set('warning','Another tab changed this slot. Slot details were refreshed; review before trying again.');else this.set('failure',`Save failed (${result.reason}): ${result.message}`);}
      else if(action==='load'){await this.load(await this.service.load(slotId));if(!this.disposed)this.set('success','Save loaded.');return;} // Exploration focus wins after an in-place load.
      else if(action==='export'){const envelope=await this.service.load(slotId);if(this.disposed)return;this.download(envelope);this.set('success','Save exported.');}
      else if(action==='import'&&importedSnapshot){const result=await this.service.storeImport(slotId,importedSnapshot);if(this.disposed)return;if(result.kind==='written'){this.set('success','Import stored. Load the slot when ready.');if(this.imported===importedSnapshot){this.imported=null;this.loadImport.hidden=true;}}else if(result.kind==='stale')this.set('warning','Another tab changed this slot. Review it before importing again.');else this.set('failure',`Import failed (${result.reason}): ${result.message}`);}
      else if(action==='recover'){const result=await this.service.recover(slotId);if(result.kind==='written')this.set('success','Previous valid revision recovered.');else if(result.kind==='stale')this.set('warning','Another tab changed this slot; recovery was not applied.');else this.set('failure',`Recovery failed: ${result.message}`);}
      if(this.disposed)return;
      this.render();this.refocus(action,slotId);
    }catch(error){if(!this.disposed)this.set('failure',error instanceof Error?error.message:String(error));}finally{this.busy=false;}
  }
  private async acceptImport(input:HTMLInputElement):Promise<void>{
    const file=input.files?.[0];input.value='';
    if(!file||this.disposed||this.busy||this.confirmation.pending)return;
    try{const envelope=this.service.import(new Uint8Array(await file.arrayBuffer()));if(this.disposed)return;this.imported=envelope;this.loadImport.hidden=false;this.render();this.set('information','Import validated. Store it in a slot or load it for this session.');}
    catch(error){if(this.disposed)return;this.imported=null;this.loadImport.hidden=true;this.set('failure',`Import rejected: ${error instanceof Error?error.message:String(error)}`);}
  }
  private async loadImported():Promise<void>{
    if(this.disposed||!this.imported||this.busy||this.confirmation.pending)return;
    const snapshot=this.imported; // Confirmed payload is the previewed one, even if another read lands mid-dialog.
    if(!await this.confirm({title:'Replace the running session?',body:'Loading the validated import replaces current unsaved progress and is not stored in a slot.',confirmLabel:'Load import'})){if(!this.disposed)this.set('information','Action cancelled. Nothing was changed.');return;}
    if(this.disposed)return;
    this.busy=true;
    try{await this.load(snapshot);if(!this.disposed)this.set('success','Save loaded.');}
    catch(error){if(!this.disposed)this.set('failure',error instanceof Error?error.message:String(error));}
    finally{this.busy=false;}
  }
  private exportCurrent():void{try{const checkpoint=this.checkpoint();const refusal=this.checkpointReason(checkpoint);if(refusal){this.set('failure',refusal);return;}
    this.download(createEnvelope('slot-1',1,this.service.context,checkpoint,this.sessions.current));this.set('success','Current session exported. It was not written to a local slot.');}catch(error){this.set('failure',error instanceof Error?error.message:String(error));}}
  private download(envelope:SaveEnvelopeV1):void{const blob=new Blob([this.service.exportText(envelope)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${envelope.gameId.replace(':','-')}-${envelope.slotId}-r${envelope.storageRevision}.json`;link.click();queueMicrotask(()=>URL.revokeObjectURL(url));}
  private cancel():void{this.close();this.closeOwner();}
  close():void{this.navigation.reset();if(this.element.open)this.element.close();}
  dispose():void{
    this.disposed=true;
    this.close();this.navigation.dispose();this.confirmationNav.dispose();this.confirmation.dispose();this.statusPresenter.dispose();
    this.lifetime.abort();this.list.replaceChildren();
  }
}
