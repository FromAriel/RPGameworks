// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { SaveCheckpoint, SaveEnvelopeV1, SaveSlotId } from '../../src/domain/save';
import type { SaveRecord } from '../../src/platform/save-repository';
import type { SessionData } from '../../src/domain/session';
import type { SlotView } from '../../src/runtime/save-service';
import type { SaveService } from '../../src/runtime/save-service';
import { createConfirmationDialog, type ConfirmationDialogParts } from '../../src/presentation/ui/components';
import { saveScreen } from '../../src/presentation/menu/save-screen';
import type { MenuScreen, ScreenContext } from '../../src/presentation/menu/screens';

const REFUSAL = 'Cannot save here: the gate beneath you is still closing. Step off it, then save or export again.';

const envelope = (): SaveEnvelopeV1 => ({
  format: 'rpgameworks-save', schemaVersion: 1, gameId: 'demo:game', saveCompatibilityVersion: 1,
  slotId: 'slot-1', storageRevision: 1, savedAt: new Date().toISOString(),
  checkpoint: { mapId: 'demo:map.gallery', tile: { x: 2, y: 7 }, facing: 'down' },
  session: { inventory: {}, facts: {}, placements: {} } as unknown as SessionData,
});

const stubService = (occupied: boolean): { service: SaveService; save: ReturnType<typeof vi.fn> } => {
  const save = vi.fn(async (): Promise<unknown> => ({ kind: 'written' }));
  const record = occupied ? ({ slotId: 'slot-1', current: envelope() } as SaveRecord) : null;
  const slots = vi.fn((): readonly SlotView[] => [{ slotId: 'slot-1' as SaveSlotId, record } as SlotView]);
  const service = {
    slots, refresh: vi.fn(async (): Promise<void> => undefined), save,
    context: { gameId: 'demo:game', saveCompatibilityVersion: 1, index: { schemaVersion: 1, gameId: 'demo:game', saveCompatibilityVersion: 1, maps: [{ id: 'demo:map.gallery', name: 'Gallery', width: 24, height: 14, spawns: [] }], itemIds: [], factIds: [], placementIds: [] } },
  } as unknown as SaveService;
  return { service, save };
};

/** Decision 0016 U2.3c: Save/Load is a menu screen; its save rules are the old dialog's, unchanged. */
function buildMenu(refusal: (checkpoint: SaveCheckpoint) => string | null, service: SaveService): { menu: MenuScreen & { open(): Promise<void> }; confirmation: ConfirmationDialogParts } {
  document.body.replaceChildren();
  const confirmation = createConfirmationDialog('save-confirmation');
  document.body.appendChild(confirmation.dialog);
  const screen = saveScreen({} as ScreenContext, {
    service, sessions: {} as never,
    checkpoint: (): SaveCheckpoint => ({ mapId: 'demo:map.gallery', tile: { x: 2, y: 7 }, facing: 'down' }),
    load: async () => {}, confirmation, clearInputs: () => {}, checkpointReason: refusal, ownerId: 'game-menu',
  });
  document.body.appendChild(screen.element);
  // Opening the screen reads the slots; choosing Slot 1 opens its command window.
  const open = async () => { screen.focusFirst(); await flush(); slotRow().click(); };
  return { menu: Object.assign(screen, { open }), confirmation };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const statusText = (): string => (document.getElementById('save-status') as HTMLElement).textContent ?? '';
const slotRow = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.menu-save-slots .menu-row[data-id="slot-1"]')!;
const saveButton = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.menu-save-commands .menu-row[data-id="save"]')!;
const calls = (save: ReturnType<typeof vi.fn>): unknown[][] => (save as unknown as { mock: { calls: unknown[][] } }).mock.calls;

describe('Save screen refuses an unrestorable checkpoint before spending the overwrite confirmation', () => {
  it('refuses an occupied-slot save before opening the overwrite confirmation', async () => {
    const { service, save } = stubService(true);
    const { menu, confirmation } = buildMenu(() => REFUSAL, service);
    await menu.open();
    saveButton().click(); await flush();
    expect(confirmation.dialog.open).toBe(false); // No overwrite confirmation was requested.
    expect(statusText()).toContain('Cannot save here');
    expect(calls(save)).toHaveLength(0);
  });

  it('confirms and writes exactly the captured checkpoint when valid', async () => {
    const { service, save } = stubService(true);
    const { menu, confirmation } = buildMenu(() => null, service);
    await menu.open();
    saveButton().click(); await flush();
    expect(confirmation.dialog.open).toBe(true);
    confirmation.confirm.click(); await flush();
    expect(calls(save)).toHaveLength(1);
    const [, checkpoint] = calls(save)[0]! as [SaveSlotId, SaveCheckpoint];
    expect(checkpoint.tile).toEqual({ x: 2, y: 7 });
    expect(confirmation.dialog.open).toBe(false);
    expect(statusText()).toContain('Progress saved');
  });

  it('rechecks the captured checkpoint after confirmation and refuses an invalidated one', async () => {
    const { service, save } = stubService(true);
    let invalid = false;
    const { menu, confirmation } = buildMenu(() => invalid ? REFUSAL : null, service);
    await menu.open();
    saveButton().click(); await flush();
    expect(confirmation.dialog.open).toBe(true); // Precheck passed; the player confirmed the overwrite.
    invalid = true; // Checkpoint becomes invalid: the gate close can no longer be restored.
    confirmation.confirm.click(); await flush();
    expect(calls(save)).toHaveLength(0);
    expect(statusText()).toContain('Cannot save here');
  });
});

describe('Save screen slot commands', () => {
  const commands = () => [...document.querySelectorAll<HTMLButtonElement>('.menu-save-commands .menu-row')]
    .map(row => `${row.dataset.id}${row.getAttribute('aria-disabled') === 'true' ? ' (off)' : ''}`);
  it('an empty slot offers Save, with Load and Export shown but unavailable; Cancel closes the window first', async () => {
    const { service } = stubService(false);
    const { menu } = buildMenu(() => null, service);
    await menu.open();
    expect(commands()).toEqual(['save', 'load (off)', 'export (off)']);
    expect(document.activeElement).toBe(saveButton());
    expect(menu.cancel!()).toBe(true); // Cancel closes the command window and returns to the slot…
    expect(document.querySelector<HTMLElement>('.menu-save-commands')!.hidden).toBe(true);
    expect(document.activeElement).toBe(slotRow());
    expect(menu.cancel!()).toBe(false); // …and then leaves the screen.
  });
  it('a saved slot offers Load and Export, and its row names the place', async () => {
    const { service } = stubService(true);
    const { menu } = buildMenu(() => null, service);
    await menu.open();
    expect(commands()).toEqual(['save', 'load', 'export']);
    expect(slotRow().textContent).toContain('Gallery');
    expect(document.querySelector('.menu-save-detail')!.textContent).toContain('Revision 1');
  });
});
