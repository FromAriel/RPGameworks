import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_ART_ALLOWED, EXTERNAL_ART_ROOTS, findExternalArtViolations } from '../../tools/check-external-art.mjs';

const insideGitWorkTree = (() => {
  try { return execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'; }
  catch { return false; }
})();

describe('external-art guard (decision 0007)', () => {
  it('flags paths under every local-only art root', () => {
    const paths = [
      'external/lpc/spritesheets/body/male/walk.png',
      'public/external/hero.rpgpack',
      '.import/Cute_Fantasy/Player.png',
    ];
    expect(findExternalArtViolations(paths)).toEqual(paths);
  });

  it('allows only the folder README inside the roots', () => {
    expect(EXTERNAL_ART_ALLOWED).toEqual(['external/README.md']);
    expect(findExternalArtViolations(['external/README.md'])).toEqual([]);
    expect(findExternalArtViolations(['external/readme.md.png'])).toEqual(['external/readme.md.png']);
  });

  it('ignores case and Windows separators the way a Windows checkout would', () => {
    expect(findExternalArtViolations(['External/Tiles/dcss/rat.png', 'PUBLIC\\External\\a.png', './.Import/x'])).toHaveLength(3);
  });

  it('does not flag ordinary repository paths or look-alike names', () => {
    expect(findExternalArtViolations([
      'src/presentation/map-view.ts',
      'public/character/starter-hero.rpgpack',
      'docs/decisions/0007-public-repo-external-art-assets.md',
      'externally/notes.md',
      'tools/external/fetch.mjs',
      'public/externals/a.png',
    ])).toEqual([]);
  });

  it.skipIf(!insideGitWorkTree)('covers the roots that .gitignore keeps local', () => {
    expect([...EXTERNAL_ART_ROOTS]).toEqual(['external/', 'public/external/', '.import/']);
    for (const probe of ['external/probe.png', 'public/external/probe.png', '.import/probe.png']) {
      const ignored = execFileSync('git', ['check-ignore', '--no-index', '-v', probe], { encoding: 'utf8' });
      expect(ignored).toContain('.gitignore');
    }
    expect(() => execFileSync('git', ['check-ignore', '--no-index', 'external/README.md'], { stdio: 'ignore' })).toThrow();
  });
});
