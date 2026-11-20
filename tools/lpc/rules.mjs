// Decision 0019 (S1.5a): DanJen Delver's LPC recipe rules (lib/lpc/rules.mjs, Ariel's code), copied unchanged below
// this header. They run only in the import tool, against a local LPC generator checkout's catalog; the repository
// keeps only what our recipes resolve to (tools/lpc/import.mjs), never the generator's GPL part definitions.
/** Source-driven LPC rules. No image reduction or character-specific resizing. */
export class RecipeError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
const fail = (code, detail) => { throw new RecipeError(code, detail); };
const filename = value => value.replaceAll(' ', '_');

export function recolorChannels(definition) {
  if (!definition.recolors) return [];
  const numbered = [];
  for (let i = 1; definition.recolors[`color_${i}`]; i++) numbered.push([`color_${i}`, definition.recolors[`color_${i}`]]);
  return numbered.length ? numbered : [['color_1', definition.recolors]];
}

export function paletteMappings(catalog, selection, bodyColor) {
  const component = catalog.components[selection.id];
  const definition = component.raw;
  return recolorChannels(definition).map(([channel, config]) => {
    const meta = catalog.materials[config.material];
    if (!meta) fail('UNKNOWN_MATERIAL', config.material);
    const base = config.base || `${meta.default}.${meta.base}`;
    const baseId = `${config.material}.${base.includes('.') ? base : `${meta.default}.${base}`}`;
    const source = config.source || catalog.palettes.find(p => p.palette_id === baseId)?.ramp;
    if (!source) fail('MISSING_BASE_PALETTE', baseId);
    const requested = selection.recolors?.[channel] || selection.recolors?.[config.type_name]
      || (channel === 'color_1' && definition.match_body_color ? bodyColor : null);
    if (!requested) return { channel, source, target: source, option: null };
    const option = catalog.colors[selection.id]?.[channel]?.[requested];
    if (!option) fail('ILLEGAL_RECOLOR', `${selection.id}/${channel}/${requested}`);
    const target = JSON.parse(option.ramp);
    return { channel, source, target, option: requested };
  });
}

export function resolveRecipe(catalog, recipe, action = 'idle') {
  const bodyType = recipe.bodyType || 'male';
  if (!catalog.controls.body_types.includes(bodyType)) fail('UNKNOWN_BODY', bodyType);
  const selected = new Map();
  const tags = new Set();
  for (const selection of recipe.selections) {
    const component = catalog.components[selection.id];
    if (!component) fail('UNKNOWN_COMPONENT', selection.id);
    const type = component.raw.type_name;
    if (selected.has(type)) fail('DUPLICATE_SLOT', type);
    selected.set(type, selection);
    for (const tag of component.raw.tags || []) tags.add(tag);
  }
  if (!selected.has('body') || !selected.has('head')) fail('INCOMPLETE_CHARACTER', 'body and explicit head required');
  const bodyColor = selected.get('body').recolors?.color_1;
  const custom = catalog.customAnimations?.[action];
  const folder = catalog.controls.animations.find(a => a.id === action)?.folder_name || action;
  const calls = [];
  let order = 0;
  for (const selection of recipe.selections) {
    const component = catalog.components[selection.id], definition = component.raw;
    for (const tag of definition.required_tags || []) if (!tags.has(tag)) fail('REQUIRED_TAG', `${selection.id}/${tag}`);
    for (const tag of definition.excluded_tags || []) if (tags.has(tag)) fail('EXCLUDED_TAG', `${selection.id}/${tag}`);
    const actions = definition.animations || catalog.controls.default_animations;
    if (!actions.includes(action) && !custom) fail('UNSUPPORTED_ACTION', `${selection.id}/${action}`);
    const mappings = paletteMappings(catalog, selection, bodyColor);
    for (let number = 1; number < 10; number++) {
      const layer = definition[`layer_${number}`];
      if (!layer) break;
      if (layer.custom_animation && layer.custom_animation !== action) continue;
      if (!custom && layer.custom_animation) continue;
      if (custom && !layer.custom_animation) continue; // Base layers for custom actions are resolved per source command.
      let base = layer[bodyType];
      if (!base) fail('UNSUPPORTED_BODY', `${selection.id}/layer_${number}/${bodyType}`);
      base = base.replace(/\$\{([^}]+)\}/g, (_, type) => {
        const dependency = selected.get(type);
        if (!dependency) fail('MISSING_DEPENDENCY', `${selection.id}/${type}`);
        const name = filename(catalog.components[dependency.id].raw.name);
        const replacement = definition.replace_in_path?.[type]?.[name];
        if (!replacement) fail('UNRESOLVED_PATH', `${selection.id}/${type}/${name}`);
        return replacement;
      });
      let variant = selection.variant;
      const hasRecolor = mappings.length > 0;
      if (!hasRecolor) {
        variant ||= definition.variants?.[0];
        if (!definition.variants?.includes(variant)) fail('ILLEGAL_VARIANT', `${selection.id}/${variant}`);
      }
      const path = layer.custom_animation
        ? `spritesheets/${base}${variant ? filename(variant) : ''}.png`
        : `spritesheets/${base}${folder}${hasRecolor ? '' : `/${filename(variant)}`}.png`;
      const key = catalog.paths[path];
      if (!key) fail('MISSING_OR_UNADMITTED_SOURCE', path);
      calls.push({ id: selection.id, layer: number, z: layer.zPos ?? 100, order: order++, path,
        key, mappings, custom: layer.custom_animation || null, credits: definition.credits || [], variant });
    }
  }
  return calls.sort((a, b) => a.z - b.z || a.order - b.order);
}

export function recolorPixels(image, mappings) {
  const pairs = mappings.flatMap(mapping => mapping.source.flatMap((color, i) =>
    mapping.target[i] ? [{ source: hex(color), target: hex(mapping.target[i]) }] : []));
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const pair = pairs.find(p => p.source.every((value, c) => Math.abs(data[i + c] - value) <= 1));
    if (pair) data.set(pair.target, i);
  }
  return { width: image.width, height: image.height, data };
}

function hex(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) fail('INVALID_COLOR', value);
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
}
