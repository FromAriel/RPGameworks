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
  // A tapped key that cannot move (blocked by a solid tile) still registers the turn.
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
  await step(page, 'ArrowDown'); // (4,7) opens the row-7 highway (row 6 is balked by the pillar).
  await step(page, 'ArrowRight', 16); // (20,7)
  await step(page, 'ArrowUp', 3); // (20,4), facing the locked storeroom door at (20,3).
  await face(page, 'ArrowUp'); // Blocked direction: a pure turn, no step.
  expect((await snapshot(page)).actorTile).toEqual({ x: 20, y: 4 });
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.storeroom-door');
  expect((await interact(page))).toContain('locked tight'); // Denial reports per deliberate attempt, nothing commits.
  expect((await interact(page))).toContain('locked tight'); // A second attempt reports again and commits nothing.
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']?.opened).toBeUndefined();
  expect((await snapshot(page)).session.inventory['demo:item.brass-key']).toBeUndefined();
  // Retrieve the key from the crate at (22,1) and return.
  await face(page, 'ArrowDown'); await step(page, 'ArrowDown', 2); // Facing walks to (20,5); steps land at (20,7).
  await step(page, 'ArrowRight', 2); // (22,7)
  await step(page, 'ArrowUp', 5); // (22,2)
  await face(page, 'ArrowUp'); // Pure turn against the solid crate.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.key-chest');
  expect((await interact(page))).toContain('brass key');
  expect((await snapshot(page)).session.inventory['demo:item.brass-key']).toBe(1);
  await face(page, 'ArrowDown'); await step(page, 'ArrowDown', 1); // (22,4)
  await face(page, 'ArrowLeft'); await step(page, 'ArrowLeft', 1); // (20,4)
  await face(page, 'ArrowUp'); // Pure turn: the locked door above is solid.
  expect((await snapshot(page)).facing).toBe('up');
  expect((await snapshot(page)).actorTile).toEqual({ x: 20, y: 4 });
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.storeroom-door');
  expect((await interact(page))).toContain('brass key turns'); // The success message, not the denial.
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']?.opened).toBe(true);
  expect((await snapshot(page)).session.inventory['demo:item.brass-key']).toBe(1); // Keys are retained by default.
  await face(page, 'ArrowDown'); // Walk away from the open doorway.
  expect((await snapshot(page)).actorTile).toEqual({ x: 20, y: 5 });
  await face(page, 'ArrowUp'); await deadInteract(page); // Unlocked state has no interaction; nothing opens.
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']?.opened).toBe(true);
});

 test('the switch toggles gate passability, defers its close while occupied, and refuses saving there', async ({ page }) => {
  await openRoom(page, `?map=${GALLERY}`);
  await step(page, 'ArrowDown'); // (4,7)
  await step(page, 'ArrowRight', 9); // (13,7)
  await face(page, 'ArrowUp'); // Pure turn: the switch above is solid.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.gate-switch');
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(false);
  await interact(page); // Gate opens.
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(true);
  await step(page, 'ArrowRight'); // (14,7)
  await step(page, 'ArrowUp'); // Stand inside the open gate at (14,6).
  expect((await snapshot(page)).actorTile).toEqual({ x: 14, y: 6 });
  await face(page, 'ArrowLeft'); // Pure turn: the solid switch is left.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.gallery.gate-switch');
  await interact(page); // Toggle closed while standing inside.
  expect((await snapshot(page)).session.facts['demo:fact.gallery.gate-open']).toBe(false);
  await openSaves(page);
  await slot(page, 0).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Cannot save here'); // Unrestorable checkpoint is refused.
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(page.locator('#save-dialog')).toBeHidden();
  expect((await snapshot(page)).pendingSaveOperations).toBe(0); // Nothing was written.
  await step(page, 'ArrowDown'); // Leaving releases the deferral: the gate closes.
  expect((await snapshot(page)).actorTile).toEqual({ x: 14, y: 7 });
  await face(page, 'ArrowUp'); // The resolidified gate blocks re-entry: pure turn only.
  expect((await snapshot(page)).actorTile).toEqual({ x: 14, y: 7 });
  // Now saving from the neighbouring tile is legitimate, and the checkpoint restores exactly.
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
  expect(after.session.placements['demo:object.gallery.storeroom-door']?.opened).toBeUndefined();
});
