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

/** Skip whatever is playing; the outcome was decided before playback started. */
async function skip(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) await page.getByRole('button', { name: 'Skip' }).click();
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}

/** Choose a command, check the result is already decided while it plays, then skip to the next decision. */
async function choose(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
  const resolved = (await snapshot(page)).battle!;
  await skip(page);
  expect({ ...(await snapshot(page)).battle!, playing: true }).toEqual({ ...resolved, playing: true });
}

test('side-view battle plays resolved turns, previews order, and restores exploration focus', async ({ page }, info) => {
  await approach(page);
  const before = await snapshot(page);
  await enter(page);
  // The faster Sigil Shard opens the battle; its hit plays on the stage before the first command.
  const opening = (await snapshot(page)).battle!;
  expect(opening).toMatchObject({ phase: 'command', playing: true, turn: 1, active: 'hero', hp: { hero: 29, sigil: 20, shard: 10 } });
  expect(opening.timeline.slice(0, 3)).toEqual(['hero', 'sigil', 'shard']);
  await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('battle-opening-playback.png') });
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false); // Plays out by itself.
  await expect(page.locator('#interaction-dialog')).toContainText('Sigil Shard hits Hero for 1.');
  await expect(page.locator('#interaction-dialog')).toContainText('Next: Hero → Practice Sigil → Sigil Shard');
  expect((await snapshot(page)).displayObjects).toBeGreaterThan(before.displayObjects); // The stage is drawn.
  await page.screenshot({ path: info.outputPath('battle-command.png') });
  await expect(page.getByRole('button', { name: /Use Workshop tonic/ })).toHaveCount(0); // None carried yet.
  await choose(page, 'Attack Sigil Shard');
  expect((await snapshot(page)).battle).toMatchObject({ hp: { hero: 25, shard: 4 } });
  await choose(page, 'Attack Sigil Shard');
  await expect(page.locator('#interaction-dialog')).toContainText('Sigil Shard is defeated.');
  await expect(page.getByRole('button', { name: 'Attack Sigil Shard' })).toHaveCount(0); // Defeated targets are not offered.
  for (let turns = 0; turns < 8 && (await snapshot(page)).battle?.phase !== 'victory'; turns++) await choose(page, 'Attack Practice Sigil');
  expect((await snapshot(page)).battle?.phase).toBe('victory');
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  const after = await snapshot(page);
  expect(after.session).toEqual(before.session);
  expect(after.displayObjects).toBe(before.displayObjects); // Every stage object, number and tween was released.
  expect(after.textureCount).toBe(before.textureCount);
});

test('playback speed and skipping never change the resolved battle', async ({ page }) => {
  let fastest = 1;
  const run = async (mode: 'watch' | 'fast' | 'skip') => {
    await approach(page);
    await enter(page);
    const states = [];
    for (let turn = 0; turn < 4; turn++) {
      if (mode === 'skip') await skip(page);
      else {
        // The chosen speed lasts for the battle. Playback may finish before a click lands; that is fine.
        for (let presses = 0; mode === 'fast' && presses < 3; presses++) {
          const battle = (await snapshot(page)).battle!;
          fastest = Math.max(fastest, battle.speed);
          if (!battle.playing || battle.speed === 4) break;
          await page.getByRole('button', { name: /^Speed / }).click({ timeout: 1000 }).catch(() => undefined);
        }
        await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false);
      }
      states.push({ ...(await snapshot(page)).battle!, speed: 0 });
      await page.getByRole('button', { name: turn % 2 ? 'Guard' : 'Attack Practice Sigil' }).click();
    }
    await skip(page);
    states.push({ ...(await snapshot(page)).battle!, speed: 0 });
    return states;
  };
  const watched = await run('watch');
  expect(await run('fast')).toEqual(watched);
  expect(fastest).toBe(4);
  expect(await run('skip')).toEqual(watched);
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
  await skip(page);
  await choose(page, 'Use Workshop tonic (2)');
  await expect(page.locator('#interaction-dialog')).toContainText('Hero uses Workshop tonic: Hero recovers 1 HP.');
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
  const full = page.getByRole('button', { name: 'Use Workshop tonic (1)' });
  if ((await snapshot(page)).battle?.hp.hero === 30) await expect(full).toBeDisabled();
  await page.getByRole('button', { name: 'Escape' }).click();
  expect((await snapshot(page)).battle?.phase).toBe('escaped');
  await skip(page);
  await page.getByRole('button', { name: 'Return to room' }).click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
});

test('failed catalog load leaves the room playable', async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await approach(page);
  const before = await snapshot(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#interaction-dialog')).toContainText('could not load');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  const after = await snapshot(page);
  expect(after.mapId).toBe(SUPPLY);
  expect(after.displayObjects).toBe(before.displayObjects);
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
      await pad([]); await pad([1]); await pad([]); // Cancel first skips the opening playback…
      await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
      await pad([1]); await pad([]); // …then escapes, which always works in an ordinary battle.
    } else {
      await skip(page);
      await page.getByRole('button', { name: 'Escape', exact: true }).click();
      await skip(page);
      await page.getByRole('button', { name: 'Return to room' }).click();
    }
    await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
    await expect(page.locator('#stage')).toBeFocused();
    await expect.poll(async () => (await snapshot(page)).activeEffects).toBe(0);
    const state = await snapshot(page);
    expect(state.actorTile).toEqual(base.actorTile);
    expect(state.textureCount).toBe(base.textureCount);
    expect(state.displayObjects).toBe(base.displayObjects);
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
  expect(opening).toMatchObject({ phase: 'command', playing: true });
  await skip(page);
  for (let turns = 0; turns < 6 && (await snapshot(page)).battle?.phase === 'command'; turns++) await choose(page, 'Guard');
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('defeat');
  await page.getByRole('button', { name: 'Retry' }).click();
  expect((await snapshot(page)).battle).toEqual(opening);
  await skip(page);
  await page.getByRole('button', { name: 'Escape', exact: true }).click();
  await skip(page);
  await page.getByRole('button', { name: 'Return to room' }).click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});
