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

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/**
 * Tap through the classic menu (for example Attack, then a target). The last tap commits; the result is already
 * decided while it plays, and skipping to the next decision does not change it.
 */
async function command(page: Page, ...names: string[]): Promise<void> {
  for (const name of names) await button(page, name).click();
  const resolved = (await snapshot(page)).battle!;
  await skip(page);
  expect({ ...(await snapshot(page)).battle!, playing: true, menu: null }).toEqual({ ...resolved, playing: true, menu: null });
}

test('classic battle windows play resolved turns and restore exploration focus', async ({ page }, info) => {
  await approach(page);
  const before = await snapshot(page);
  await enter(page);
  // The faster Sigil Shard opens the battle; its hit plays on the stage before the first command.
  const opening = (await snapshot(page)).battle!;
  expect(opening).toMatchObject({ phase: 'command', playing: true, turn: 1, active: 'hero', hp: { hero: 29, sigil: 20, shard: 10 }, menu: null });
  expect(opening.timeline.slice(0, 3)).toEqual(['hero', 'sigil', 'shard']);
  await expect(button(page, 'Skip')).toBeFocused();
  await page.screenshot({ path: info.outputPath('battle-opening-playback.png') });
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false); // Plays out by itself.
  const dialog = page.locator('#interaction-dialog');
  await expect(dialog).toContainText('Sigil Shard hits Hero for 1.');
  await expect(dialog).toContainText('Next: Hero → Practice Sigil → Sigil Shard'); // Screen-reader details.
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'root', cursor: 0, target: null });
  await expect(button(page, 'Attack')).toBeFocused();
  await expect(button(page, 'Special')).toHaveAttribute('aria-disabled', 'true');
  await expect(button(page, 'Item')).toHaveAttribute('aria-disabled', 'true'); // None carried yet.
  await expect(button(page, 'Item')).toHaveAttribute('aria-description', 'No usable items.');
  expect((await snapshot(page)).displayObjects).toBeGreaterThan(before.displayObjects); // The stage is drawn.
  await page.screenshot({ path: info.outputPath('battle-command.png') });
  await button(page, 'Attack').click();
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'target', cursor: 0, target: 'sigil' });
  await page.screenshot({ path: info.outputPath('battle-target.png') });
  await button(page, 'Sigil Shard').click();
  await skip(page);
  expect((await snapshot(page)).battle).toMatchObject({ hp: { hero: 25, shard: 4 } });
  await command(page, 'Attack', 'Sigil Shard'); // The target is remembered, so a keyboard player would press Enter twice.
  await expect(dialog).toContainText('Sigil Shard is defeated.');
  await button(page, 'Attack').click();
  await expect(button(page, 'Sigil Shard')).toHaveCount(0); // Defeated targets are not offered.
  expect((await snapshot(page)).battle?.menu?.target).toBe('sigil');
  await button(page, 'Practice Sigil').click();
  await skip(page);
  for (let turns = 0; turns < 8 && (await snapshot(page)).battle?.phase !== 'victory'; turns++) await command(page, 'Attack', 'Practice Sigil');
  expect((await snapshot(page)).battle?.phase).toBe('victory');
  await button(page, 'Finish').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  const after = await snapshot(page);
  expect(after.session).toEqual(before.session);
  expect(after.displayObjects).toBe(before.displayObjects); // Every window, number and tween was released.
  expect(after.textureCount).toBe(before.textureCount);
});

test('keyboard confirms in two presses, Cancel backs out without committing, and tapping an enemy attacks it', async ({ page }) => {
  await approach(page);
  await enter(page);
  await skip(page);
  const start = (await snapshot(page)).battle!;
  await page.keyboard.press('Enter'); // Attack.
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'target', cursor: 0, target: 'sigil' });
  await page.keyboard.press('ArrowDown');
  expect((await snapshot(page)).battle?.menu?.target).toBe('shard');
  await page.keyboard.press('Escape'); // Back to the commands; nothing happened.
  expect((await snapshot(page)).battle).toMatchObject({ turn: start.turn, hp: start.hp, menu: { level: 'root', cursor: 0 } });
  await page.keyboard.press('Escape'); // At the top, Cancel only points at Run.
  expect((await snapshot(page)).battle).toMatchObject({ turn: start.turn, phase: 'command', menu: { level: 'root', cursor: 4 } });
  await expect(button(page, 'Run')).toBeFocused();
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await expect(button(page, 'Special')).toBeFocused(); // Disabled entries can be highlighted to read why…
  await page.keyboard.press('Enter');
  expect((await snapshot(page)).battle).toMatchObject({ turn: start.turn, menu: { level: 'root', cursor: 1 } }); // …but do nothing.
  // Tapping an enemy sprite while choosing a command attacks it directly.
  const box = (await page.locator('#stage canvas').boundingBox())!;
  const scale = box.width / 640;
  await page.mouse.click(box.x + 200 * scale, box.y + 128 * scale); // Practice Sigil stands at (200, 128).
  const tapped = (await snapshot(page)).battle!;
  expect(tapped.turn).toBeGreaterThan(start.turn);
  expect(tapped.hp.sigil).toBeLessThan(start.hp.sigil!);
  await skip(page);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); // Attack is remembered, and so is the Sigil.
  const pressed = (await snapshot(page)).battle!;
  expect(pressed.turn).toBeGreaterThan(tapped.turn);
  expect(pressed.hp.sigil).toBeLessThan(tapped.hp.sigil!);
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
      if (turn % 2) await button(page, 'Guard').click();
      else { await button(page, 'Attack').click(); await button(page, 'Practice Sigil').click(); }
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

test('a carried tonic is spent atomically in battle and stays spent after running', async ({ page }) => {
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
  await button(page, 'Item').click();
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'item', cursor: 0, target: null });
  await expect(button(page, 'Workshop tonic (2)')).toHaveAttribute('aria-description', 'Restores 12 HP.');
  await button(page, 'Workshop tonic (2)').click();
  expect((await snapshot(page)).battle?.menu?.target).toBe('hero'); // The most injured ally.
  await command(page, 'Hero');
  await expect(page.locator('#interaction-dialog')).toContainText('Hero uses Workshop tonic: Hero recovers 1 HP.');
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
  if ((await snapshot(page)).battle?.hp.hero === 30) await expect(button(page, 'Item')).toHaveAttribute('aria-description', 'HP is already full.');
  await button(page, 'Run').click();
  expect((await snapshot(page)).battle?.phase).toBe('escaped');
  await skip(page);
  await button(page, 'Leave').click();
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

test('narrow battle supports controller cancel, Run and pointer taps without owned-resource growth', async ({ page }) => {
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
      await pad([1]); await pad([]); // …then points at Run…
      expect((await snapshot(page)).battle?.menu).toMatchObject({ level: 'root', cursor: 4 });
      await pad([2]); await pad([]); // …which Interact confirms; it always works in an ordinary battle.
      expect((await snapshot(page)).battle?.phase).toBe('escaped');
      for (let tries = 0; tries < 4 && (await snapshot(page)).inputMode !== 'exploration'; tries++) { await pad([1]); await pad([]); }
    } else {
      await skip(page);
      await button(page, 'Run').click();
      await skip(page);
      await button(page, 'Leave').click();
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
  for (let turns = 0; turns < 6 && (await snapshot(page)).battle?.phase === 'command'; turns++) await command(page, 'Guard');
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('defeat');
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'end', cursor: 0, target: null });
  await button(page, 'Retry').click();
  expect((await snapshot(page)).battle).toEqual(opening);
  await skip(page);
  await button(page, 'Run').click();
  await skip(page);
  await button(page, 'Leave').click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});
