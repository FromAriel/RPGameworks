import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot, tapDirection, type DirectionKey } from './helpers';

const SUPPLY = 'demo:map.supply-room';
const encounter = 'demo:encounter.practice-sigil';
const TONIC = 'demo:item.tonic';

// Walking uses the shared tap, which releases the key inside the page, so a loaded machine cannot add a step.
async function step(page: Page, key: DirectionKey): Promise<void> {
  expect(await tapDirection(page, key)).toBe('walked');
}

async function approach(page: Page, open = true): Promise<void> {
  if (open) await openRoom(page, `?map=${SUPPLY}`);
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) await step(page, 'ArrowLeft');
  expect((await snapshot(page)).actorTile.x).toBe(3);
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // The sigil is solid: this only turns to face it.
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.practice-sigil');
}

async function enter(page: Page): Promise<void> {
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(encounter);
}

/**
 * Skip whatever is playing; the outcome was decided before playback started. Playback can end between the check
 * and the click, which removes the Skip button (seen on a loaded machine with 4 workers, November 9). A failed click
 * is only an error if playback is still running.
 */
async function skip(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) {
    await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(async (error: unknown) => {
      if ((await snapshot(page)).battle?.playing) throw error;
    });
  }
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
  // Creature frames animate over time (decision 0015 C3); they are presentation, not battle state, so they are left out.
  expect({ ...(await snapshot(page)).battle!, playing: true, menu: null, art: {} }).toEqual({ ...resolved, playing: true, menu: null, art: {} });
}

test('classic battle windows play resolved turns and restore exploration focus', { tag: ['@battle', '@smoke'] }, async ({ page }, info) => {
  await approach(page);
  const before = await snapshot(page);
  await enter(page);
  // The whole roster fights (M5.4d). The faster Bat opens the battle; its hit plays on the stage before the first
  // command, and the Archer, the fastest member, acts first.
  const opening = (await snapshot(page)).battle!;
  expect(opening).toMatchObject({ phase: 'command', turn: 1, active: 'archer', hp: { hero: 29, archer: 22, lancer: 26, mage: 20, sigil: 20, shard: 10 } });
  expect(opening.timeline.slice(0, 3)).toEqual(['archer', 'hero', 'lancer']);
  // On a loaded machine the opening hit can finish playing before this check; while it plays, Skip has focus and
  // the menu waits.
  if (opening.playing) {
    expect(opening.menu).toBeNull();
    // Skip holds focus for as long as playback runs; playback ending first is also fine.
    await expect.poll(async () => !(await snapshot(page)).battle?.playing
      || await button(page, 'Skip').evaluate((element) => element === document.activeElement).catch(() => false)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('battle-opening-playback.png') });
  await expect.poll(async () => (await snapshot(page)).battle?.playing, { timeout: 5000 }).toBe(false); // Plays out by itself.
  const dialog = page.locator('#interaction-dialog');
  await expect(dialog).toContainText('Bat hits Hero for 1.');
  await expect(dialog).toContainText('Next: Archer → Hero → Lancer'); // Screen-reader details.
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
  await button(page, 'Bat').click();
  await skip(page);
  expect((await snapshot(page)).battle).toMatchObject({ active: 'hero', hp: { hero: 29, shard: 5 } });
  await command(page, 'Attack', 'Bat'); // The target is remembered, so a keyboard player would press Enter twice.
  await expect(dialog).toContainText('Bat is defeated.');
  await button(page, 'Attack').click();
  await expect(button(page, 'Bat')).toHaveCount(0); // Defeated targets are not offered.
  expect((await snapshot(page)).battle?.menu?.target).toBe('sigil');
  await button(page, 'Clay Golem').click();
  await skip(page);
  for (let turns = 0; turns < 8 && (await snapshot(page)).battle?.phase !== 'victory'; turns++) await command(page, 'Attack', 'Clay Golem');
  expect((await snapshot(page)).battle?.phase).toBe('victory');
  await button(page, 'Finish').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  await expect(page.locator('#stage')).toBeFocused();
  const after = await snapshot(page);
  expect(after.session).toEqual(before.session);
  expect(after.displayObjects).toBe(before.displayObjects); // Every window, number and tween was released.
  expect(after.textureCount).toBe(before.textureCount);
});

