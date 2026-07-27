import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 *
 * There is no global `webServer`: every test file boots the Fastify server it
 * needs via the `useServer`/`useLocalServer` helpers in `./_server.js`, on port
 * 3100. `workers: 1` and `fullyParallel: false` let the files take turns on that
 * port rather than each needing its own.
 *
 * Test tiers:
 *   - unified-controls  — browser input handling; local provider, always runs.
 *   - local-provider    — need the Docker/Node-only `/api/images/*` route and
 *                         filesystem behaviour; gated on THEWALL_TEST_RUNTIME=node.
 *   - provider          — need a real Unsplash/Pexels key; gated on
 *                         THEWALL_PROVIDER_KEY.
 *
 * So `npm test` runs credential-free. The Cloudflare Workers runtime is covered
 * by the `worker` smoke job in .github/workflows/test.yml, which exercises
 * worker.js through `wrangler dev`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'line',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
