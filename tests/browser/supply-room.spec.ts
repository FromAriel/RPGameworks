import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot } from './helpers';

const WORKSHOP = 'demo:map.workshop';
const SUPPLY = 'demo:map.supply-room';
const doorId = 'demo:object.workshop.supply-door';
const dialog = '#interaction-dialog';

async function step(page: Page, key: string, times = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
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
async function interact(page: Page): Promise<string> {
  await page.keyboard.down('KeyE');
  await expect(page.locator(dialog)).toBeVisible();
  await page.keyboard.up('KeyE');
  const message = await page.locator('#dialog-text').textContent() ?? '';
  await page.keyboard.press('Escape');
  await expect(page.locator(dialog)).not.toBeVisible();
  return message;
}
async function approachLockedDoor(page: Page): Promise<void> {
  await openRoom(page, `?map=${WORKSHOP}&spawn=from-supply-room`);
  await step(page, 'ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await snapshot(page)).actorTile).toEqual({ x: 2, y: 6 });
  expect((await snapshot(page)).interactionTarget).toBe(doorId);
}

test('the Workshop lock denies travel without requesting the supply room, then keeps its own key', async ({ page }) => {
  let requests = 0, failNext = false;
  await page.route('**/generated/content/maps/supply-room.*.json', route => {
    requests += 1;
    if (failNext) { failNext = false; return route.fulfill({ status: 503, body: 'Unavailable' }); }
    return route.continue();
  });
  await approachLockedDoor(page);
  expect(await interact(page)).toContain('locked');
  expect(requests).toBe(0);
  expect((await snapshot(page)).mapId).toBe(WORKSHOP);
  await step(page, 'ArrowRight', 3); // (5,6)
  await step(page, 'ArrowUp', 2); // (5,4), chest above
  await page.keyboard.press('ArrowUp');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.workshop.supply-key-chest');
  expect(await interact(page)).toContain('Workshop key');
  expect((await snapshot(page)).session.inventory['demo:item.workshop-key']).toBe(1);
  await step(page, 'ArrowDown', 2);
  await step(page, 'ArrowLeft', 3);
  await page.keyboard.press('ArrowLeft');
  expect(await interact(page)).toContain('Workshop key turns');
  expect((await snapshot(page)).session.placements[doorId]?.opened).toBe(true);
  expect((await snapshot(page)).session.inventory['demo:item.workshop-key']).toBe(1);
  expect((await snapshot(page)).session.placements['demo:object.gallery.storeroom-door']).toBeUndefined();
  failNext = true;
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('transition-error');
  await page.keyboard.up('ArrowLeft');
  expect((await snapshot(page)).session.placements[doorId]?.opened).toBe(true);
  expect((await snapshot(page)).mapId).toBe(WORKSHOP);
  await page.locator('#dialog-advance').click();
  await expect.poll(async () => (await snapshot(page)).mapId).toBe(SUPPLY);
  expect((await snapshot(page)).actorTile).toEqual({ x: 4, y: 3 });
  await step(page, 'ArrowRight');
  expect((await snapshot(page)).actorTile).toEqual({ x: 5, y: 3 });
  expect((await snapshot(page)).mapId).toBe(SUPPLY);
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await snapshot(page)).mapId).toBe(WORKSHOP);
  await page.keyboard.up('ArrowRight');
  expect((await snapshot(page)).actorTile).toEqual({ x: 3, y: 6 });
  await step(page, 'ArrowLeft');
  expect((await snapshot(page)).actorTile).toEqual({ x: 2, y: 6 });
  expect((await snapshot(page)).mapId).toBe(WORKSHOP);
});

test('the supply-room return door is visible and its arrival stays inside the room', async ({ page }) => {
  await openRoom(page, `?map=${SUPPLY}`);
  const state = await snapshot(page);
  expect(state.mapId).toBe(SUPPLY);
  expect(state.actorTile).toEqual({ x: 4, y: 3 });
  expect(state.exits).toBe(1);
  await step(page, 'ArrowRight');
  expect((await snapshot(page)).mapId).toBe(SUPPLY);
});
