import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAppearanceSelection } from '../../src/platform/character-selection.mjs';

const layout = JSON.parse(readFileSync('docs/asset-analysis/cute-fantasy-player.layout.json', 'utf8')) as object;
const selection = JSON.parse(readFileSync('docs/asset-analysis/starter-appearance.json', 'utf8')) as object;

const mutate = (patch: (instance: Record<string, unknown>) => void): Record<string, unknown> => {
  const copy = structuredClone(selection) as Record<string, unknown>;
  patch(copy);
  return copy;
};

const variant = (slot: string, value: unknown): ((instance: Record<string, unknown>) => void) =>
  (instance) => { (instance.variants as Record<string, unknown>)[slot] = value; };

describe('starter appearance selection', () => {
  it('accepts the recorded selection and resolves every variant to its verified family', () => {
    const result = validateAppearanceSelection(layout, selection);
    expect(result.packId).toBe('starter-hero');
    expect(result.resolutions.base).toMatchObject({ familyId: 'body', layerIndices: [2], alignment: 'master-grid', masterRowOffset: 0 });
    expect(result.resolutions.chest).toMatchObject({ familyId: 'chest', masterRowOffset: 0 });
    expect(result.resolutions.hair).toMatchObject({ familyId: 'hair', path: 'Head/Hair_4/Hair_4_Black.png' });
    expect(result.resolutions.hands).toMatchObject({ familyId: 'hands', path: 'Hands/Hands_1_Bare.png' });
    expect(result.resolutions.mount).toMatchObject({ familyId: 'horse', alignment: 'row-offset', masterRowOffset: 50 });
    expect(result.resolutions.helmet).toBeUndefined();
    expect(result.resolutions.accessory).toBeUndefined();
  });

  it('rejects unknown, escaping, and slot-mismatched variant paths', () => {
    expect(() => validateAppearanceSelection(layout, mutate(variant('feet', 'Feet/Nested/Shoes_1_Purple.png')))).toThrow(/matches no recorded asset family/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('feet', '../Feet/Shoes_1_Purple.png')))).toThrow(/may not traverse/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('feet', 'Feet\\Shoes_1_Purple.png')))).toThrow(/forward slashes/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('feet', '/Feet/Shoes_1_Purple.png')))).toThrow(/relative/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('feet', 'Chest/Farmer_Shirt/Farmer_Shirt_1_Blue.png')))).toThrow(/resolved to family chest, expected one of feet/);
  });

  it('rejects hair-and-helmet conflicts and policy contradictions', () => {
    expect(() => validateAppearanceSelection(layout, mutate(variant('helmet', 'Head/Plate_Helmet_1/Plate_Helmet_1_Gold.png')))).toThrow(/mutually exclusive/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { (copy.policy as Record<string, unknown>).head = 'helmet'; }))).toThrow(/policy.head is helmet/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('hair', null)))).toThrow(/policy.head is hair but no hair variant/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('hands', null)))).toThrow(/policy.hands is include-bare/);
  });

  it('rejects tool variants in a CA1 selection', () => {
    expect(() => validateAppearanceSelection(layout, mutate(variant('tool', 'Tools/Iron/Iron_Sword.png')))).toThrow(/no tool variant/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { (copy.policy as Record<string, unknown>).tools = 'iron'; }))).toThrow(/later packet/);
  });

  it('rejects structural damage to the selection record', () => {
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { copy.formatVersion = 2; }))).toThrow(/unknown format or formatVersion/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('base', undefined)))).toThrow(/required slot base is missing/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { copy.packId = 'Bad_Pack'; }))).toThrow(/invalid packId/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { delete copy.variants; }))).toThrow(/variants object is missing/);
    expect(() => validateAppearanceSelection({}, selection)).toThrow(/no asset families recorded/);
  });

  it('rejects a variant that overlaps an unmapped specialty export', () => {
    const hostile = structuredClone(layout) as Record<string, unknown>;
    (hostile.unmappedAssets as unknown[]).push({ relativeGlob: 'Hands/Hands_1_Bare.png', widthPx: 576, heightPx: 3584, reason: 'test overlap' });
    expect(() => validateAppearanceSelection(hostile, selection)).toThrow(/unmapped specialty export/);
  });

  it('enforces the recorded policy against the selected variants', () => {
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { (copy.policy as Record<string, unknown>).mount = 'none'; }))).toThrow(/policy.mount is none/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('mount', 'Player_Mounts/Horse/Player_Horse_Brown.png')))).toThrow(/policy.mount names Player_Horse_Gray but the recorded mount variant is Player_Mounts\/Horse\/Player_Horse_Brown.png/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('mount', null)))).toThrow(/a mount variant \(.*\) is recorded|policy.mount names a variant but no mount file/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('accessory', 'Accessories/Farmer_Hat_1.png')))).toThrow(/accessory policy is empty but an accessory variant is recorded/);
    expect(() => validateAppearanceSelection(layout, mutate(variant('accessory', 'Accessories/Wanderer_Hat_1.png')))).toThrow(/accessory policy is empty/);
    // An accessory that agrees with its policy is accepted.
    const accessorySet = mutate(variant('accessory', 'Accessories/Farmer_Hat_1.png'));
    (accessorySet.policy as Record<string, unknown>).accessory = 'Farmer_Hat_1';
    expect(validateAppearanceSelection(layout, accessorySet).resolutions.accessory).toMatchObject({ familyId: 'accessory', path: 'Accessories/Farmer_Hat_1.png' });
  });

  it('rejects a divergent recorded source hash or export root', () => {
    expect(() => validateAppearanceSelection(layout, mutate((copy) => {
      (copy.source as Record<string, unknown>).masterSha256 = 'a'.repeat(64);
    }))).toThrow(/recorded master hash does not match/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { delete (copy.source as Record<string, unknown>).masterSha256; }))).toThrow(/source\.masterSha256 is missing/);
    expect(() => validateAppearanceSelection(layout, mutate((copy) => { (copy.source as Record<string, unknown>).exportRoot = '.import/Cute_Fantasy/Other'; }))).toThrow(/export root does not match/);
  });

  it('keeps the recorded selection in step with the pinned master hash', () => {
    const pinned = layout as { source: { sha256: string } };
    const recorded = (selection as { source: { masterSha256: string } }).source.masterSha256;
    expect(recorded).toBe(pinned.source.sha256);
  });
});
