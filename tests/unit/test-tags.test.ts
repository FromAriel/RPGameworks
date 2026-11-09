import { describe, expect, it } from 'vitest';
import { TEST_AREAS, TEST_TIERS, UNTAGGED_SPECS, findTagProblems, testsFromReport } from '../../tools/check-test-tags.mjs';

const SELECTABLE = [...TEST_AREAS, ...TEST_TIERS].join(' ');
import { parseAreaArgs } from '../../tools/test-area.mjs';

describe('browser test area tags (decision 0012 T1.1)', () => {
  it('accepts tests with known area tags', () => {
    expect(findTagProblems([
      { file: 'battle.spec.ts', title: 'a', tags: ['@battle'] },
      { file: 'save.spec.ts', title: 'b', tags: ['@saves', '@input'] },
    ])).toEqual([]);
  });

  it('reports untagged tests and unknown tags with the file and title', () => {
    expect(findTagProblems([
      { file: 'maps.spec.ts', title: 'no tag', tags: [] },
      { file: 'maps.spec.ts', title: 'typo', tags: ['@wrold'] },
      { file: 'maps.spec.ts', title: 'mixed', tags: ['@world', '@wrold'] },
    ])).toEqual([
      'maps.spec.ts: "no tag" has no area tag',
      'maps.spec.ts: "typo" has unknown tag(s) @wrold',
      'maps.spec.ts: "typo" has no area tag',
      'maps.spec.ts: "mixed" has unknown tag(s) @wrold',
    ]);
  });

  it('exempts only the listed W2 spec', () => {
    expect(UNTAGGED_SPECS).toEqual(['window-frames.spec.ts']);
    expect(findTagProblems([{ file: 'tests/browser/window-frames.spec.ts', title: 'x', tags: [] }])).toEqual([]);
  });

  it('reads nested suites and normalizes tags from a Playwright JSON list', () => {
    const report = { suites: [{ file: 'a.spec.ts', specs: [{ title: 'top', tags: ['world'] }],
      suites: [{ title: 'group', specs: [{ title: 'inner', tags: ['@saves'] }] }] }] };
    expect(testsFromReport(report)).toEqual([
      { file: 'a.spec.ts', title: 'top', tags: ['@world'] },
      { file: 'a.spec.ts', title: 'inner', tags: ['@saves'] },
    ]);
  });

  it('turns area names into a whole-tag grep and passes Playwright options through', () => {
    expect(parseAreaArgs(['battle', '@saves', 'battle', '--list'])).toEqual({ grep: '@battle(?![\\w-])|@saves(?![\\w-])', passThrough: ['--list'], rebuild: false });
    expect(parseAreaArgs(['battle', '--rebuild'])).toEqual({ grep: '@battle(?![\\w-])', passThrough: [], rebuild: true });
    const grep = new RegExp((parseAreaArgs(['world']) as { grep: string }).grep);
    expect(grep.test('title @world')).toBe(true);
    expect(grep.test('title @worldmap')).toBe(false);
  });

  it('rejects unknown or missing areas with the known list', () => {
    expect(parseAreaArgs(['battel'])).toEqual({ error: `Unknown area "battel". Known areas: ${SELECTABLE}` });
    expect(parseAreaArgs([])).toEqual({ error: `Name at least one area: ${SELECTABLE}` });
  });

  it('accepts the smoke tier beside an area, but not as a scenario\'s only tag', () => {
    expect(TEST_TIERS).toEqual(['@smoke']);
    expect(findTagProblems([{ file: 'maps.spec.ts', title: 'quick', tags: ['@world', '@smoke'] }])).toEqual([]);
    expect(findTagProblems([{ file: 'maps.spec.ts', title: 'tier only', tags: ['@smoke'] }])).toEqual(['maps.spec.ts: "tier only" has no area tag']);
    expect(parseAreaArgs(['@smoke'])).toEqual({ grep: '@smoke(?![\\w-])', passThrough: [], rebuild: false });
  });
});
