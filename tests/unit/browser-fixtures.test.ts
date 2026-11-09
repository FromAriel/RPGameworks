import { describe, expect, it } from 'vitest';
import { OUTPUT_PAGES, PUBLIC_OUTPUT_DIRS, STAMP_FILE, STAMP_VERSION, fixtureStatus, hashEntries } from '../../tools/browser-fixtures.mjs';

const outputs = { 'dist/index.html': 'aaa', '.tmp/ui-gallery-dist/index.html': 'bbb' };
const stamp = { version: STAMP_VERSION, inputHash: 'h1', outputs };

describe('browser fixture freshness (decision 0012 T1.3)', () => {
  it('reuses fixtures only when inputs and both built pages match the stamp', () => {
    expect(fixtureStatus({ inputHash: 'h1', outputs, stamp })).toEqual({ fresh: true, reason: 'inputs and built pages match the last fixture build' });
  });

  it('builds when there is no stamp or an old stamp format', () => {
    expect(fixtureStatus({ inputHash: 'h1', outputs, stamp: null }).fresh).toBe(false);
    expect(fixtureStatus({ inputHash: 'h1', outputs, stamp: { ...stamp, version: STAMP_VERSION + 1 } })).toEqual({ fresh: false, reason: 'stamp format changed' });
  });

  it('builds when any input changed', () => {
    expect(fixtureStatus({ inputHash: 'h2', outputs, stamp })).toEqual({ fresh: false, reason: 'build inputs changed' });
  });

  it('builds when an output is missing or was replaced by a different build', () => {
    expect(fixtureStatus({ inputHash: 'h1', outputs: { ...outputs, 'dist/index.html': null }, stamp })).toEqual({ fresh: false, reason: 'missing dist/index.html' });
    expect(fixtureStatus({ inputHash: 'h1', outputs: { ...outputs, 'dist/index.html': 'other' }, stamp })).toEqual({ fresh: false, reason: 'dist/index.html differs from the stamped build' });
  });

  it('hashes entries independently of order and tells a missing file from an empty one', () => {
    const a = Buffer.from('a'), empty = Buffer.alloc(0);
    expect(hashEntries([['x', a], ['y', empty]])).toBe(hashEntries([['y', empty], ['x', a]]));
    expect(hashEntries([['x', a], ['y', empty]])).not.toBe(hashEntries([['x', a], ['y', null]]));
    expect(hashEntries([['x', a]])).not.toBe(hashEntries([['x', Buffer.from('b')]]));
    expect(hashEntries([['x', a]])).not.toBe(hashEntries([['z', a]]));
  });

  it('keeps the stamp in an ignored folder and watches both entry pages', () => {
    expect(STAMP_FILE.startsWith('.tmp/')).toBe(true);
    expect(OUTPUT_PAGES).toEqual(['dist/index.html', '.tmp/ui-gallery-dist/index.html']);
    expect(PUBLIC_OUTPUT_DIRS).toEqual(['public/generated']);
  });
});
