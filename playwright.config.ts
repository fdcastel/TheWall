import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * Default webServer boots the Workers + Static Assets runtime via `wrangler
 * dev` so the production code path is exercised. Tests that need a specific
 * provider config (unsplash / pexels) or the Fastify/local-provider runtime
 * boot their own server on port 3100 from inside the test file via
 * `./_server.js`.
 *
 * Local-provider tests (image-content, long-filenames, appendix-sequence,
 * offline-detection, rapid-navigation) are gated on
 * `THEWALL_TEST_RUNTIME=node` because the `/api/images/*` route and filesystem
 * behaviour only exist on the Docker/Node path. When that flag is set the
 * default wrangler webServer is skipped entirely.
 */
const isNodeRuntime = process.env.THEWALL_TEST_RUNTIME === 'node';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:8788',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: isNodeRuntime ? undefined : {
    command: 'npx wrangler dev --port 8788',
    url: 'http://localhost:8788/api/ping',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
