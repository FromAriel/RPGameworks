import { mountScrollAffordance, type ScrollAffordanceController } from './components';
import { MenuNavigation } from './menu-navigation';
import type { AvailableChoice } from '../../domain/dialogue';
import type { PadInput } from '../../platform/gamepad-model';

/** The native dialog owns focus and makes background page controls inert.
 * Actions are handled by the scene input owner, not separate game mutations here.
 */
export class InteractionDialog {
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly page: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly above: HTMLElement;
  private readonly below: HTMLElement;
  private readonly advance: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private affordance: ScrollAffordanceController | null = null;
  private readonly choices:HTMLElement;
  private navigation:MenuNavigation|null=null;

  constructor(readonly element: HTMLDialogElement, private readonly cancelChoices:()=>void=()=>{}) {
    const get = <T extends HTMLElement>(selector: string): T => {
      const value = element.querySelector<T>(selector);
      if (!value) throw new Error(`Missing interaction dialog element: ${selector}`);
      return value;
    };
    this.title = get('#dialog-title'); this.text = get('#dialog-text'); this.page = get('#dialog-page');
    this.scroll = get('.dialog-scroll');
    this.above = get('#dialog-scroll-above'); this.below = get('#dialog-scroll-below');
    this.advance = get('#dialog-advance'); this.cancel = get('#dialog-cancel');
    this.choices=document.createElement('div');this.choices.id='dialog-choices';this.choices.className='dialogue-choices';this.choices.hidden=true;
    this.advance.parentElement!.before(this.choices);
  }

  /** Mounted lazily: a closed dialog has no layout, so availability starts after first show. */
  private ensureAffordance(): void {
    if (this.affordance) return;
    this.affordance = mountScrollAffordance(this.scroll, this.above, this.below);
  }

  show(title: string, text: string, page: string, advanceLabel: string | null, cancelLabel: string): void {
    this.ensureAffordance();
    const focusWasChoice = this.choices.contains(document.activeElement);
    this.navigation?.dispose();this.navigation=null;
    this.choices.hidden=true;this.choices.replaceChildren();
    // Authored content is text, never HTML. Newlines and wrapping are handled by CSS.
    this.title.textContent = title; this.text.textContent = text; this.page.textContent = page;
    this.scroll.scrollTop = 0; // A new page starts at its beginning, not the last page's scroll position.
    this.advance.hidden = advanceLabel === null;
    this.advance.textContent = advanceLabel ?? '';
    this.cancel.textContent = cancelLabel;
    if (!this.element.open) {
      this.element.showModal();
      (advanceLabel ? this.advance : this.cancel).focus({ preventScroll: true });
    } else if (focusWasChoice || !this.element.contains(document.activeElement)
      || (advanceLabel === null && document.activeElement === this.advance)) {
      // Replacing the selected choice detaches its button; keep keyboard focus in the dialogue.
      (advanceLabel ? this.advance : this.cancel).focus({ preventScroll: true });
    }
  }
  showChoices(options:readonly AvailableChoice[],choose:(id:string)=>void):void{
    this.navigation?.dispose();this.navigation=new MenuNavigation(this.element,this.cancelChoices);
    this.advance.hidden=true;this.choices.replaceChildren();this.choices.hidden=false;
    for(const option of options){const button=document.createElement('button');button.type='button';button.className='ui-action-button';button.dataset.dialogueChoice=option.id;button.textContent=option.label;
      button.disabled=!option.enabled;if(!option.enabled&&option.reason){button.title=option.reason;button.setAttribute('aria-description',option.reason);const reason=document.createElement('span');reason.className='hint';reason.textContent=option.reason;const row=document.createElement('div');row.append(button,reason);this.choices.append(row);}else this.choices.append(button);
      button.addEventListener('click',()=>choose(option.id),{once:true});
    }
    this.choices.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }
  sampleChoices(pad:Readonly<PadInput>,deltaMs:number):void{this.navigation?.sample(pad,deltaMs);}
  close(): void { this.navigation?.dispose();this.navigation=null;if (this.element.open) this.element.close(); }
  dispose(): void {
    this.close();
    this.affordance?.dispose(); // A restarted scene remounts on the next show; observers never accumulate.
    this.affordance = null;
    this.choices.remove();
  }
}
