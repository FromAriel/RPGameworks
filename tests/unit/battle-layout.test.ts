import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FALLBACK_LAYOUT, battleLayout, entryRect } from '../../src/presentation/battle/battle-layout';
import { contentInsets, readSkinManifest } from '../../src/presentation/skin/skin-manifest.mjs';
import { SKIN_SPECS, buildSkin } from '../fixtures/skin-fixtures';

const insetsOf = (manifest: unknown) => {
  const read = readSkinManifest(manifest);
  if (!read.ok) throw new Error(read.errors.join('; '));
  return contentInsets(read.skin);
};

describe('battle window layout (decision 0011 W3.5)', () => {
  it('keeps M5.3c’s exact layout for the fallback panels', () => {
    expect(FALLBACK_LAYOUT.help).toEqual({ x: 0, y: 0, w: 640, h: 24 });
    expect([FALLBACK_LAYOUT.enemies, FALLBACK_LAYOUT.party, FALLBACK_LAYOUT.commands, FALLBACK_LAYOUT.list]).toEqual([
      { x: 0, y: 224, w: 168, h: 136 }, { x: 168, y: 224, w: 336, h: 136 }, { x: 504, y: 224, w: 136, h: 136 }, { x: 0, y: 224, w: 504, h: 136 }]);
    expect(FALLBACK_LAYOUT.helpText).toEqual({ x: 8, y: 4, right: 8 });
    expect(FALLBACK_LAYOUT.timelineY).toBe(40);
    expect(entryRect(FALLBACK_LAYOUT, 'root', 2)).toEqual({ x: 508, y: 272, w: 128, h: 20 });
    expect(entryRect(FALLBACK_LAYOUT, 'item', 0)).toEqual({ x: 4, y: 232, w: 496, h: 20 });
  });

  it('fits Ariel’s skin: a taller help window, the same 136-pixel bottom band, text inside the insets', () => {
    const layout = battleLayout(insetsOf(JSON.parse(readFileSync('assets/source/ui/base/Window.manifest.json', 'utf8'))));
    expect(layout.help.h).toBe(52); // 20 top inset + one 16-pixel line + 16 bottom inset.
    expect(layout.timelineY).toBe(68);
    expect(layout.commands).toEqual({ x: 504, y: 224, w: 136, h: 136 }); // 20 + 5 rows of 20 + 16 = 136.
    const first = entryRect(layout, 'root', 0), last = entryRect(layout, 'root', 4);
    expect(first.x + 2).toBeGreaterThanOrEqual(layout.commands.x + 16); // The cursor clears the left band.
    expect(first.y + 2).toBeGreaterThanOrEqual(layout.commands.y + 20); // Text starts at the top inset.
    expect(last.y + last.h - 2).toBeLessThanOrEqual(layout.commands.y + layout.commands.h - 16); // Five rows fit above the bottom inset.
    expect(first.x + first.w).toBeLessThanOrEqual(layout.commands.x + layout.commands.w - 16 + 6);
  });

  it('grows the bottom band upward when a thick skin needs room for five rows', () => {
    const thick = buildSkin(SKIN_SPECS.find((s) => s.name.startsWith('thick'))!);
    const insets = insetsOf(thick.skin); // 24-pixel band plus the 4-pixel margin.
    const layout = battleLayout(insets);
    expect(layout.commands.h).toBe(insets.top + 5 * 20 + insets.bottom);
    expect(layout.commands.h).toBeGreaterThan(136);
    expect(layout.commands.y + layout.commands.h).toBe(360);
    expect(layout.help.h).toBe(insets.top + 16 + insets.bottom);
    const thin = battleLayout(insetsOf(buildSkin(SKIN_SPECS[0]!).skin));
    expect(thin.help.h).toBe(32); // 8 + 16 + 8: a thin skin's insets (4-pixel band, 4-pixel margin) and one line.
    expect(thin.commands.h).toBe(136);
  });
});
