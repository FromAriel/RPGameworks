/**
 * Save/Load (decision 0016 U2.3c): three slot rows, a detail window for the highlighted slot, and a Files window
 * (import, load an import, export the current session, refresh). Choosing a slot opens a small command window with what
 * that slot allows: Save, Load, Export, and Recover previous or Import here when they apply.
 *
 * The rules are those of the old Save/Load dialog, unchanged: destructive actions ask in the shared confirmation
 * window, the service rechecks staleness after confirming, a save checkpoint is refused before and after confirming,
 * the confirmation stores exactly the previewed import, and nothing late runs after the screen is disposed.
 */
import type { SaveCheckpoint, SaveEnvelopeV1, SaveSlotId } from '../../domain/save';
import { createEnvelope, formatPlayTime } from '../../domain/save';
import type { PadInput } from '../../platform/gamepad-model';
import type { SessionController } from '../../runtime/session-controller';
import type { SaveService, SlotView } from '../../runtime/save-service';
import type { ConfirmationController, ConfirmationDialogParts, UiStatusKind } from '../ui/components';
import { mountConfirmation, mountStatus } from '../ui/components';
import { MenuNavigation } from '../ui/menu-navigation';
import { createDetail, createList, menuWindow, type ListEntry } from './blocks';
import type { MenuScreen, ScreenContext } from './screens';

export const SAVE_SCREEN = 'builtin:save';
/** The theme's skin surface for saving (ui-theme.json "saves"), as the old Save/Load dialog used. */
const SURFACE = 'saves';

export interface SaveScreenOptions {
  readonly service: SaveService;
  readonly sessions: SessionController;
  readonly checkpoint: () => SaveCheckpoint;
  readonly load: (envelope: SaveEnvelopeV1) => Promise<void>;
  readonly confirmation: ConfirmationDialogParts;
  /** Clears held game and menu input at each confirmation boundary. */
  readonly clearInputs: () => void;
  /** Why a checkpoint cannot be saved (standing on a closing gate), or null. */
  readonly checkpointReason?: (checkpoint: SaveCheckpoint) => string | null;
  /** The menu layer's id: a pending confirmation keeps controller polling alive for its owner only. */
  readonly ownerId: string;
}

type SlotAction = 'save' | 'load' | 'export' | 'recover' | 'import';
interface SlotRequest { readonly title: string; readonly body: string; readonly confirmLabel: string }
const ACTION_LABELS: Record<SlotAction, string> = { save: 'Save', load: 'Load', export: 'Export', recover: 'Recover previous', import: 'Import here' };
const slotNumber = (slotId: SaveSlotId) => Number(slotId.replace('slot-', ''));

export function saveScreen(_context: ScreenContext, options: SaveScreenOptions): MenuScreen {
  return new SaveScreen(options);
}

class SaveScreen implements MenuScreen {
  readonly element = document.createElement('div');
  private readonly status: ReturnType<typeof mountStatus>;
  private readonly slots;
  private readonly detail = createDetail();
  private readonly commandWindow;
  private readonly commands;
  private readonly files;
  private readonly fileInput = document.createElement('input');
  private readonly confirmation: ConfirmationController;
  private readonly confirmationNav: MenuNavigation;
  /** Held X/B re-edge after a modal-boundary reset, so sampling waits for one neutral pad frame. */
  private armed = true;
  private disposed = false;
  private busy = false;
  private imported: SaveEnvelopeV1 | null = null;
  /** The slot whose command window is open. */
  private chosen: SaveSlotId | null = null;

  constructor(private readonly options: SaveScreenOptions) {
    this.element.className = 'menu-save';
    const statusWindow = menuWindow({ box: { x: 0, y: 0, w: 640, h: 50 }, className: 'menu-help menu-save-status', surface: SURFACE });
    const slotsWindow = menuWindow({ title: 'Save / Load', box: { x: 0, y: 50, w: 380, h: 220 }, className: 'menu-save-slots', surface: SURFACE });
    const detailWindow = menuWindow({ box: { x: 380, y: 50, w: 260, h: 220 }, className: 'menu-save-detail', surface: SURFACE });
    this.commandWindow = menuWindow({ title: 'Slot', box: { x: 196, y: 96, w: 176, h: 128 }, className: 'menu-save-commands', surface: SURFACE });
    const filesWindow = menuWindow({ title: 'Files', box: { x: 0, y: 270, w: 640, h: 90 }, className: 'menu-save-files', surface: SURFACE });
    this.commandWindow.element.hidden = true;

    const statusLine = document.createElement('p');
    statusLine.id = 'save-status';
    statusWindow.body.append(statusLine);
    this.status = mountStatus(statusLine);

    this.slots = createList({ label: 'Save slots', entries: [], onChoose: id => this.openCommands(id as SaveSlotId), onFocus: id => this.describe(id as SaveSlotId) });
    this.commands = createList({ label: 'Slot commands', entries: [], onChoose: id => void this.act(id as SlotAction) });
    this.files = createList({ label: 'Files', entries: [], onChoose: id => this.file(id) });
    this.fileInput.type = 'file'; this.fileInput.id = 'save-import'; this.fileInput.accept = 'application/json,.json'; this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => void this.acceptImport());
    slotsWindow.body.append(this.slots.element);
    detailWindow.body.append(this.detail.element);
    this.commandWindow.body.append(this.commands.element);
    filesWindow.body.append(this.files.element, this.fileInput);
    this.element.append(statusWindow.element, slotsWindow.element, detailWindow.element, filesWindow.element, this.commandWindow.element);

