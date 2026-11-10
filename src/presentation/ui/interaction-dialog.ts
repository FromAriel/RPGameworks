import { mountScrollAffordance, type ScrollAffordanceController } from './components';
import { MenuNavigation } from './menu-navigation';
import type { AvailableChoice } from '../../domain/dialogue';
import type { PadInput } from '../../platform/gamepad-model';

/** A choice whose transparent button sits over something drawn on the game canvas, in logical pixels. */
export interface PlacedChoice {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  /** Read by assistive technology; for a disabled choice, why it is unavailable. */
  readonly help: string;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}
/** A pointer-only shortcut over the canvas (for example tapping an enemy to attack it); hidden from assistive technology. */
export interface PlacedOverlay { readonly rect: PlacedChoice['rect']; readonly choose: () => void }

/** The native dialog owns focus and makes background page controls inert.
 * Actions are handled by the scene input owner, not separate game mutations here.
 */
export class InteractionDialog {
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly page: HTMLElement;
  private readonly details: HTMLElement;
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
    this.title = get('#dialog-title'); this.text = get('#dialog-text'); this.page = get('#dialog-page'); this.details = get('#dialog-details');
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

  /**
   * `layout` 'battle' anchors the window to the battle stage's lower band (battle-window.css). `details` is read by
   * screen readers but not shown, for state the canvas already draws (HP, turn order). `soleAction` hides the cancel
   * button when the advance button already does the same thing (a message's last page), so only one Close shows.
   */
  show(title: string, text: string, page: string, advanceLabel: string | null, cancelLabel: string,
    options: { readonly layout?: 'battle'; readonly details?: string; readonly soleAction?: boolean; readonly skin?: string } = {}): void {
    this.ensureAffordance();
    const focusWasChoice = this.choices.contains(document.activeElement);
    this.navigation?.dispose();this.navigation=null;
    this.choices.hidden=true;this.choices.replaceChildren();
    // Authored content is text, never HTML. Newlines and wrapping are handled by CSS.
    this.title.textContent = title; this.text.textContent = text; this.page.textContent = page;
    this.details.textContent = options.details ?? '';
    if (options.layout) this.element.dataset.layout = options.layout; else delete this.element.dataset.layout;
    // A message or dialogue may name its own window skin (decision 0011 W3.4); otherwise the dialogue default applies.
    if (options.skin) this.element.dataset.skinId = options.skin; else delete this.element.dataset.skinId;
    this.scroll.scrollTop = 0; // A new page starts at its beginning, not the last page's scroll position.
    this.advance.hidden = advanceLabel === null;
    this.cancel.hidden = !!options.soleAction && advanceLabel !== null;
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
  showChoices(options:readonly AvailableChoice[],choose:(id:string)=>void,hideCancel=false):void{
    this.navigation?.dispose();this.navigation=new MenuNavigation(this.element,this.cancelChoices);
    this.advance.hidden=true;this.cancel.hidden=hideCancel;this.choices.replaceChildren();this.choices.hidden=false;
    for(const option of options){const button=document.createElement('button');button.type='button';button.className='ui-action-button';button.dataset.dialogueChoice=option.id;button.textContent=option.label;
      button.disabled=!option.enabled;if(!option.enabled&&option.reason){button.title=option.reason;button.setAttribute('aria-description',option.reason);const reason=document.createElement('span');reason.className='hint';reason.textContent=option.reason;const row=document.createElement('div');row.append(button,reason);this.choices.append(row);}else this.choices.append(button);
      button.addEventListener('click',()=>choose(option.id),{once:true});
    }
    this.choices.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
  }
  /**
   * Battle-style choices: each is a real, focusable button made transparent and placed over its drawn entry, so taps,
   * keyboard, controller and screen readers all act on the same element (battle-window.css). Disabled choices stay
   * focusable so their reason can be read, but do nothing.
   */
  showPlacedChoices(choices:readonly PlacedChoice[],options:{readonly cursor:number;readonly choose:(id:string)=>void;
    readonly focus?:(index:number)=>void;readonly overlays?:readonly PlacedOverlay[]}):void{
    this.navigation?.dispose();this.navigation=new MenuNavigation(this.element,this.cancelChoices);
    this.advance.hidden=true;this.cancel.hidden=true;this.choices.replaceChildren();this.choices.hidden=false;
    const place=(node:HTMLElement,rect:PlacedChoice['rect'])=>{for(const [key,value] of Object.entries({x:rect.x,y:rect.y,w:rect.w,h:rect.h}))node.style.setProperty(`--${key}`,String(value));};
    for(const overlay of options.overlays??[]){
      const node=document.createElement('div');node.className='placed-overlay';node.setAttribute('aria-hidden','true');place(node,overlay.rect);
      node.addEventListener('click',()=>overlay.choose(),{once:true});this.choices.append(node);
    }
    const buttons=choices.map((choice,index)=>{
      const button=document.createElement('button');button.type='button';button.className='placed-choice';button.dataset.dialogueChoice=choice.id;
      button.textContent=choice.name;button.setAttribute('aria-description',choice.help);place(button,choice.rect);
      if(!choice.enabled){button.setAttribute('aria-disabled','true');button.dataset.focusableDisabled='';}
      else button.addEventListener('click',()=>options.choose(choice.id),{once:true});
      button.addEventListener('focus',()=>options.focus?.(index));
      this.choices.append(button);return button;
    });
    (buttons[options.cursor]??buttons[0])?.focus({preventScroll:true});
  }
  sampleChoices(pad:Readonly<PadInput>,deltaMs:number):void{this.navigation?.sample(pad,deltaMs);}
  close(): void { this.navigation?.dispose();this.navigation=null;delete this.element.dataset.layout;delete this.element.dataset.skinId;if (this.element.open) this.element.close(); }
  dispose(): void {
    this.close();
    this.affordance?.dispose(); // A restarted scene remounts on the next show; observers never accumulate.
    this.affordance = null;
    this.choices.remove();
  }
}
