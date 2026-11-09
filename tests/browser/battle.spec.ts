import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot } from './helpers';

const SUPPLY = 'demo:map.supply-room';
const encounter = 'demo:encounter.practice-sigil';
const TONIC = 'demo:item.tonic';

async function step(page: Page, key: string): Promise<void> {
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.down(key);
  try { await expect.poll(async () => (await snapshot(page)).moving, { intervals: [10] }).toBe(true); }
  finally { await page.keyboard.up(key); }
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
}

async function approach(page: Page, open = true): Promise<void> {
  if (open) await openRoom(page, `?map=${SUPPLY}`);
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).actorTile.x).toBe(3);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).moving).toBe(false);
  await page.keyboard.press('ArrowLeft');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.practice-sigil');
}

async function enter(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(encounter);
}

/** The faster Sigil Shard acts before the hero: the opening hit is shown first and needs Continue. */
async function pastOpening(page: Page): Promise<void> {
  expect((await snapshot(page)).battle).toMatchObject({ phase: 'command', review: true, turn: 1 });
  await expect(page.locator('#interaction-dialog')).toContainText('Sigil Shard hits Hero for 1.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => (await snapshot(page)).battle?.review).toBe(false);
}

test('timeline battle resolves commands first, previews turn order, and restores exploration focus', async ({ page }) => {
  await approach(page);
  const before = (await snapshot(page)).session;
  await enter(page);
  await pastOpening(page);
  const opening = (await snapshot(page)).battle!;
  expect(opening).toMatchObject({ active: 'hero', hp: { hero: 29, sigil: 20, shard: 10 } });
  expect(opening.timeline.slice(0, 3)).toEqual(['hero', 'sigil', 'shard']);
  await expect(page.locator('#interaction-dialog')).toContainText('Next: Hero → Practice Sigil → Sigil Shard');
  await expect(page.getByRole('button', { name: /Use Workshop tonic/ })).toHaveCount(0); // None carried yet.
  await page.getByRole('button', { name: 'Attack Sigil Shard' }).click();
  expect((await snapshot(page)).battle).toMatchObject({ review: true, hp: { hero: 25, shard: 4 } });
  await expect(page.locator('#interaction-dialog')).toContainText('Hero hits Sigil Shard for 6.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Attack Sigil Shard' }).click();
  await expect(page.locator('#interaction-dialog')).toContainText('Sigil Shard is defeated.');
  await expect.poll(async () => (await snapshot(page)).activeEffects).toBe(0);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('button', { name: 'Attack Sigil Shard' })).toHaveCount(0); // Defeated targets are not offered.
  for (let turns = 0; turns < 8 && (await snapshot(page)).battle?.phase !== 'victory'; turns++) {
    await page.getByRole('button', { name: 'Attack Practice Sigil' }).click();
    if ((await snapshot(page)).battle?.phase === 'command') await page.getByRole('button', { name: 'Continue' }).click();
  }
  expect((await snapshot(page)).battle?.phase).toBe('victory');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});

test('a carried tonic is spent atomically in battle and stays spent after escaping', async ({ page }) => {
  await openRoom(page, `?map=${SUPPLY}`);
  await step(page, 'ArrowUp'); await step(page, 'ArrowUp'); // (4,3) → (4,1)
  // The crate at (5,1) is solid, so holding Right only turns to face it.
  await page.keyboard.down('ArrowRight');
  try { await expect.poll(async () => (await snapshot(page)).interactionTarget).toBe('demo:object.supply-room.tonic-crate'); }
  finally { await page.keyboard.up('ArrowRight'); }
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toContainText('Two Workshop tonics');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).session.inventory[TONIC]).toBe(2);
  await step(page, 'ArrowDown'); await step(page, 'ArrowDown'); // Back to (4,3).
  await approach(page, false);
  await enter(page);
  await pastOpening(page);
  await page.getByRole('button', { name: 'Use Workshop tonic (2)' }).click();
  await expect(page.locator('#interaction-dialog')).toContainText('Hero uses Workshop tonic: Hero recovers 1 HP.');
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
  await page.getByRole('button', { name: 'Continue' }).click();
  const full = page.getByRole('button', { name: 'Use Workshop tonic (1)' });
  if ((await snapshot(page)).battle?.hp.hero === 30) await expect(full).toBeDisabled();
  await page.getByRole('button', { name: 'Escape' }).click();
  expect((await snapshot(page)).battle?.phase).toBe('escaped');
  await page.getByRole('button', { name: 'Return to room' }).click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
});

test('failed catalog load leaves the room playable', async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await approach(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toContainText('could not load');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  expect((await snapshot(page)).mapId).toBe(SUPPLY);
});

test('narrow battle supports controller cancel and pointer Escape without owned-resource growth', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'getGamepads', {
    configurable: true, value: () => [(window as typeof window & { __BATTLE_PAD__?: unknown }).__BATTLE_PAD__ ?? null],
  }));
  await approach(page);
  const base = await snapshot(page);
  const pad = async (buttons: number[]) => {
    await page.evaluate(buttons => { (window as typeof window & { __BATTLE_PAD__?: unknown }).__BATTLE_PAD__ = {
      id: 'Battle controller', index: 0, mapping: 'standard', connected: true, axes: [0, 0],
      buttons: Array.from({ length: 20 }, (_, index) => ({ pressed: buttons.includes(index), value: buttons.includes(index) ? 1 : 0 })),
    }; }, buttons);
    await page.waitForTimeout(120);
  };
  for (let entry = 0; entry < 3; entry++) {
    await enter(page);
    await expect(page.locator('#interaction-dialog')).toBeInViewport();
    if (entry === 0) {
      await pad([]); await pad([1]); await pad([]); // Cancel first continues past the shown opening hit…
      await expect.poll(async () => (await snapshot(page)).battle?.review).toBe(false);
      await pad([1]); await pad([]); // …then escapes, which always works in an ordinary battle.
    } else {
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Escape', exact: true }).click();
      await page.getByRole('button', { name: 'Return to room' }).click();
    }
    await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
    await expect(page.locator('#stage')).toBeFocused();
    const state = await snapshot(page);
    expect(state.actorTile).toEqual(base.actorTile);
    expect(state.textureCount).toBe(base.textureCount);
    expect(state.displayObjects).toBe(base.displayObjects);
    expect(state.activeEffects).toBe(0);
    expect(state.session).toEqual(base.session);
  }
});

test('authored defeat offers Retry with the identical opening and a safe Leave', async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', async route => {
    const response = await route.fetch();
    const catalog = await response.json() as { encounters: { enemies: { attack: number }[] }[] };
    for (const enemy of catalog.encounters[0]!.enemies) enemy.attack = 20;
    await route.fulfill({ json: catalog });
  });
  await approach(page);
  const before = (await snapshot(page)).session;
  await enter(page);
  const opening = (await snapshot(page)).battle;
  expect(opening).toMatchObject({ phase: 'command', review: true });
  await page.getByRole('button', { name: 'Continue' }).click();
  for (let turns = 0; turns < 6 && (await snapshot(page)).battle?.phase === 'command'; turns++) {
    await page.getByRole('button', { name: 'Guard' }).click();
    if ((await snapshot(page)).battle?.phase === 'command') await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('defeat');
  await page.getByRole('button', { name: 'Retry' }).click();
  expect((await snapshot(page)).battle).toEqual(opening);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Escape', exact: true }).click();
  await page.getByRole('button', { name: 'Return to room' }).click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});
