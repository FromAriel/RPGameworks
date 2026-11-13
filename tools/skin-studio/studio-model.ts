/**
 * Skin studio edits (decision 0013 B4): small pure helpers that change a recipe draft. The page keeps the draft as an
 * ordinary recipe object, so what it saves is exactly what `npm run skins` reads.
 */
import type { SkinRecipe } from '../../src/content/generated/skin-recipe';

export type Draft = SkinRecipe;
export type Flair = 'full' | 'subtle' | 'off';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Pixel Frame's flair as a shortcut (B4-Q2): full restores the recipe's own ornaments; subtle keeps its corner and drops
 * the motif and medallions; off also swaps the corner for a small plain notch. The result stays an explicit recipe.
 */
export function applyFlair(draft: Draft, original: Draft, flair: Flair): Draft {
  const next: Draft = clone(draft);
  delete next.motif; delete next.medallions;
  if (flair === 'full') {
    next.corner = clone(original.corner);
    if (original.motif) next.motif = clone(original.motif);
    if (original.medallions) next.medallions = clone(original.medallions);
  } else if (flair === 'subtle') {
    next.corner = clone(original.corner);
  } else {
    next.corner = { art: { library: 'notch' }, size: 'small' };
  }
  return next;
}

/** Bevel heights typed as "3 2" or "1, 3, 4". */
export function parseProfile(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => !/^\d$/.test(p))) return null;
  return parts.map(Number);
}

/** A colour ramp typed as hex colours separated by spaces or commas; empty means "use the theme's". */
export function parseRamp(text: string): string[] | null | undefined {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length) return undefined;
  return parts.every((p) => /^#[0-9a-fA-F]{6}$/.test(p)) ? parts.map((p) => p.toLowerCase()) : null;
}

/** The same thickness on every side. */
export function withBand(draft: Draft, band: number): Draft {
  return { ...clone(draft), band: { top: band, right: band, bottom: band, left: band } };
}

export type FillType = 'flat' | 'gradient' | 'bands';
/** The start and end colours of any fill (a flat fill's single colour is both). */
export function fillColors(draft: Draft): { from: string; to: string } {
  const f = draft.fill;
  if (f.type === 'gradient') return { from: f.from ?? '#000000', to: f.to ?? '#000000' };
  if (f.type === 'bands') return { from: f.top ?? '#000000', to: f.bottom ?? '#000000' };
  return { from: f.color ?? '#000000', to: f.color ?? '#000000' };
}

/** Switch the fill kind, keeping its colours; a new gradient runs top to bottom in 16 bands. */
export function withFillType(draft: Draft, type: FillType): Draft {
  const { from, to } = fillColors(draft);
  const fill: Draft['fill'] = type === 'flat' ? { type, color: from }
    : type === 'gradient' ? { type, from, to, steps: 16, direction: 'down' }
      : { type, top: from, bottom: to, bandHeight: 4, tileHeight: 16 };
  return { ...clone(draft), fill };
}

/** Set a fill's start or end colour (a flat fill has only the one). */
export function withFillColor(draft: Draft, end: 'from' | 'to', hex: string): Draft {
  const next = clone(draft), f = next.fill;
  if (f.type === 'flat') f.color = hex;
  else if (f.type === 'gradient') f[end] = hex;
  else f[end === 'from' ? 'top' : 'bottom'] = hex;
  return next;
}

/** The recipe as the studio saves it: two-space JSON with a final newline, like the committed recipes. */
export function recipeText(draft: Draft): string {
  return `${JSON.stringify(draft, null, 2)}\n`;
}
