import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync(new URL('../../src/presentation/ui/tokens.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing UI token --${name}`);
  return match[1]!.trim();
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Expected six-digit hex color, received ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const channels = rgb(hex).map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

const surfaceNames = ['ui-surface-strong', 'ui-surface', 'ui-surface-raised', 'ui-surface-hover'] as const;

describe('Workshop Astral UI tokens', () => {
  test('pins the approved semantic palette and aliases', () => {
    expect(token('ui-cyan')).toBe('#87cbe6');
    expect(token('ui-brass')).toBe('#c9b78b');
    expect(token('ui-violet')).toBe('#a58cf0');
    expect(token('ui-success')).toBe('#7fc79a');
    expect(token('ui-warning')).toBe('#e0b76a');
    expect(token('ui-danger')).toBe('#df8585');
    expect(token('ui-selection')).toBe('var(--ui-cyan)');
    expect(token('ui-information')).toBe('var(--ui-cyan)');
    expect(token('ui-authored-importance')).toBe('var(--ui-brass)');
    expect(token('ui-magic')).toBe('var(--ui-violet)');
    expect(token('ui-authored-text-bright')).toBe('#f2dda6');
    expect(token('ui-authored-text-outline')).toBe('rgb(0 0 0 / 50%)');
    expect(token('ui-glow-pulse-duration')).toBe('1800ms');
    expect(token('ui-touch-target')).toBe('44px');
  });

  test('normal text roles meet 4.5 to 1 on every standard surface', () => {
    const textNames = ['ui-text-primary', 'ui-text-muted', 'ui-text-title', 'ui-text-diagnostic'] as const;
    for (const textName of textNames) {
      for (const surfaceName of surfaceNames) {
        expect(contrast(token(textName), token(surfaceName)), `${textName} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('ordinary semantic accents meet normal-text contrast on every standard surface', () => {
    const accentNames = ['ui-cyan', 'ui-brass', 'ui-authored-text-bright', 'ui-success', 'ui-warning'] as const;
    for (const accentName of accentNames) {
      for (const surfaceName of surfaceNames) {
        expect(contrast(token(accentName), token(surfaceName)), `${accentName} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('violet and danger are prohibited as normal text on hover but remain valid indicators', () => {
    for (const accentName of ['ui-violet', 'ui-danger'] as const) {
      for (const surfaceName of surfaceNames.slice(0, 3)) {
        expect(contrast(token(accentName), token(surfaceName)), `${accentName} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
      }
      const hoverRatio = contrast(token(accentName), token('ui-surface-hover'));
      expect(hoverRatio, `${accentName} on ui-surface-hover is intentionally prohibited for normal text`).toBeLessThan(4.5);
      expect(hoverRatio, `${accentName} on ui-surface-hover remains a valid non-text indicator`).toBeGreaterThanOrEqual(3);
    }
  });

  test('neutral focus remains a 3 to 1 non-text indicator on every standard surface', () => {
    for (const surfaceName of surfaceNames) {
      expect(contrast(token('ui-focus-ring'), token(surfaceName)), `focus ring on ${surfaceName}`).toBeGreaterThanOrEqual(3);
    }
  });
});
