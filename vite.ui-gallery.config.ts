import { defineConfig } from 'vite';

/** Browser-only U1.2 review fixture. This entry is never part of the production build. */
export default defineConfig({
  root: 'tests/ui-gallery',
  base: '/ui-gallery/',
  build: {
    target: 'es2022',
    outDir: '../../.tmp/ui-gallery-dist',
    emptyOutDir: true,
  },
});
