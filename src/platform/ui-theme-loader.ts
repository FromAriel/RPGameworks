import type { GameManifest } from '../content/generated/game';
import type { SkinChoice, WindowSkinSource } from '../presentation/ui/windowskin';
import { fetchContent } from './map-loader';

/** The surfaces a UI theme names (decision 0011 W3.4); the same list the content build validates. */
export const SKIN_SURFACES = ['dialogue', 'inventory', 'saves', 'settings', 'confirmation', 'battle'] as const;

interface GeneratedTheme { schemaVersion: 1; skins: { id: string; manifest: string; atlas: string }[]; surfaces: Record<string, string> }

function isTheme(value: unknown): value is GeneratedTheme {
  const v = value as GeneratedTheme;
  return typeof v === 'object' && v !== null && v.schemaVersion === 1 && Array.isArray(v.skins)
    && v.skins.every(s => typeof s?.id === 'string' && typeof s.manifest === 'string' && typeof s.atlas === 'string')
    && typeof v.surfaces === 'object' && v.surfaces !== null && SKIN_SURFACES.every(surface => typeof v.surfaces[surface] === 'string');
}

/**
 * Load the game's generated UI theme: each skin's atlas and manifest URL (fetched only when a window first uses
 * that skin) and each surface's default. A game without a UI theme returns null and keeps Ariel's skin everywhere.
 */
export async function loadUiTheme(base: URL, game: GameManifest, signal: AbortSignal): Promise<SkinChoice | null> {
  if (!game.uiThemeFile) return null;
  const pack = new URL('generated/content/', base);
  const value = await fetchContent(new URL(game.uiThemeFile, pack), signal);
  if (!isTheme(value)) throw new Error(`${game.uiThemeFile}: invalid generated UI theme`);
  const skins = new Map<string, WindowSkinSource>(value.skins.map(s => [s.id, { atlasUrl: new URL(s.atlas, pack).href, manifestUrl: new URL(s.manifest, pack).href }]));
  for (const surface of SKIN_SURFACES) {
    if (!skins.has(value.surfaces[surface] ?? '')) throw new Error(`${game.uiThemeFile}: surface ${surface} names an unknown skin`);
  }
  return { skins, surfaces: { ...value.surfaces }, fallback: value.surfaces.dialogue ?? '' };
}
