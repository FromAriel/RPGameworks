import { parseFrameManifest } from './pixel-frame/manifest.ts';
import type { FrameManifest } from './pixel-frame/manifest.ts';

/**
 * The baked frame manifest (decision 0010), fetched once per page and shared by the battle windows and the page
 * windows. A failed load resolves null and is retried by the next caller.
 */
let loading: Promise<FrameManifest | null> | null = null;

export function loadFrameManifest(base: string): Promise<FrameManifest | null> {
  loading ??= (async () => {
    try {
      const response = await fetch(`${base}generated/frames/manifest.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseFrameManifest(await response.json());
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}
