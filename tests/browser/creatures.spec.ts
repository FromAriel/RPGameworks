import type { Page } from '@playwright/test';
import { test, expect, openRoom, snapshot, tapDirection } from './helpers';

/**
 * Decision 0015 C3: the practice fight's enemies are Stone Soup creatures (a clay golem and a bat), animated with their
 * assigned motion. Reduced motion keeps them still; if the creature art cannot load, each enemy keeps its frame and
 * the battle still plays.
 */
const SUPPLY = 'demo:map.supply-room';
const ENCOUNTER = 'demo:encounter.practice-sigil';

async function startPractice(page: Page): Promise<void> {
  await openRoom(page, `?map=${SUPPLY}`);
  for (let taps = 0; taps < 4 && (await snapshot(page)).actorTile.x !== 3; taps++) expect(await tapDirection(page, 'ArrowLeft')).toBe('walked');
  expect(await tapDirection(page, 'ArrowLeft')).not.toBe('none'); // Face the sigil.
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await snapshot(page)).battle?.encounterId).toBe(ENCOUNTER);
}
const art = async (page: Page) => (await snapshot(page)).battle!.art;

test('the practice fight’s enemies are animated Stone Soup creatures; the hero keeps its frame', { tag: ['@battle'] }, async ({ page }) => {
  await startPractice(page);
  await expect.poll(async () => (await art(page)).sigil?.source).toBe('creature');
  const first = await art(page);
  expect(first.shard!.source).toBe('creature');
  expect(first.hero).toEqual({ source: 'frame', frame: 'hero-left', shields: 0 });
  expect(first.sigil!.frame).toMatch(/^dcss\/monster\/nonliving\/clay_golem@left\/(idle\/\d|still|flash)$/);
  // The bat floats on a 200 ms idle loop: its frame changes within a second.
  const seen = new Set<string>();
  await expect.poll(async () => { seen.add((await art(page)).shard!.frame); return seen.size; }, { timeout: 3000 }).toBeGreaterThan(1);
  for (const frame of seen) expect(frame).toMatch(/^dcss\/monster\/animals\/bat@left\/(idle\/\d|flash)$/);
});

test('reduced motion keeps every creature on its still frame', { tag: ['@battle'] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startPractice(page);
  await expect.poll(async () => (await art(page)).shard?.source).toBe('creature');
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false); // The opening hit has played.
  const before = await art(page);
  await page.waitForTimeout(600); // Three bat idle steps.
  expect(await art(page)).toEqual(before);
  expect(before.shard!.frame).toBe('dcss/monster/animals/bat@left/still');
  expect(before.sigil!.frame).toBe('dcss/monster/nonliving/clay_golem@left/still');
});

test('missing creature art falls back to the battler frames and the battle still plays', { tag: ['@battle'] }, async ({ page }) => {
  await page.route('**/generated/content/creatures.*.png', (route) => route.abort());
  await startPractice(page);
  await expect.poll(async () => (await snapshot(page)).battle?.playing).toBe(false);
  expect(await art(page)).toEqual({ hero: { source: 'frame', frame: 'hero-left', shields: 0 }, sigil: { source: 'frame', frame: 'sigil', shields: 0 }, shard: { source: 'frame', frame: 'sigil-lit', shields: 0 } });
  await page.getByRole('button', { name: 'Attack', exact: true }).click();
  await page.getByRole('button', { name: 'Bat', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).battle?.turn).toBeGreaterThan(1);
  await expect(page.locator('#error')).toBeHidden();
});
