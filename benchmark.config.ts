import { defineConfig } from '@playwright/test';
import foundation from './playwright.config';

/** Separate from functional tests: timing evidence, not an arbitrary FPS release gate. */
export default defineConfig({
  ...foundation,
  testDir: './tests/benchmark',
  testMatch: 'baseline.spec.ts',
  outputDir: 'benchmark-results',
  timeout: 150_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['list'], ['json', { outputFile: 'benchmark-report/results.json' }]],
  use: {
    ...foundation.use,
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  },
  // Both closed and docked Debug use the SAME 960 × 576 displayed game canvas.
  projects: [{ name: 'chromium-baseline', use: { viewport: { width: 1500, height: 760 } } }],
});
