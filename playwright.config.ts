import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * Shared local-provider server used by the core E2E suite.
   * Tests that need a different provider (unsplash/pexels) boot their own
   * server on port 3100 inside the test file.
   */
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:3000/api/ping',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      THEWALL_PROVIDER: 'local',
      THEWALL_LOCAL_FOLDER: './samples',
      THEWALL_IMAGE_INTERVAL: '30',
    },
  },
});
