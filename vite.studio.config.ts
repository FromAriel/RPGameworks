import { defineConfig } from 'vite';

/**
 * Skin studio (decision 0013 B4): a local authoring page, never part of the game build and never published.
 * `npm run studio` serves it on port 4175; the browser tests build it and preview it on port 4176.
 * It serves the game's public/ folder from the site root, like the game, so window titles use the game's own font.
 */
export default defineConfig({
  root: 'tools/skin-studio',
  base: '/',
  publicDir: '../../public',
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  build: {
    target: 'es2022',
    outDir: '../../.tmp/skin-studio-dist',
    emptyOutDir: true,
    // Recipe art must reach the page as files so the bake reads the same pixels Node reads.
    assetsInlineLimit: 0,
  },
});
