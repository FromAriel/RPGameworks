import type { SessionController } from '../../runtime/session-controller';
import { MenuNavigation } from './menu-navigation';
import type { PadInput } from '../../platform/gamepad-model';
import { createListRow, mountPromptLegend, mountScrollAffordance, type ListRowHandle, type PromptEntry, type PromptLegendPresenter, type ScrollAffordanceController } from './components';

/** Read-only inspection menu. Item use/discard wait for authored gameplay rules. */
export class InventoryMenu {
  private readonly navigation: MenuNavigation;
  private readonly lifetime = new AbortController();
  private selected: string | null = null;
  private revision = -1;
  private readonly rows = new Map<string, ListRowHandle>();
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private readonly description: HTMLElement;
  private readonly quantity: HTMLElement;
  private readonly legend: PromptLegendPresenter;
  private readonly affordances: ScrollAffordanceController[] = [];
  constructor(readonly element: HTMLDialogElement, private readonly sessions: SessionController,
    close: () => void, settings: () => void, saves:()=>void, private readonly promptEntries: () => PromptEntry[]) {
    const get = <T extends HTMLElement>(id: string): T => {
      const node = element.querySelector<T>(`#${id}`); if (!node) throw new Error(`Missing inventory element: ${id}`); return node;
    };
    const body = element.querySelector<HTMLElement>('.inventory-body');
    if (!body) throw new Error('Missing inventory element: .inventory-body');
    this.list = get('inventory-list'); this.title = get('item-name');
    this.description = get('item-description'); this.quantity = get('item-quantity');
    this.legend = mountPromptLegend(get('inventory-prompt'));
    // Closed dialogs have no layout; availability resolves when the ResizeObserver sees real sizes.
    this.affordances.push(
      mountScrollAffordance(body, get('inventory-body-above'), get('inventory-body-below')),
      mountScrollAffordance(this.list, get('inventory-list-above'), get('inventory-list-below')),
    );
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
    for (const [key, row] of this.rows) row.setSelected(key === id);
    this.title.textContent = item ? session.catalog.strings.en[item.nameKey]! : 'Empty inventory';
    this.description.textContent = item ? session.catalog.strings.en[item.descriptionKey]! : 'Find a chest in the Pillar Gallery to collect your first item.';
    this.quantity.textContent = item ? `Quantity: ${session.count(item.id)} / ${item.maxStack}` : '';
  }
  private clearRows(): void {
    for (const row of this.rows.values()) row.dispose();
    this.rows.clear(); this.list.replaceChildren();
  }
  open(): void {
    const session=this.sessions.current;const state = session.snapshot();
    if (this.revision !== state.revision) {
      this.clearRows();
      for (const item of session.catalog.items) {
        const count = state.inventory[item.id]; if (!count) continue;
        const row = createListRow({ id: item.id, label: session.catalog.strings.en[item.nameKey]!, trailing: `× ${count}` });
        row.element.dataset.itemId = item.id;
        row.element.setAttribute('aria-controls','inventory-detail');
        this.rows.set(item.id,row); this.list.append(row.element);
      }
      this.revision = state.revision;
    }
    const id = this.selected && this.rows.has(this.selected) ? this.selected : this.rows.keys().next().value ?? null;
    this.select(id);
    this.element.querySelector<HTMLElement>('#inventory-count')!.textContent = `${this.rows.size} / ${session.catalog.capacity} stacks`;
    this.legend.set(this.promptEntries());
    if (!this.element.open) this.element.showModal();
    document.getElementById('tools-toggle')?.setAttribute('aria-expanded','true');
    this.navigation.reset();
    const focused = id ? this.rows.get(id)!.element : this.element.querySelector<HTMLElement>('#inventory-close')!;
    focused.focus({preventScroll:true});
    if (id) focused.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  sample(pad: Readonly<PadInput>, deltaMs: number): void { if (this.element.open) this.navigation.sample(pad,deltaMs); }
  close(): void {
    this.navigation.reset();
    if (this.element.open) { this.element.close(); document.getElementById('tools-toggle')?.setAttribute('aria-expanded','false'); }
  }
  dispose(): void {
    this.close();
    for (const affordance of this.affordances) affordance.dispose();
    this.affordances.length = 0;
    this.legend.dispose(); this.clearRows();
    this.navigation.dispose(); this.lifetime.abort();
  }
}
