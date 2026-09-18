/** The native dialog owns focus and makes background page controls inert.
 * Actions are handled by the scene input owner, not separate game mutations here.
 */
export class InteractionDialog {
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly page: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly advance: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;

  constructor(readonly element: HTMLDialogElement) {
    const get = <T extends HTMLElement>(selector: string): T => {
      const value = element.querySelector<T>(selector);
      if (!value) throw new Error(`Missing interaction dialog element: ${selector}`);
      return value;
    };
    this.title = get('#dialog-title'); this.text = get('#dialog-text'); this.page = get('#dialog-page');
    this.scroll = get('.dialog-scroll');
    this.advance = get('#dialog-advance'); this.cancel = get('#dialog-cancel');
  }

  show(title: string, text: string, page: string, advanceLabel: string | null, cancelLabel: string): void {
    // Authored content is text, never HTML. Newlines and wrapping are handled by CSS.
    this.title.textContent = title; this.text.textContent = text; this.page.textContent = page;
    this.scroll.scrollTop = 0; // A new page starts at its beginning, not the last page's scroll position.
    this.advance.hidden = advanceLabel === null;
    this.advance.textContent = advanceLabel ?? '';
    this.cancel.textContent = cancelLabel;
    if (!this.element.open) {
      this.element.showModal();
      (advanceLabel ? this.advance : this.cancel).focus({ preventScroll: true });
    } else if (advanceLabel === null && document.activeElement === this.advance) {
      this.cancel.focus({ preventScroll: true });
    }
  }
  close(): void { if (this.element.open) this.element.close(); }
}
