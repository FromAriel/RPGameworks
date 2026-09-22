/** Starter-appearance selection validation against the tracked sprite-sheet layout.
 * Pure: no filesystem, no pixels. The real-pixel encoder reuses `validateAppearanceSelection`
 * to resolve each recorded variant to its verified asset family before reading any file.
 */

const SLOT_RULES = /** @type {const} */ ({
  base: { families: ['body'], layerIndex: 2 },
  feet: { families: ['feet'], layerIndex: 3 },
  legs: { families: ['legs'], layerIndex: 4 },
  chest: { families: ['chest'], layerIndex: 5 },
  hair: { families: ['hair'], layerIndex: 6 },
  helmet: { families: ['helmet'], layerIndex: 6 },
  accessory: { families: ['accessory'], layerIndex: 7 },
  hands: { families: ['hands'], layerIndex: 8 },
  mount: { families: ['horse'], layerIndex: 0 },
});

const REQUIRED_SLOTS = /** @type {const} */ (['base', 'feet', 'legs', 'chest']);
const HANDS_POLICIES = /** @type {const} */ (['include-bare', 'hidden']);
const HEAD_POLICIES = /** @type {const} */ (['hair', 'helmet']);

/**
 * True when the policy's named variant matches the recorded path's file stem
 * (path source minus extension, e.g. `Player_Mounts/Horse/Player_Horse_Gray.png`
 * stems to `Player_Horse_Gray`). A null/missing naming never matches.
 * @param {string} path @param {string|null} naming
 */
function fileStemMatches(path, naming) {
  if (typeof naming !== 'string' || naming.length < 1) return false;
  const fileName = path.split('/').at(-1) ?? '';
  const stem = fileName.replace(/\.png$/i, '');
  return stem === naming;
}

/**
 * Exact-match a forward-slash relative path against one layout family glob.
 * `*` matches within one segment; every other character is literal.
 * @param {string} glob @param {string} path
 */
