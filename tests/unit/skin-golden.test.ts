import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GOLDEN_DIVIDERS, GOLDEN_FRAMES, installFakeDocument, loadAtlas } from './skin-harness';

/**
 * Decision 0011 W3.2 golden test. tests/fixtures/windowskin-golden.json was recorded from the W1 compositor as it was
 * before W3.2 (commit 2a66694) with this same harness, by running this file with UPDATE_SKIN_GOLDEN=1. Ariel's skin
 * must still compose to exactly those pixels after the geometry moved into the skin manifest. Never regenerate it to
 * make a failure pass; a real change to Ariel's skin output needs Ariel's acceptance first.
 */
const GOLDEN = 'tests/fixtures/windowskin-golden.json';

describe('W1 compositor golden output for Ariel’s skin', () => {
  it('composes every recorded frame and divider to the identical bitmap', async () => {
    const canvases = installFakeDocument();
    const { SkinPainter } = await import('../../src/presentation/skin/paint');
    const painter = new SkinPainter(loadAtlas('assets/source/ui/base/Window.png') as unknown as HTMLImageElement);
    const canvas = canvases[0]!;
    const results: Record<string, { hash: string; titleMode: string }> = {};
    for (const c of GOLDEN_FRAMES) {
      const { titleMode } = painter.frame(c.width, c.height, c.title);
      results[c.name] = { hash: canvas.hash(), titleMode };
    }
    for (const c of GOLDEN_DIVIDERS) {
      const { titleMode } = painter.divider(c.width, c.title);
      results[c.name] = { hash: canvas.hash(), titleMode };
    }
    if (process.env.UPDATE_SKIN_GOLDEN === '1' || !existsSync(GOLDEN)) {
      if (process.env.UPDATE_SKIN_GOLDEN !== '1') throw new Error(`${GOLDEN} is missing; record it from the pre-W3.2 compositor`);
      writeFileSync(GOLDEN, `${JSON.stringify(results, null, 2)}\n`);
    }
    expect(results).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')));
    // The set covers both title modes, so the gap and the header fallback are both pinned.
    expect(new Set(Object.values(results).map((r) => r.titleMode))).toEqual(new Set(['gap', 'header']));
  });
});
