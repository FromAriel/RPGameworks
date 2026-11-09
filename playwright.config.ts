import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Spec files run in parallel; scenarios inside one file stay in order. Three workers passed the full suite four
  // times in a row on November 9, 2026 (about 3.5 minutes instead of 6.5); four workers exposed timing races in
  // walking and playback tests (decision 0012 T1.6). Override with --workers=N, for example --workers=1 to debug.
  fullyParallel: false,
  workers: 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/RPGameworks/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1100, height: 850 } } },
  ],
  webServer: [
    {
      command: 'npm run preview -- --port 4173 --strictPort --base=/RPGameworks/',
      url: 'http://127.0.0.1:4173/RPGameworks/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run preview:ui-gallery',
      url: 'http://127.0.0.1:4174/ui-gallery/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