test('keyboard confirms in two presses, Cancel backs out without committing, and tapping an enemy attacks it', { tag: ['@battle'] }, async ({ page }) => {
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
  expect((await snapshot(page)).battle).toMatchObject({ turn: start.turn, phase: 'command', menu: { level: 'root', cursor: 5 } }); // Run is sixth since Move (M5.4c).
  await expect(button(page, 'Run')).toBeFocused();
  for (let up = 0; up < 4; up++) await page.keyboard.press('ArrowUp'); // Run → Move → Guard → Item → Special.
  await expect(button(page, 'Special')).toBeFocused(); // Disabled entries can be highlighted to read why…
  await page.keyboard.press('Enter');
  expect((await snapshot(page)).battle).toMatchObject({ turn: start.turn, menu: { level: 'root', cursor: 1 } }); // …but do nothing.
  // Tapping an enemy sprite while choosing a command attacks it directly.
  const box = (await page.locator('#stage canvas').boundingBox())!;
  const scale = box.width / 640;
  await page.mouse.click(box.x + 200 * scale, box.y + 128 * scale); // The Clay Golem stands at (200, 128).
  const tapped = (await snapshot(page)).battle!;
  expect(tapped.turn).toBeGreaterThan(start.turn);
  expect(tapped.hp.sigil).toBeLessThan(start.hp.sigil!);
  await skip(page);
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); // Attack is remembered, and so is the Sigil.
  const pressed = (await snapshot(page)).battle!;
  expect(pressed.turn).toBeGreaterThan(tapped.turn);
  expect(pressed.hp.sigil).toBeLessThan(tapped.hp.sigil!);
});

test('playback speed and skipping never change the resolved battle', { tag: ['@battle'] }, async ({ page }) => {
  // Three whole battles: about 15 s on a quiet machine, past the default 30 s budget with 4 workers.
  test.setTimeout(60_000);
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
      states.push({ ...(await snapshot(page)).battle!, speed: 0, art: {} }); // Animated creature frames are not battle state.
      if (turn % 2) await button(page, 'Guard').click();
      else { await button(page, 'Attack').click(); await button(page, 'Clay Golem').click(); }
    }
    await skip(page);
    states.push({ ...(await snapshot(page)).battle!, speed: 0, art: {} });
    return states;
  };
  const watched = await run('watch');
  expect(await run('fast')).toEqual(watched);
  expect(fastest).toBe(4);
  expect(await run('skip')).toEqual(watched);
});

test('a carried tonic is spent atomically in battle and stays spent after running', { tag: ['@battle', '@inventory'] }, async ({ page }) => {
  await openRoom(page, `?map=${SUPPLY}`);
  await step(page, 'ArrowUp'); await step(page, 'ArrowUp'); // (4,3) → (4,1)
  // The crate at (5,1) is solid, so holding Right only turns to face it.
  expect(await tapDirection(page, 'ArrowRight')).toBe('turned');
  expect((await snapshot(page)).interactionTarget).toBe('demo:object.supply-room.tonic-crate');
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
  await expect(page.locator('#interaction-dialog')).toContainText('Archer uses Workshop tonic: Hero recovers 1 HP.'); // The Archer acts first.
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
  if ((await snapshot(page)).battle?.hp.hero === 30) await expect(button(page, 'Item')).toHaveAttribute('aria-description', 'HP is already full.');
  await button(page, 'Run').click();
  expect((await snapshot(page)).battle?.phase).toBe('escaped');
  await skip(page);
  await button(page, 'Leave').click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session.inventory[TONIC]).toBe(1);
});

test('failed catalog load leaves the room playable', { tag: ['@battle', '@smoke'] }, async ({ page }) => {
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

test('narrow battle supports controller cancel, Run and pointer taps without owned-resource growth', { tag: ['@battle'] }, async ({ page }) => {
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
      expect((await snapshot(page)).battle?.menu).toMatchObject({ level: 'root', cursor: 5 });
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

test('authored defeat offers Retry with the identical opening and a safe Leave', { tag: ['@battle'] }, async ({ page }) => {
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
  for (let turns = 0; turns < 24 && (await snapshot(page)).battle?.phase === 'command'; turns++) await command(page, 'Guard'); // Four members to wear down.
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('defeat');
  expect((await snapshot(page)).battle?.menu).toEqual({ level: 'end', cursor: 0, target: null });
  await button(page, 'Retry').click();
  expect({ ...(await snapshot(page)).battle!, art: {} }).toEqual({ ...opening!, art: {} }); // Creature frames animate; the rest restarts exactly.
  await skip(page);
  await button(page, 'Run').click();
  await skip(page);
  await button(page, 'Leave').click();
  await expect(page.locator('#stage')).toBeFocused();
  expect((await snapshot(page)).session).toEqual(before);
});
