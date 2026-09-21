import type { SessionController } from '../../runtime/session-controller';
import { MenuNavigation } from './menu-navigation';
import type { PadInput } from '../../platform/gamepad-model';

/** Read-only inspection menu. Item use/discard wait for authored gameplay rules. */
export class InventoryMenu {
  private readonly navigation: MenuNavigation;
  private readonly lifetime = new AbortController();
  private selected: string | null = null;
  private revision = -1;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly quantity: HTMLElement;
  constructor(readonly element: HTMLDialogElement, private readonly sessions: SessionController,
    close: () => void, settings: () => void, saves:()=>void, private readonly prompt: () => string) {
    const get = <T extends HTMLElement>(id: string): T => {
      const node = element.querySelector<T>(`#${id}`); if (!node) throw new Error(`Missing inventory element: ${id}`); return node;
    };
    this.list = get('inventory-list'); this.title = get('item-name');
    this.description = get('item-description'); this.quantity = get('item-quantity');
    const options = {signal:this.lifetime.signal};
    this.navigation = new MenuNavigation(element, close);
    element.addEventListener('cancel', event => {event.preventDefault(); close();}, options);
    get('inventory-close').addEventListener('click',close,options);
    get('inventory-settings').addEventListener('click',settings,options);
    get('inventory-saves').addEventListener('click',saves,options);
    // Delegation avoids retained per-row closures when contents change.
    this.list.addEventListener('focusin', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
      if (button) this.select(button.dataset.itemId!);
    }, options);
    this.list.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-item-id]');
      if (button) this.select(button.dataset.itemId!);
    }, options);
  }
  private select(id: string | null): void {
    const session=this.sessions.current;
    this.selected = id;
    const item = session.catalog.items.find(candidate => candidate.id === id);
    for (const [key, button] of this.buttons) button.setAttribute('aria-pressed', String(key === id));
    this.title.textContent = item ? session.catalog.strings.en[item.nameKey]! : 'Empty inventory';
    this.description.textContent = item ? session.catalog.strings.en[item.descriptionKey]! : 'Find a chest in the Pillar Gallery to collect your first item.';
    this.quantity.textContent = item ? `Quantity: ${session.count(item.id)} / ${item.maxStack}` : '';
  }
  open(): void {
    const session=this.sessions.current;const state = session.snapshot();
    if (this.revision !== state.revision) {
      this.buttons.clear(); this.list.replaceChildren();
      for (const item of session.catalog.items) {
        const count = state.inventory[item.id]; if (!count) continue;
        const button = document.createElement('button'); button.type = 'button'; button.dataset.itemId = item.id;
        button.textContent = `${session.catalog.strings.en[item.nameKey]} × ${count}`;
        button.setAttribute('aria-controls','inventory-detail');
        this.buttons.set(item.id,button); this.list.append(button);
      }
      this.revision = state.revision;
    }
    const id = this.selected && this.buttons.has(this.selected) ? this.selected : this.buttons.keys().next().value ?? null;
    this.select(id);
    this.element.querySelector<HTMLElement>('#inventory-count')!.textContent = `${this.buttons.size} / ${session.catalog.capacity} stacks`;
    this.element.querySelector<HTMLElement>('#inventory-prompt')!.textContent = this.prompt();
    if (!this.element.open) this.element.showModal();
    document.getElementById('tools-toggle')?.setAttribute('aria-expanded','true');
    this.navigation.reset();
    const focused = id ? this.buttons.get(id)! : this.element.querySelector<HTMLElement>('#inventory-close')!;
    focused.focus({preventScroll:true});
    if (id) focused.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  sample(pad: Readonly<PadInput>, deltaMs: number): void { if (this.element.open) this.navigation.sample(pad,deltaMs); }
  close(): void {
    this.navigation.reset();
    if (this.element.open) { this.element.close(); document.getElementById('tools-toggle')?.setAttribute('aria-expanded','false'); }
  }
  dispose(): void { this.close(); this.navigation.dispose(); this.lifetime.abort(); this.buttons.clear(); this.list.replaceChildren(); }
}
