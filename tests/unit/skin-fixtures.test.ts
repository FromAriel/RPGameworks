import { describe, expect, it } from 'vitest';
import { SKIN_SPECS, buildSkin } from '../fixtures/skin-fixtures';
import { readSkinManifest } from '../../src/presentation/skin/skin-manifest.mjs';
import { expectCleanComposition } from './skin-checks';

/**
 * Decision 0011 W3.2 acceptance: synthetic skins compose with no gaps, overlaps, cut patterns or stretched ornaments
 * at odd and even sizes. The checks (tests/unit/skin-checks.ts) read the compositor's recorded draw calls, so they hold
 * for any artwork; the baked skins of decision 0013 face the same checks.
 */
describe('fixture skins compose cleanly at odd and even sizes (decision 0011 W3.2)', () => {
  for (const spec of SKIN_SPECS) {
    it(spec.name, async () => {
      const { skin, width, height, pixels } = buildSkin(spec);
      const read = readSkinManifest(skin);
      expect(read.ok ? [] : read.errors).toEqual([]);
      await expectCleanComposition(skin, { naturalWidth: width, naturalHeight: height, pixels });
    });
  }
});