function globMatches(glob, path) {
  if (glob.includes('**')) return false;
  const pattern = glob.split('*').map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${pattern}$`).test(path);
}

/**
 * @param {string} path @param {string} label
 * @returns {string[]}
 */
function safePathSegments(path, label) {
  if (typeof path !== 'string' || path.length < 3) throw new Error(`${label}: variant path is missing`);
  if (path.includes('\\')) throw new Error(`${label}: variant path must use forward slashes`);
  if (path.startsWith('/') || path.endsWith('/')) throw new Error(`${label}: variant path must be relative without edge slashes`);
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw new Error(`${label}: variant path may not traverse or contain empty segments`);
  return segments;
}

/**
 * Validate one recorded selection against the tracked layout. Every rejection is a
 * validation error with the offending slot named. Returns a frozen per-slot resolution
 * (family id, layer indices, alignment, master row offset) for the real-pixel encoder.
 * @param {unknown} layout the tracked cute-fantasy-player.layout.json instance
 * @param {unknown} selection the tracked starter-appearance.json instance
 */
export function validateAppearanceSelection(layout, selection) {
  if (typeof layout !== 'object' || layout === null) throw new Error('layout is not an object');
  if (typeof selection !== 'object' || selection === null) throw new Error('selection is not an object');
  const l = /** @type {Record<string, any>} */ (layout);
  const s = /** @type {Record<string, any>} */ (selection);
  if (s.format !== 'rpgameworks.character-appearance-selection' || s.formatVersion !== 1) throw new Error('selection: unknown format or formatVersion');
  if (typeof s.packId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(s.packId)) throw new Error('selection: invalid packId');
  const variants = s.variants;
  if (typeof variants !== 'object' || variants === null) throw new Error('selection: variants object is missing');
  const policy = s.policy;
  if (typeof policy !== 'object' || policy === null) throw new Error('selection: policy object is missing');

  const families = /** @type {any[]} */ (l.assetFamilies ?? []);
  if (families.length < 1) throw new Error('layout: no asset families recorded');
  const unmapped = /** @type {any[]} */ (l.unmappedAssets ?? []);

  /** @param {string} slot */
  const resolveSlot = (slot) => {
    const rules = /** @type {Record<string, {families: readonly string[], layerIndex: number}>} */ (SLOT_RULES)[slot];
    if (!rules) throw new Error(`selection: unknown slot ${slot}`);
    const path = variants[slot];
    if (path === null || path === undefined) return null;
    safePathSegments(path, slot);
    const matchingFamilies = families.filter((/** @type {any} */ family) => typeof family.relativeGlob === 'string' && globMatches(family.relativeGlob, path));
    if (matchingFamilies.length === 0) throw new Error(`${slot}: variant ${path} matches no recorded asset family`);
    const family = matchingFamilies[0];
    if (matchingFamilies.length > 1) throw new Error(`${slot}: variant ${path} matches multiple asset families (${matchingFamilies.map((/** @type {any} */ f) => f.id).join(', ')})`);
    if (!rules.families.includes(family.id)) throw new Error(`${slot}: variant ${path} resolved to family ${family.id}, expected one of ${rules.families.join('/')}`);
    if (!family.layerIndices.includes(rules.layerIndex)) throw new Error(`${slot}: family ${family.id} does not cover layer index ${rules.layerIndex}`);
    if (unmapped.some((/** @type {any} */ entry) => typeof entry.relativeGlob === 'string' && globMatches(entry.relativeGlob, path))) {
      throw new Error(`${slot}: variant ${path} is an unmapped specialty export`);
    }
    return Object.freeze({
      slot,
      path,
      familyId: family.id,
      layerIndices: Object.freeze([...family.layerIndices]),
      alignment: family.alignment,
      masterRowOffset: family.masterRowOffset,
      sheetWidthPx: family.widthPx,
      sheetHeightPx: family.heightPx,
    });
  };

  for (const slot of REQUIRED_SLOTS) {
    if (resolveSlot(slot) === null) throw new Error(`selection: required slot ${slot} is missing`);
  }
  const headPolicy = policy.head;
  if (!HEAD_POLICIES.includes(headPolicy)) throw new Error(`selection: policy.head must be one of ${HEAD_POLICIES.join('/')}`);
  const hair = resolveSlot('hair');
  const helmet = resolveSlot('helmet');
  if (headPolicy === 'hair' && hair === null) throw new Error('selection: policy.head is hair but no hair variant is recorded');
  if (headPolicy === 'helmet' && helmet === null) throw new Error('selection: policy.head is helmet but no helmet variant is recorded');
  if (hair !== null && helmet !== null) throw new Error('selection: hair and helmet are mutually exclusive head layers');
  if (hair !== null && headPolicy !== 'hair') throw new Error('selection: hair variant recorded but policy.head is not hair');
  if (helmet !== null && headPolicy !== 'helmet') throw new Error('selection: helmet variant recorded but policy.head is not helmet');

  const handsPolicy = policy.hands;
  if (!HANDS_POLICIES.includes(handsPolicy)) throw new Error(`selection: policy.hands must be one of ${HANDS_POLICIES.join('/')}`);
  const hands = resolveSlot('hands');
  if (handsPolicy === 'include-bare' && hands === null) throw new Error('selection: policy.hands is include-bare but no hands variant is recorded');
  if (handsPolicy === 'hidden' && hands !== null) throw new Error('selection: policy.hands is hidden but a hands variant is recorded');

  if (policy.tools !== 'none') throw new Error('selection: CA1 selections carry no tool variants; tool run selection is a later packet');
  if (variants.tool !== null && variants.tool !== undefined) throw new Error('selection: no tool variant may be recorded in a CA1 selection');
  const mount = resolveSlot('mount');
  const mountNaming = /** @type {string} */ (typeof policy.mount === 'string' && policy.mount !== 'none' ? policy.mount : null);
  if (mount !== null && policy.mount === 'none') throw new Error('selection: policy.mount is none but a mount variant is recorded');
  if (mount !== null && mountNaming === null) throw new Error(`selection: a mount variant (${mount.path}) is recorded but policy.mount does not name it`);
  if (mountNaming !== null && mount === null) throw new Error('selection: policy.mount names a variant but no mount file is recorded');
  if (mount !== null && !fileStemMatches(mount.path, mountNaming)) throw new Error(`selection: policy.mount names ${String(mountNaming)} but the recorded mount variant is ${mount.path}`);
  const accessory = resolveSlot('accessory');
  const accessoryPolicy = policy.accessory;
  const accessoryNaming = /** @type {string} */ (typeof accessoryPolicy === 'string' && accessoryPolicy !== 'none' ? accessoryPolicy : null);
  if (accessoryNaming === null && accessory !== null) throw new Error('selection: accessory policy is empty but an accessory variant is recorded');
  if (accessoryNaming !== null && accessory === null) throw new Error('selection: policy.accessory names a variant but no accessory file is recorded');
  if (accessory !== null && !fileStemMatches(accessory.path, accessoryNaming)) throw new Error(`selection: policy.accessory names ${String(accessoryNaming)} but the recorded accessory variant is ${accessory.path}`);

  const masterSha256 = s.source?.masterSha256;
  if (typeof masterSha256 !== 'string') throw new Error('selection: source.masterSha256 is missing');
  if (masterSha256 !== l.source?.sha256) throw new Error('selection: recorded master hash does not match the tracked layout source hash');
  const exportRoot = s.source?.exportRoot;
  if (exportRoot !== l.source?.exportRoot) throw new Error('selection: recorded export root does not match the tracked layout source root');

  /** @type {Record<string, ReturnType<typeof resolveSlot>>} */
  const resolutions = {};
  for (const slot of Object.keys(SLOT_RULES)) {
    const resolved = resolveSlot(slot);
    if (resolved !== null) resolutions[slot] = resolved;
  }
  return Object.freeze({ packId: s.packId, resolutions: Object.freeze(resolutions) });
}
