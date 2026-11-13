import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot, tapDirection } from './helpers';

/**
 * Decision 0014 M5.4b: the Formation Drill. Four party members in formation against a clay golem, a bat sheltered
 * behind it, and a big two-headed ogre on the battle grid. Unreachable targets are never offered and the help line
 * says why; the fight can be won and lost with keyboard and pointer input.
 */
const DRILL = 'demo:encounter.formation-drill';

/** From the Supply Room entrance (4,3): up two to (4,1), left to (3,1), then face the drill sigil at (2,1). */
async function startDrill(page: Page): Promise<void> {
  await openRoom(page, '?map=demo:map.supply-room');
  expect(await tapDirection(page, 'ArrowUp')).toBe('walked');
  expect(await tapDirection(page, 'ArrowUp')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // Turns to face the solid sigil.
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(DRILL);
}
async function settle(page: Page): Promise<void> {
  if ((await snapshot(page)).battle?.playing) {
    await page.getByRole('button', { name: 'Skip' }).click({ timeout: 3000 }).catch(async (error: unknown) => {
      if ((await snapshot(page)).battle?.playing) throw error;
    });
  }
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test('the drill shows four party members and three creatures on the grid, with shielded fighters marked', { tag: ['@battle', '@smoke'] }, async ({ page }) => {
  await startDrill(page);
  await settle(page);
  const battle = (await snapshot(page)).battle!;
  expect(Object.keys(battle.hp).sort()).toEqual(['archer', 'bat', 'golem', 'hero', 'lancer', 'mage', 'ogre']);
  expect(battle.art.ogre!.source).toBe('creature');
  expect(battle.art.ogre!.frame).toMatch(/^dcss\/monster\/two_headed_ogre_new@left\//);
  expect(battle.art.lancer).toEqual({ source: 'frame', frame: 'lancer-left', shields: 0 });
  // One living ally ahead in the lane: the archer behind the hero, the mage behind the lancer, the bat behind the golem.
  expect(Object.fromEntries(Object.entries(battle.art).map(([id, a]) => [id, a.shields]))).toEqual({ hero: 0, archer: 1, lancer: 0, mage: 1, ogre: 0, golem: 0, bat: 1 });
});

test('a melee fighter is never offered the sheltered bat, and the help line says why', { tag: ['@battle'] }, async ({ page }) => {
  await startDrill(page);
  await settle(page);
  expect((await snapshot(page)).battle!.active).toBe('archer');
  await button(page, 'Attack').click();
  await expect(button(page, 'Bat')).toHaveCount(1); // The archer shoots: anyone is in reach.
  await page.keyboard.press('Escape');
  await button(page, 'Guard').click();
  await settle(page);
  expect((await snapshot(page)).battle!.active).toBe('hero');
  await button(page, 'Attack').click();
  await expect(button(page, 'Two-Headed Ogre')).toHaveCount(1);
  await expect(button(page, 'Clay Golem')).toHaveCount(1);
  await expect(button(page, 'Bat')).toHaveCount(0);
  // The help line is drawn on the stage; screen readers get it as each button's description.
  await expect(button(page, 'Two-Headed Ogre')).toHaveAttribute('aria-description', 'Two-Headed Ogre  60/60 HP  Out of reach: Bat.');
});

test('the party can win the drill with the keyboard alone', { tag: ['@battle'] }, async ({ page }) => {
  test.setTimeout(90_000);
  await startDrill(page);
  for (let turn = 0; turn < 80; turn++) {
    await settle(page);
    const phase = (await snapshot(page)).battle!.phase;
    if (phase !== 'command') break;
    await expect.poll(async () => (await snapshot(page)).battle?.menu?.level).toBe('root');
    await page.keyboard.press('Enter'); // Attack…
    await expect.poll(async () => (await snapshot(page)).battle?.menu?.level).toBe('target');
    await page.keyboard.press('Enter'); // …the first enemy in reach.
  }
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('victory');
  await settle(page);
  await button(page, 'Finish').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
});

test('a stronger drill defeats the party, offers Retry and Leave, and Leave returns to the room unchanged', { tag: ['@battle'] }, async ({ page }) => {
  await page.route('**/generated/content/encounters.*.json', async (route) => {
    const response = await route.fetch();
    const catalog = await response.json() as { encounters: { id: string; enemies: { attack: number }[] }[] };
    for (const enemy of catalog.encounters.find(e => e.id === DRILL)!.enemies) enemy.attack = 60;
    await route.fulfill({ response, json: catalog });
  });
  await startDrill(page);
  const room = (await snapshot(page)).actorTile;
  for (let turn = 0; turn < 20 && (await snapshot(page)).battle?.phase === 'command'; turn++) {
    await settle(page);
    if ((await snapshot(page)).battle?.phase !== 'command') break;
    await button(page, 'Guard').click();
  }
  await expect.poll(async () => (await snapshot(page)).battle?.phase).toBe('defeat');
  await settle(page);
  await expect(button(page, 'Retry')).toBeVisible();
  await button(page, 'Leave').click();
  await expect.poll(async () => (await snapshot(page)).inputMode).toBe('exploration');
  expect((await snapshot(page)).actorTile).toEqual(room);
});
