import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot } from './helpers';

const GALLERY = 'demo:map.gallery';
const dialog = '#interaction-dialog';

async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    // Observe the real handoff; never focus the stage or bypass gameplay from this helper.
    await expect(page.locator(dialog)).not.toBeVisible();
    await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
    await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(false);
  }
}
async function face(page: Page, key: string): Promise<void> {
  // Facing is one gesture with movement: a walkable direction walks a tile; a solid one only turns.
  await page.keyboard.down(key);
  await page.waitForTimeout(120);
  await page.keyboard.up(key);
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
}
async function interact(page: Page): Promise<string> {
  await expect(page.locator(dialog)).not.toBeVisible();
  await page.keyboard.down('KeyE');
  await expect(page.locator(dialog)).toBeVisible();
  await page.keyboard.up('KeyE');
  const text = await page.locator('#dialog-text').textContent();
  await page.keyboard.press('Escape');
  await expect(page.locator(dialog)).not.toBeVisible();
  await expect(page.locator('#stage')).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  return text ?? '';
}
async function deadInteract(page: Page): Promise<void> {
  // An unlocked state has no interaction: a press must not open the message window.
  await expect(page.locator(dialog)).not.toBeVisible();
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyE');
  await expect(page.locator(dialog)).not.toBeVisible();
}
async function openSaves(page: Page): Promise<void> {
  await page.keyboard.press('KeyI');
  await expect(page.locator('#inventory-dialog')).toBeVisible();
  await page.locator('#inventory-saves').click();
  await expect(page.locator('#save-dialog')).toBeVisible();
  await expect(page.locator('#save-slots .save-slot')).toHaveCount(3);
}
const slot = (page: Page, index: number) => page.locator('#save-slots .save-slot').nth(index);
async function confirmLoad(page: Page, index: number): Promise<void> {
  await slot(page, index).getByRole('button', { name: 'Load', exact: true }).click();
  const confirmation = page.locator('#save-confirmation');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await confirmation.getByRole('button', { name: `Load Slot ${index + 1}`, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

 test('a locked storeroom denies twice without the key and unlocks with it, keeping the key', async ({ page }) => {
  await openRoom(page, `?map=${GALLERY}`);
  await step(page, 'ArrowDown'); // (4,7)
  await step(page, 'ArrowRight', 7); // (11,7)
  await step(page, 'ArrowUp', 2); // (11,5)
  await face(page, 'ArrowRight'); // Pure turn: the lever on the wall face at (12,5) is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.gate-switch');
  await interact(page); // The east wing gate opens.
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(true);
  await face(page, 'ArrowDown'); // Walks to (11,6).
  await face(page, 'ArrowRight'); // Walks through the open gate onto (12,6).
  expect((await snapshot(page)).actorTile).toEqual({ x: 12, y: 6 });
  await face(page, 'ArrowRight'); await step(page, 'ArrowRight', 9); // (22,6)
  await step(page, 'ArrowUp', 4); // (22,2)
  await face(page, 'ArrowUp'); // Pure turn: the crate above is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.key-chest');
  expect((await interact(page))).toContain('brass key');
  expect((await snapshot(page)).session.inventory['demo:item.brass-key']).toBe(1);
  await face(page, 'ArrowLeft'); await step(page, 'ArrowLeft', 1); // (20,2) — facing walks to (21,2), the step lands on (20,2)
  await face(page, 'ArrowDown'); // Pure turn: the locked storeroom door below is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.storeroom-door');
  // The interact path below denied without the key in the parallel scenario; it must succeed now.
  expect((await interact(page))).toContain('brass key turns'); // The success message, not the denial.
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']?.opened).toBe(true);
  expect((await snapshot(page)).session.inventory['demo:item.brass-key']).toBe(1); // Keys are retained by default.
  await face(page, 'ArrowDown'); await deadInteract(page); // Unlocked state has no interaction; nothing opens.
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']?.opened).toBe(true);
});

 test('the gate blocks the crossing while closed, opens with the lever, defers its close when occupied, and refuses saving there', async ({ page }) => {
  await openRoom(page, `?map=${GALLERY}`);
  await step(page, 'ArrowDown'); // (4,7)
  await step(page, 'ArrowRight', 7); // (11,7)
  await step(page, 'ArrowUp'); // (11,6), the crossing boundary west of the gate.
  await face(page, 'ArrowRight'); // Pure turn: the closed gate blocks (no authored bypass across row 7 or row 1).
  const closed = await snapshot(page);
  expect(closed.actorTile).toEqual({ x: 11, y: 6 });
  expect(closed.interactionTarget).toBeNull(); // The closed gate is passability only, not an interaction.
  expect(closed.session.facts['demo:fact.gallery.gate-open']).toBe(false);
  await face(page, 'ArrowUp'); await face(page, 'ArrowDown'); // Reorient without crossing.
  expect((await snapshot(page)).actorTile).toEqual({ x: 11, y: 6 });
  // Open via the lever on the wall face.
  await step(page, 'ArrowUp'); // (11,5)
  await face(page, 'ArrowRight');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.gate-switch');
  await interact(page);
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(true);
  await face(page, 'ArrowDown'); // (11,6)
  await face(page, 'ArrowRight'); // Stand on the open gate cell (12,6).
  expect((await snapshot(page)).actorTile).toEqual({ x: 12, y: 6 });
  await face(page, 'ArrowUp'); // Pure turn to the lever above; toggle closed while standing inside.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.gate-switch');
  await interact(page);
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(false); // Close deferred (occupied).
  await openSaves(page);
  await slot(page, 0).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Cannot save here'); // Unrestorable checkpoint is refused.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#save-dialog')).toBeHidden();
  expect((await snapshot(page)).pendingSaveOperations).toBe(0); // Nothing was written.
  await face(page, 'ArrowLeft'); // Walk off west; the arrival releases the deferral and the gate closes.
  expect((await snapshot(page)).actorTile).toEqual({ x: 11, y: 6 });
  await face(page, 'ArrowRight'); // The resolidified gate blocks re-entry: pure turn only.
  expect((await snapshot(page)).actorTile).toEqual({ x: 11, y: 6 });
  // Now saving from the neighbour tile is legitimate, and the checkpoint restores exactly.
  await openSaves(page);
  await slot(page, 0).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Progress saved');
  const tile = (await snapshot(page)).actorTile;
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(false);
  await openSaves(page);
  await confirmLoad(page, 0);
  await expect(page.locator('#save-dialog')).toBeHidden();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  const after = await snapshot(page);
  expect(after.actorTile).toEqual(tile); // Exact-tile restoration.
  expect(after.session.facts['demo:fact.gallery.gate-open']).toBe(false);
  await face(page, 'ArrowRight'); // The restored closed gate still blocks the crossing.
  expect((await snapshot(page)).actorTile).toEqual(tile);
});