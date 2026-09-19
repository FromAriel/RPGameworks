import { DirectionRepeat } from '../../domain/menu-navigation';
import type { Direction } from '../../domain/movement';
import type { PadInput } from '../../platform/gamepad-model';

const focusSelector = 'button, input, select, textarea, summary, a[href], [tabindex="0"]';

/** Direct semantic focus, never a simulated mouse. No timer or gamepad reader here. */
export class MenuNavigation {
  private readonly repeat = new DirectionRepeat();
  private readonly lifetime = new AbortController();
  constructor(readonly root: HTMLElement, private readonly cancel: () => void) {
    root.addEventListener('keydown', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editing = !!target.closest('input,select,textarea,[contenteditable="true"]');
      if (event.code === 'Escape' || (event.code === 'KeyI' && !editing)) {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) cancel(); return;
      }
      // Native text/select/range editing keeps its keyboard semantics; gamepad uses explicit steps.
      if (editing) return;
      const direction = ({ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right'} as const)[event.key as 'ArrowUp'];
      if (direction && !target.matches('[role="tab"]')) {
        event.preventDefault(); this.move(direction);
      } else if ((event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') &&
                 target.matches('button,summary,a[href]')) {
        event.preventDefault(); if (!event.repeat) target.click();
      }
    }, {signal:this.lifetime.signal});
  }
  private candidates(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(focusSelector)].filter(node =>
      node.getClientRects().length > 0 && !node.closest('[hidden],[inert]') &&
      !node.matches(':disabled') && node.getAttribute('aria-disabled') !== 'true');
  }
  private focus(node: HTMLElement): void {
    node.focus({preventScroll:true});
    node.scrollIntoView({block:'nearest', inline:'nearest'});
  }
  private adjust(node: HTMLElement, direction: Direction): boolean {
    const delta = direction === 'right' ? 1 : -1;
    if (node instanceof HTMLSelectElement) {
      let index = node.selectedIndex;
      const group = node.dataset.exclusiveGroup;
      const occupied = new Set(group ? [...this.root.querySelectorAll<HTMLSelectElement>('select[data-exclusive-group]')]
        .filter(other => other !== node && other.dataset.exclusiveGroup === group && other.value !== '-1').map(other => other.value) : []);
      do { index += delta; } while (index >= 0 && index < node.options.length &&
        (node.options[index]!.disabled || occupied.has(node.options[index]!.value)));
      if (index >= 0 && index < node.options.length) { node.selectedIndex = index; node.dispatchEvent(new Event('change',{bubbles:true})); }
      return true;
    }
    if (node instanceof HTMLInputElement && node.type === 'range') {
      if (delta > 0) node.stepUp(); else node.stepDown();
      node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return true;
    }
    if (node.matches('[role="tab"]')) {
      node.dispatchEvent(new KeyboardEvent('keydown', {key:direction === 'right' ? 'ArrowRight' : 'ArrowLeft', bubbles:true})); return true;
    }
    return false;
  }
  private move(direction: Direction): void {
    const nodes = this.candidates(); if (!nodes.length) return;
    const focused = document.activeElement;
    if ((direction === 'left' || direction === 'right') && focused instanceof HTMLElement && this.adjust(focused,direction)) return;
    const index = nodes.indexOf(focused as HTMLElement);
    const next = index < 0 ? 0 : Math.max(0, Math.min(nodes.length-1,index+((direction === 'up' || direction === 'left') ? -1 : 1)));
    this.focus(nodes[next]!);
  }
  sample(pad: Readonly<PadInput>, deltaMs: number): void {
    if (pad.cancel || pad.menu) { this.reset(); this.cancel(); return; }
    const direction = this.repeat.sample(pad.direction,deltaMs);
    if (direction) this.move(direction);
    if (pad.interact) {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && this.candidates().includes(focused)) {
        if (focused.matches('button,summary,a[href],input[type="checkbox"]')) focused.click();
        // Selects/ranges use left/right, so no user-gesture-dependent native popup is required.
      } else if (this.candidates()[0]) this.focus(this.candidates()[0]!);
    }
  }
  reset(): void { this.repeat.reset(); }
  dispose(): void { this.reset(); this.lifetime.abort(); }
}
