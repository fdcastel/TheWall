import { test, expect } from './_fixtures.js';
import { startServer } from './_server.js';

const LOCAL_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: LOCAL_BASE_URL });

test('Rapid navigation should not prefetch already-passed images', async ({ page, waitForLog, logs }) => {
  // Throttle image requests so prefetches have real latency — without this,
  // local file serving (<2ms) completes prefetches instantly and the
  // already-passed validation in app.js never gets a chance to fire.
  const IMAGE_DELAY_MS = 400;
  await page.route('**/api/images/*', async (route) => {
    // Skip delay on metadata.json requests (not images)
    if (route.request().url().includes('/api/images/metadata')) {
      return route.continue();
    }
    await new Promise(r => setTimeout(r, IMAGE_DELAY_MS));
    await route.continue();
  });

  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);

  // Fresh slate for the rapid-navigation phase
  logs.length = 0;

  // 10 rapid NEXT presses, faster than the delayed prefetches can complete
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('N');
    await page.waitForTimeout(120);
  }

  // Give any lingering prefetches time to complete and hit the validation path
  await page.waitForTimeout(IMAGE_DELAY_MS * 2);

  const currentIndex = await page.evaluate(() => window.theWall.currentIndex);
  expect(currentIndex).toBe(10);

  // Parse prefetch outcomes from browser logs
  const prefetchedIndices = new Set();
  for (const line of logs) {
    const match = line.match(/Image prefetched successfully (\d+):/);
    if (match) prefetchedIndices.add(parseInt(match[1], 10));
  }
  const cancelStaleLogs = logs.filter(l => l.includes('Cancelling stale prefetch'));

  // Cancellation must have fired for at least one in-flight prefetch that fell
  // behind the current index — otherwise the throttle wasn't slow enough to
  // exercise the code path.
  expect(cancelStaleLogs.length).toBeGreaterThan(0);

  // The "successfully prefetched" set must contain ONLY images ahead of current —
  // either app.js cancelled them in-flight or the completion-time check dropped
  // them. Either way, no backwards entries should have survived.
  const backwardsPrefetches = Array.from(prefetchedIndices).filter(idx => idx <= currentIndex);
  expect(backwardsPrefetches).toEqual([]);

  // And we should still have made forward progress on prefetching.
  const forwardPrefetches = Array.from(prefetchedIndices).filter(idx => idx > currentIndex);
  expect(forwardPrefetches.length).toBeGreaterThan(0);
});
