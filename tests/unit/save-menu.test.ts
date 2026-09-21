// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { SaveCheckpoint, SaveEnvelopeV1, SaveSlotId } from '../../src/domain/save';
import type { SaveRecord } from '../../src/platform/save-repository';
import type { SessionData } from '../../src/domain/session';
import type { SlotView } from '../../src/runtime/save-service';
import type { SaveService } from '../../src/runtime/save-service';
import { createConfirmationDialog, type ConfirmationDialogParts } from '../../src/presentation/ui/components';
import { SaveMenu } from '../../src/presentation/ui/save-menu';

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

function buildMenu(refusal: (checkpoint: SaveCheckpoint) => string | null, service: SaveService): { menu: SaveMenu; confirmation: ConfirmationDialogParts } {
  document.body.replaceChildren();
  const dialog = document.createElement('dialog'); dialog.id = 'save-dialog';
  const status = document.createElement('div'); status.id = 'save-status';
  const slots = document.createElement('div'); slots.id = 'save-slots';
  for (const id of ['save-close', 'save-refresh', 'save-export-current', 'save-load-import']) {
    const button = document.createElement('button'); button.id = id; dialog.appendChild(button);
  }
  const input = document.createElement('input'); input.id = 'save-import'; input.type = 'file'; dialog.appendChild(input);
  dialog.append(status, slots);
  document.body.appendChild(dialog);
  const confirmation = createConfirmationDialog('save-confirmation');
  document.body.appendChild(confirmation.dialog);
  const menu = new SaveMenu(dialog, service, {} as never,
    (): SaveCheckpoint => ({ mapId: 'demo:map.gallery', tile: { x: 2, y: 7 }, facing: 'down' }),
    async () => {}, () => {},
    confirmation, () => {},
    refusal);
  return { menu, confirmation };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const statusText = (): string => (document.getElementById('save-status') as HTMLElement).textContent ?? '';
const saveButton = (): HTMLButtonElement => (document.getElementById('save-slots') as HTMLElement).querySelector<HTMLButtonElement>('button[data-slot-action="save"][data-slot="slot-1"]')!;
const calls = (save: ReturnType<typeof vi.fn>): unknown[][] => (save as unknown as { mock: { calls: unknown[][] } }).mock.calls;

describe('SaveMenu refuses an unrestorable checkpoint before spending the overwrite confirmation', () => {
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
