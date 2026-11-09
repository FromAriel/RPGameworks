/**
 * Frame presets the game bakes (decision 0010 §3). Each preset is a style, a theme, bake settings
 * and an interior fill. The colours are a starting point for play review; W2.2 moves the choice of
 * preset into a schema-validated UI theme file.
 */
import type { BakeSettings } from './bake.ts';
import type { Fill } from './fill.ts';
import { RAMPS } from './palettes.ts';
import type { Theme } from './palettes.ts';
import type { FrameStyle } from './styles.ts';

export interface FramePreset {
  readonly id: string;
  readonly description: string;
  readonly style: FrameStyle;
  readonly theme: Theme;
  readonly settings: BakeSettings;
  readonly fill: Fill;
}

/** White-to-pale-blue border ramp, darkest first. */
const FF_BORDER = ['#1a2250', '#4c5ca0', '#8fa2d8', '#c4cdec', '#e8ecf6', '#ffffff'] as const;

/**
 * Final Fantasy-style window: a thin bevelled light border with a dark outline and a 1-px corner
 * notch, no ornaments, brushed metal or wear, over a deep blue banded fill. Replaces M5.3c's
 * hard-coded PANEL_STYLE (W2.2).
 */
export const FF_WINDOW: FramePreset = {
  id: 'ff-window',
  description: 'Classic JRPG blue window (Ariel\'s chosen battle look)',
  // Two-pixel bevel: the light from the top left gives a white inner line on every side and a
  // pale-blue outer line, closest to the M5.3c panel among the variants compared on November 9.
  style: { name: 'FF window', tier: 'panel', profile: [1, 2], corner: 'notch' },
  theme: { name: 'FF blue', metal: FF_BORDER, accent: FF_BORDER, gem: RAMPS.gemBlue, patina: { metal: null, accent: null } },
  settings: {
    az: 225, el: 40, steps: 6, dither: false, outline: true, shadow: false,
    normalMode: 'profile', strength: 0.8, brushed: false, ao: 0, wear: 0, glow: 0,
    flair: 'full', ornament: 'medium', animate: false, contrast: 'normal',
  },
  fill: { kind: 'bands', top: '#3050b8', bottom: '#0c1854', band: 4 },
};

export const PRESETS: readonly FramePreset[] = [FF_WINDOW];