    this.confirmationNav = new MenuNavigation(options.confirmation.dialog, () => options.confirmation.cancel.click());
    // The input gate lets a pending confirmation supersede polling only for this owner.
    options.confirmation.dialog.dataset.ownerModal = options.ownerId;
    this.confirmation = mountConfirmation(options.confirmation, {
      clearHeldInputs: () => options.clearInputs(),
      onOpen: () => { this.armed = false; },
      onClose: () => { this.armed = false; },
    });
    this.renderFiles();
  }

  focusFirst(): void {
    this.render();
    this.slots.focus(0);
    void this.refresh();
  }

  /** Controller input while a confirmation is pending (or right after one) belongs to the confirmation alone. */
  sample(pad: Readonly<PadInput>, deltaMs: number): boolean {
    if (!this.confirmation.pending && this.armed) return false;
    // One neutral frame re-arms sampling after each modal boundary; until then a held X/B (which re-edges after a
    // reset) can neither drive the confirmation nor the screen below.
    if (this.confirmation.pending && this.armed) this.confirmationNav.sample(pad, deltaMs);
    else if (!pad.direction && !pad.interact && !pad.cancel && !pad.menu && !pad.burst) this.armed = true;
    return true;
  }

  cancel(): boolean {
    if (this.confirmation.pending) return true;
    if (this.chosen) { this.closeCommands(); return true; }
    return false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.confirmationNav.dispose(); this.confirmation.dispose(); this.status.dispose();
    this.element.remove();
  }

  private set(kind: UiStatusKind, message: string): void { this.status.set(kind, message); }

  private place(slot: SlotView): string {
    const mapId = slot.record?.current.checkpoint.mapId;
    return this.options.service.context.index.maps.find(map => map.id === mapId)?.name ?? mapId ?? '';
  }
  private slotEntries(): ListEntry[] {
    return this.options.service.slots().map(slot => {
      const n = slotNumber(slot.slotId);
      const detail = slot.error ? 'Invalid' : slot.record ? this.place(slot) : 'Empty';
      return { id: slot.slotId, label: `Slot ${n}`, detail, help: slot.error ? `Invalid: ${slot.error}` : slot.record ? `${this.place(slot)}, saved ${new Date(slot.record.current.savedAt).toLocaleString()}` : 'Empty. Choose it to save here.' };
    });
  }
  private render(): void {
    this.slots.setEntries(this.slotEntries());
    this.describe((this.slots.focusedId ?? this.chosen ?? 'slot-1') as SaveSlotId);
    if (this.chosen) this.renderCommands(this.chosen);
  }
  private describe(slotId: SaveSlotId): void {
    const slot = this.options.service.slots().find(s => s.slotId === slotId);
    const heading = `Slot ${slotNumber(slotId)}`;
    if (!slot) { this.detail.set({ heading, lines: ['Reading local save slots…'] }); return; }
    if (slot.error) { this.detail.set({ heading, lines: [`Invalid: ${slot.error}`, ...(slot.recoverable ? ['A previous revision can be recovered.'] : [])] }); return; }
    if (!slot.record) { this.detail.set({ heading, lines: ['Empty.', 'Load and Export are unavailable.'] }); return; }
    const record = slot.record.current;
    const played = record.schemaVersion === 3 ? [`Play time ${formatPlayTime(record.session.playTime ?? 0)}`] : [];
    this.detail.set({ heading, lines: [this.place(slot), ...played, `Saved ${new Date(record.savedAt).toLocaleString()}`, `Revision ${record.storageRevision}`, ...(slot.recoverable ? ['A previous revision can be recovered.'] : [])] });
  }

  private renderFiles(): void {
    this.files.setEntries([
      { id: 'import', label: 'Import file…', help: 'Choose a save file (click or Enter).' },
      { id: 'load-import', label: 'Load import', enabled: !!this.imported, help: this.imported ? 'Play the validated import now, without storing it.' : 'Import a file first.' },
      { id: 'export-current', label: 'Export current session', help: 'Download the current progress as a file.' },
      { id: 'refresh', label: 'Refresh slots', help: 'Read the slots again (another tab may have saved).' },
    ]);
  }
  private file(id: string): void {
    if (this.disposed || this.busy || this.confirmation.pending) return;
    if (id === 'import') this.fileInput.click();
    else if (id === 'load-import') void this.loadImported();
    else if (id === 'export-current') this.exportCurrent();
    else if (id === 'refresh') void this.refresh();
  }

  private renderCommands(slotId: SaveSlotId): void {
    const slot = this.options.service.slots().find(s => s.slotId === slotId);
    const occupied = !!slot && !slot.error && !!slot.record;
    const actions: SlotAction[] = ['save', 'load', 'export', ...(slot?.recoverable ? ['recover' as const] : []), ...(this.imported ? ['import' as const] : [])];
    this.commands.setEntries(actions.map(action => ({
      id: action, label: ACTION_LABELS[action],
      enabled: (action !== 'load' && action !== 'export') || occupied,
      ...((action === 'load' || action === 'export') && !occupied ? { help: 'This slot is empty.' } : {}),
    })));
  }
  private openCommands(slotId: SaveSlotId): void {
    if (this.disposed || this.busy || this.confirmation.pending || !this.options.service.slots().some(s => s.slotId === slotId)) return;
    this.chosen = slotId;
    this.commandWindow.element.querySelector('h2')!.textContent = `Slot ${slotNumber(slotId)}`;
    this.commandWindow.element.setAttribute('aria-label', `Slot ${slotNumber(slotId)}`);
    this.renderCommands(slotId);
    this.commandWindow.element.hidden = false;
    this.commands.focus();
  }
  private closeCommands(): void {
    const slotId = this.chosen;
    this.chosen = null;
    this.commandWindow.element.hidden = true;
    if (slotId) this.slots.focus(slotId);
  }

  private async refresh(): Promise<void> {
    if (this.disposed || this.busy) return;
    this.busy = true; this.set('pending', 'Reading local save slots…');
    try {
      await this.options.service.refresh();
      if (this.disposed) return;
      this.render();
      this.set('information', this.imported ? 'Import ready. Choose a slot, then “Import here”.' : 'Three manual slots. Choose one to save, load or export.');
    } catch (error) {
      if (this.disposed) return;
      this.slots.setEntries([]);
      this.set('failure', `Local saves unavailable: ${error instanceof Error ? error.message : String(error)}. You can still export current progress or load a valid import for this session.`);
      this.files.focus('export-current');
    } finally { this.busy = false; }
  }

  /** The confirmation names the exact slot, consequence and previewed payload; the service rechecks staleness after it. */
  private request(action: SlotAction, slotId: SaveSlotId, imported: SaveEnvelopeV1 | null): SlotRequest {
    const n = slotNumber(slotId);
    if (action === 'save') return { title: `Replace Slot ${n}?`, body: `Saving replaces the stored record in Slot ${n} with current progress.`, confirmLabel: `Save to Slot ${n}` };
    if (action === 'load') return { title: `Load Slot ${n}?`, body: `Loading replaces the running session with the Slot ${n} record. Unsaved progress is lost.`, confirmLabel: `Load Slot ${n}` };
    if (action === 'import') {
      const revision = imported?.storageRevision ?? '?', saved = imported ? new Date(imported.savedAt).toISOString() : '?';
      return { title: `Replace Slot ${n}?`, body: `Importing replaces the stored record in Slot ${n} with the validated import (revision ${revision}, saved ${saved}).`, confirmLabel: `Import to Slot ${n}` };
    }
    return { title: `Recover Slot ${n}?`, body: `Recovery replaces the current revision in Slot ${n} with its previous valid revision.`, confirmLabel: `Recover Slot ${n}` };
  }
  private async confirm(request: SlotRequest): Promise<boolean> {
    const confirmed = await this.confirmation.confirm({ ...request, intent: 'danger' });
    return this.disposed ? false : confirmed;
  }

  private async act(action: SlotAction): Promise<void> {
    const slotId = this.chosen;
    if (!slotId || this.disposed || this.busy || this.confirmation.pending) return;
    const service = this.options.service;
    const occupied = !!service.slots().find(slot => slot.slotId === slotId)?.record;
    // Snapshot now: whatever the confirmation previews is exactly what it stores.
    const importedSnapshot = action === 'import' ? this.imported : null;
    // Capture the checkpoint once and refuse it BEFORE any overwrite confirmation, so a player on a closing gate never
    // confirms a save that cannot happen.
    const checkpoint = action === 'save' ? this.options.checkpoint() : null;
    const preRefusal = checkpoint ? this.options.checkpointReason?.(checkpoint) ?? null : null;
    if (preRefusal) { this.set('failure', preRefusal); return; }
    if ((action === 'save' && occupied) || action === 'load' || action === 'import' || action === 'recover') {
      if (!await this.confirm(this.request(action, slotId, importedSnapshot))) { if (!this.disposed) this.set('information', 'Action cancelled. Nothing was changed.'); return; }
      if (this.disposed) return;
    }
    this.busy = true;
    try {
      if (action === 'save') {
        // Confirmation cannot authorize an invalid checkpoint: recheck the captured payload just before writing.
        const postRefusal = checkpoint && this.options.checkpointReason?.(checkpoint);
        if (postRefusal) { this.set('failure', postRefusal); return; }
        const result = await service.save(slotId, checkpoint!, this.options.sessions.current);
        if (result.kind === 'written') this.set('success', 'Progress saved.');
        else if (result.kind === 'stale') this.set('warning', 'Another tab changed this slot. Slot details were refreshed; review before trying again.');
        else this.set('failure', `Save failed (${result.reason}): ${result.message}`);
      } else if (action === 'load') {
        await this.options.load(await service.load(slotId));
        if (!this.disposed) this.set('success', 'Save loaded.');
        return; // A successful load returns to the game.
      } else if (action === 'export') {
        const envelope = await service.load(slotId);
        if (this.disposed) return;
        this.download(envelope); this.set('success', 'Save exported.');
      } else if (action === 'import' && importedSnapshot) {
        const result = await service.storeImport(slotId, importedSnapshot);
        if (this.disposed) return;
        if (result.kind === 'written') {
          this.set('success', 'Import stored. Load the slot when ready.');
          if (this.imported === importedSnapshot) { this.imported = null; this.renderFiles(); }
        } else if (result.kind === 'stale') this.set('warning', 'Another tab changed this slot. Review it before importing again.');
        else this.set('failure', `Import failed (${result.reason}): ${result.message}`);
      } else if (action === 'recover') {
        const result = await service.recover(slotId);
        if (result.kind === 'written') this.set('success', 'Previous valid revision recovered.');
        else if (result.kind === 'stale') this.set('warning', 'Another tab changed this slot; recovery was not applied.');
        else this.set('failure', `Recovery failed: ${result.message}`);
      }
      if (this.disposed) return;
      this.render(); this.closeCommands(); // Back to the slot, which now shows the result.
    } catch (error) {
      if (!this.disposed) this.set('failure', error instanceof Error ? error.message : String(error));
    } finally { this.busy = false; }
  }

  private async acceptImport(): Promise<void> {
    const file = this.fileInput.files?.[0];
    this.fileInput.value = '';
    if (!file || this.disposed || this.busy || this.confirmation.pending) return;
    try {
      const envelope = this.options.service.import(new Uint8Array(await file.arrayBuffer()));
      if (this.disposed) return;
      this.imported = envelope;
      this.renderFiles(); this.render();
      this.set('information', 'Import validated. Choose a slot, then “Import here”, or load it for this session.');
    } catch (error) {
      if (this.disposed) return;
      this.imported = null; this.renderFiles(); this.render();
      this.set('failure', `Import rejected: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private async loadImported(): Promise<void> {
    if (this.disposed || !this.imported || this.busy || this.confirmation.pending) return;
    const snapshot = this.imported; // The confirmed payload is the previewed one, even if another read lands mid-dialog.
    if (!await this.confirm({ title: 'Replace the running session?', body: 'Loading the validated import replaces current unsaved progress and is not stored in a slot.', confirmLabel: 'Load import' })) {
      if (!this.disposed) this.set('information', 'Action cancelled. Nothing was changed.');
      return;
    }
    if (this.disposed) return;
    this.busy = true;
    try { await this.options.load(snapshot); if (!this.disposed) this.set('success', 'Save loaded.'); }
    catch (error) { if (!this.disposed) this.set('failure', error instanceof Error ? error.message : String(error)); }
    finally { this.busy = false; }
  }
  private exportCurrent(): void {
    try {
      const checkpoint = this.options.checkpoint();
      const refusal = this.options.checkpointReason?.(checkpoint) ?? null;
      if (refusal) { this.set('failure', refusal); return; }
      this.download(createEnvelope('slot-1', 1, this.options.service.context, checkpoint, this.options.sessions.current));
      this.set('success', 'Current session exported. It was not written to a local slot.');
    } catch (error) { this.set('failure', error instanceof Error ? error.message : String(error)); }
  }
  private download(envelope: SaveEnvelopeV1): void {
    const blob = new Blob([this.options.service.exportText(envelope)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `${envelope.gameId.replace(':', '-')}-${envelope.slotId}-r${envelope.storageRevision}.json`;
    link.click(); queueMicrotask(() => URL.revokeObjectURL(url));
  }
}
