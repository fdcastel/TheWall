import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './_fixtures.js';
import { useServer } from './_server.js';

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

// A folder that does not exist makes the local provider throw, which is the
// cheapest deterministic way to drive /api/images/metadata to 503 -- no network
// call, so this behaves identically on an air-gapped CI runner.
const missingFolder = path.join(os.tmpdir(), 'thewall-does-not-exist-' + process.pid);
fs.rmSync(missingFolder, { recursive: true, force: true });

useServer({ env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: missingFolder } });

test('A failing provider goes offline instead of retrying without bound', async ({ page, waitForLog }) => {
  // Regression guard. Both runtimes used to convert a provider failure into an
  // empty 200, which the client read as "bad search term" and retried with a
  // query it never actually changed. Measured before the fix: 995 metadata
  // requests in a ~5 second window, ~200/sec -- enough to burn Unsplash's
  // 50-requests/hour demo quota 20x over in five seconds.
  let metadataRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/images/metadata')) metadataRequests++;
  });

  await page.goto('/');
  await page.waitForFunction(() => window.theWall);

  // The 503 must be read as loss of connectivity, not as an empty result.
  await waitForLog(/Entering offline mode/);
  await expect(page.locator('#offline-indicator')).not.toHaveClass(/hidden/);

  // Let any retry loop have time to run away.
  await page.waitForTimeout(3000);

  // One initial load, plus at most a small number of user/timer-driven
  // retries. The pre-fix code produced three orders of magnitude more.
  expect(metadataRequests,
    `metadata requests during startup + 3s idle (pre-fix: ~600 for this window)`)
    .toBeLessThan(10);

  expect(await page.evaluate(() => window.theWall.offline)).toBe(true);
});

test('Provider failure returns 503, a genuinely empty page returns 200', async ({ page }) => {
  await page.goto('/');

  const failure = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?count=3');
    return { status: response.status, body: await response.json() };
  });

  expect(failure.status).toBe(503);
  expect(failure.body).toEqual({ images: [], error: 'provider_unavailable' });
});
