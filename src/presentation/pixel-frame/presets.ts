/**
 * Frame presets from the game's UI theme file (decision 0010 §4). Each window surface in the theme
 * becomes a preset: a style, a theme, bake settings and an interior fill. Changing a window's look
 * is a content edit plus a rebuild.
 */
import type { UiTheme, Window as ThemeWindow } from '../../content/generated/ui-theme';
import type { BakeSettings } from './bake.ts';
import type { Fill } from './fill.ts';
import { RAMPS, THEMES, themeFromBase } from './palettes.ts';
import type { Theme } from './palettes.ts';
import { STYLES } from './styles.ts';
import type { FrameStyle } from './styles.ts';

export type { UiTheme, ThemeWindow };

export interface FramePreset {
  /** The window surface this look is for, such as "battle". */
  readonly id: string;
  readonly description: string;
  readonly style: FrameStyle;
  readonly theme: Theme;
  readonly settings: BakeSettings;
  readonly fill: Fill;
}

function styleOf(window: ThemeWindow): FrameStyle {
  const frame = window.frame;
  if ('style' in frame) return STYLES[frame.style];
  return { name: 'Custom window', tier: 'panel', profile: frame.profile, corner: frame.corner ?? null };
}

function themeOf(window: ThemeWindow): Theme {
  const colors = window.colors;
  if ('theme' in colors) return THEMES[colors.theme];
  if ('base' in colors) return themeFromBase(colors.base);
  return { name: 'Custom ramp', metal: colors.ramp, accent: colors.ramp, gem: RAMPS.gemBlue, patina: { metal: null, accent: null } };
}

/** One preset per window surface. Plain windows: no brushed metal, wear or contact shadow; profile normals. */
export function presetsFromTheme(theme: UiTheme): FramePreset[] {
  return Object.entries(theme.windows).map(([surface, window]) => ({
    id: surface,
    description: window.description,
    style: styleOf(window),
    theme: themeOf(window),
    settings: {
      az: window.light.azimuth, el: window.light.elevation, steps: window.light.steps,
      outline: window.light.outline, shadow: window.light.shadow, dither: false,
      normalMode: 'profile', strength: 0.8, brushed: false, ao: 0, wear: 0, glow: 0,
      flair: 'full', ornament: window.ornament ?? 'medium', animate: false, contrast: 'normal',
    },
    fill: window.fill,
  }));
}
