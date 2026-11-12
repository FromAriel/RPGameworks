import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';
import { SURFACES, checkMapSkins, emitUiTheme, pngSize, readUiTheme } from '../../tools/ui-theme.mjs';
import { SKIN_SPECS, buildSkin } from '../fixtures/skin-fixtures';

const BASE = 'demo:skin.midnight-silver';
const surfaces = (id = BASE) => Object.fromEntries(SURFACES.map((s) => [s, id]));
const demoTheme = JSON.parse(readFileSync('content/games/demo/ui-theme.json', 'utf8')) as unknown;
const noMaps = new Map<string, unknown>(), noFiles = new Map<string, string>();
const read = (themeJson: unknown, skinRoot = 'assets/source/ui', maps = noMaps) => readUiTheme({ themeFile: 'ui-theme.json', themeJson, skinRoot, maps, mapFiles: noFiles });

/** A temporary skin library with Ariel's skin and one fixture skin, for breaking things safely. */
const root = mkdtempSync(path.join(tmpdir(), 'rpg-theme-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
mkdirSync(path.join(root, 'base'));
writeFileSync(path.join(root, 'base/Window.png'), readFileSync('assets/source/ui/base/Window.png'));
writeFileSync(path.join(root, 'base/Window.manifest.json'), readFileSync('assets/source/ui/base/Window.manifest.json'));
const thin = buildSkin(SKIN_SPECS[0]!);
mkdirSync(path.join(root, 'thin'));
const png = new PNG({ width: thin.width, height: thin.height }); thin.pixels.copy(png.data);
writeFileSync(path.join(root, 'thin/fixture.png'), PNG.sync.write(png));
writeFileSync(path.join(root, 'thin/skin.json'), JSON.stringify(thin.skin));
const two = { schemaVersion: 1, skins: [{ id: BASE, manifest: 'base/Window.manifest.json' }, { id: 'demo:skin.thin', manifest: 'thin/skin.json' }], surfaces: { ...surfaces(), inventory: 'demo:skin.thin' } };

describe('UI theme (decision 0011 W3.4)', () => {
  it('accepts the demo theme: the baked White and Silver skin on all six surfaces, Ariel’s skin still available', () => {
    const theme = read(demoTheme);
    expect(theme.skins.map((s) => s.id)).toEqual(['demo:skin.white-silver', BASE]);
    expect(theme.skins[0]!.atlas.equals(readFileSync('assets/source/ui/skins/white-silver/Window.png'))).toBe(true);
    expect(theme.skins[1]!.atlas.equals(readFileSync('assets/source/ui/base/Window.png'))).toBe(true);
    expect(Object.keys(theme.theme.surfaces)).toEqual([...SURFACES]);
    expect(new Set(Object.values(theme.theme.surfaces))).toEqual(new Set(['demo:skin.white-silver']));
  });

  it('accepts a second skin on one surface and emits hashed atlases, normalized manifests and a generated theme', () => {
    const theme = read(two, root);
    const staging = mkdtempSync(path.join(root, 'out-'));
    const file = emitUiTheme(staging, theme);
    expect(file).toMatch(/^ui-theme\.[a-f0-9]{12}\.json$/);
    const generated = JSON.parse(readFileSync(path.join(staging, file), 'utf8')) as { skins: { id: string; manifest: string; atlas: string }[]; surfaces: Record<string, string> };
    expect(generated.surfaces.inventory).toBe('demo:skin.thin');
    for (const skin of generated.skins) {
      expect(skin.atlas).toMatch(/^skins\/[a-z0-9-]+\.[a-f0-9]{12}\.png$/);
      const manifest = JSON.parse(readFileSync(path.join(staging, skin.manifest), 'utf8')) as { formatVersion: number; image: string };
      expect(manifest.formatVersion).toBe(2); // v1 manifests are emitted as their v2 reading.
      expect(`skins/${manifest.image}`).toBe(skin.atlas);
    }
    expect(readFileSync(path.join(staging, generated.skins[0]!.atlas)).equals(readFileSync('assets/source/ui/base/Window.png'))).toBe(true);
  });

  it('rejects broken themes and skins with the file, path and reason', () => {
    const cases: [string, unknown, RegExp][] = [
      ['unknown surface skin', { ...two, surfaces: { ...two.surfaces, saves: 'demo:skin.nowhere' } }, /\/surfaces\/saves: unknown skin demo:skin\.nowhere/],
      ['duplicate skin', { ...two, skins: [...two.skins, two.skins[0]] }, /\/skins\/2\/id: duplicate skin/],
      ['missing manifest', { ...two, skins: [two.skins[0], { id: 'demo:skin.thin', manifest: 'thin/missing.json' }] }, /thin\/missing\.json does not exist/],
      ['escaping path', { ...two, skins: [two.skins[0], { id: 'demo:skin.thin', manifest: '../outside.json' }] }, /\/skins\/1\/manifest: must match pattern|leaves assets\/source\/ui/],
      ['missing surface', { ...two, surfaces: { ...surfaces(), battle: undefined } }, /must have required property 'battle'/],
    ];
    for (const [name, theme, pattern] of cases) expect(() => read(theme, root), name).toThrow(pattern);
  });

  it('rejects an invalid skin manifest and an atlas whose size does not match it', () => {
    writeFileSync(path.join(root, 'thin/bad.json'), JSON.stringify({ ...thin.skin, tiles: thin.skin.tiles.filter((t) => t.id !== 'title.fill') }));
    expect(() => read({ ...two, skins: [two.skins[0], { id: 'demo:skin.thin', manifest: 'thin/bad.json' }] }, root)).toThrow(/is not a valid window skin: Missing required tile: title\.fill/);
    writeFileSync(path.join(root, 'thin/big.json'), JSON.stringify({ ...thin.skin, size: { width: thin.width + 2, height: thin.height } }));
    expect(() => read({ ...two, skins: [two.skins[0], { id: 'demo:skin.thin', manifest: 'thin/big.json' }] }, root)).toThrow(/atlas is \d+ × \d+, but thin\/big\.json declares/);
    expect(() => pngSize(Buffer.from('not a png'), 'x')).toThrow('x: not a PNG image');
  });

  it('checks every skin a map message or dialogue names', () => {
    const maps = new Map([['demo:map.a', { messages: [{ id: 'chest', skin: 'demo:skin.rusted' }], dialogues: [] }]]);
    const files = new Map([['demo:map.a', 'maps/a.json']]);
    expect(() => checkMapSkins(maps, files, new Set([BASE]), 'ui-theme.json')).toThrow('maps/a.json /messages/0/skin: unknown skin demo:skin.rusted (not in ui-theme.json)');
    expect(() => checkMapSkins(maps, files, new Set(), undefined)).toThrow('maps/a.json /messages/0/skin: demo:skin.rusted needs a UI theme, but game.json has no uiThemeFile');
    expect(() => checkMapSkins(maps, files, new Set(['demo:skin.rusted']), 'ui-theme.json')).not.toThrow();
  });
});
