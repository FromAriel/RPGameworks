/**
 * Style catalog, ported from Pixel Frame `styles.js`. Tiers: control (dense widgets), panel,
 * showpiece (dialogs), neutral (around artwork: grey only, no tint or specular).
 */
import type { Profile } from './profile.ts';

export type StyleTier = 'control' | 'panel' | 'showpiece' | 'neutral';

export interface FrameStyle {
  readonly name: string;
  readonly tier: StyleTier;
  readonly profile: Profile;
  readonly corner?: string | null;
  readonly motif?: { readonly art: string; readonly period: number } | null;
  readonly medallion?: string | null;
  readonly center?: string | null;
  readonly inset?: boolean;
  readonly neutral?: boolean;
  readonly widget?: boolean;
  readonly edgeMat?: 'accent';
  /** Set by flair "off": a flat 1-px border with no lighting. */
  readonly flat?: boolean;
  readonly desc?: string;
}

export const STYLES = {
  flat: { name: 'Flat bar', tier: 'control', profile: [1, 2, 2, 1], corner: 'notch', desc: 'Two-pixel plateau with a 1-px corner notch, for buttons and tabs.' },
  round: { name: 'Round bar', tier: 'panel', profile: [1, 3, 4, 3, 1], corner: 'rivetBoss', desc: 'The default raised metal bar; a single centred ridge catches the highlight.' },
  rail: { name: 'Double rail', tier: 'panel', profile: [2, 4, 2, 1, 2, 4, 2], corner: 'squareBoss', desc: 'Two ridges with a groove between them.' },
  riveted: { name: 'Riveted plate', tier: 'panel', profile: [1, 2, 2, 2, 2, 2, 1], corner: 'plateCorner', motif: { art: 'rivet', period: 14 }, desc: 'Flat plate with evenly spaced rivets.' },
  gem: { name: 'Gem boss', tier: 'showpiece', profile: [1, 3, 4, 3, 1], corner: 'gemBoss', desc: 'Square bosses with cabochon gems that glow on focus.' },
  fleur: { name: 'Fleur-de-lis', tier: 'showpiece', profile: [1, 3, 4, 3, 1], corner: 'fleur', desc: 'Corner fleur-de-lis that overhangs the box.' },
  rosette: { name: 'Rosette', tier: 'showpiece', profile: [1, 3, 4, 3, 1], corner: 'rosette', desc: 'Compass-rose rosette centred on the bar.' },
  filigree: { name: 'Filigree', tier: 'showpiece', profile: [1, 2, 1], corner: 'scroll', desc: 'Thin 1-px scrolls.' },
  medallion: { name: 'Medallion', tier: 'showpiece', profile: [1, 3, 4, 3, 1], corner: 'rivetBoss', medallion: 'medal', desc: '11-slice: a centred medallion on the top and bottom edges.' },
  inset: { name: 'Inset well', tier: 'control', profile: [1, 2, 3, 3], corner: 'notch', inset: true, desc: 'The same bar with its normals negated, read as a recess.' },
  neutral: { name: 'Neutral frame', tier: 'neutral', profile: [1, 2, 1], neutral: true, desc: 'Grey only, for framing artwork.' },
  swatch: { name: 'Swatch well', tier: 'neutral', profile: [2, 1], inset: true, neutral: true, desc: 'Tiny neutral inset for palette swatches.' },
  track: { name: 'Slider track', tier: 'control', profile: [1, 2, 2], corner: 'notch', inset: true, widget: true, desc: 'Recessed channel for sliders.' },
  knob: { name: 'Slider knob', tier: 'control', profile: [1, 2, 1], corner: 'notch', center: 'knobGem', widget: true, desc: 'Small raised boss with a gem.' },
  plate: { name: 'Nameplate', tier: 'control', profile: [1, 2, 2, 1], corner: 'notch', edgeMat: 'accent', widget: true, desc: 'Accent-metal plate for panel titles.' },
  thumb: { name: 'Scroll thumb', tier: 'control', profile: [1, 2, 1], corner: 'cornerRivet', widget: true, desc: 'Plate with a rivet in each corner, for scrollbar thumbs.' },
} as const satisfies Record<string, FrameStyle>;

export type StyleId = keyof typeof STYLES;

export function isStyleId(id: string): id is StyleId {
  return Object.hasOwn(STYLES, id);
}

export function resolveStyle(ref: StyleId | FrameStyle | undefined): FrameStyle {
  if (ref && typeof ref === 'object') return ref;
  return ref && isStyleId(ref) ? STYLES[ref] : STYLES.round;
}

export type Flair = 'full' | 'subtle' | 'off';

/** full = as designed; subtle = no motifs or medallions, showpiece corners become small bosses; off = flat 1-px border. */
export function applyFlair(style: FrameStyle, flair: Flair): FrameStyle {
  if (flair === 'off') return { ...style, profile: [1, 1], corner: null, motif: null, medallion: null, flat: true };
  if (flair === 'subtle') {
    const corner = style.tier === 'showpiece' ? (style.profile.length >= 5 ? 'rivetBoss' : 'notch') : style.corner ?? null;
    return { ...style, motif: null, medallion: null, corner };
  }
  return style;
}
