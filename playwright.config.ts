import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
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
  webServer: {
    command: 'npm run build -- --base=/RPGameworks/ && npm run preview -- --port 4173 --strictPort --base=/RPGameworks/',
    url: 'http://127.0.0.1:4173/RPGameworks/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
