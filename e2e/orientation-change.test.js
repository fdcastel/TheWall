import { test, expect } from './_fixtures.js';
import { startServer } from './_server.js';

const ORIENTATION_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(!process.env.PEXELS_API_KEY, 'PEXELS_API_KEY is required for integration test');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'pexels', THEWALL_IMAGE_QUERY: 'nature' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: ORIENTATION_BASE_URL });

test('Metadata is reloaded when orientation changes', async ({ page, waitForLog, logs }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);

  // Initial landscape load
  await waitForLog(/Loading metadata with orientation=landscape, query=nature/, 10_000);
  await waitForLog(/Loaded \d+ metadata items/, 10_000);
  await waitForLog(/Displaying image 0:/, 10_000);

  const initialOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  const initialMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  console.log(`Initial orientation: ${initialOrientation}, metadata length: ${initialMetadataLength}`);
  expect(initialOrientation).toBe('landscape');
  expect(initialMetadataLength).toBeGreaterThan(0);

  logs.length = 0;

  // Change to portrait
  await page.setViewportSize({ width: 1080, height: 1920 });
  const loadingScreen = page.locator('#loading-screen');

  await waitForLog(/Orientation changed from landscape to portrait/, 10_000);
  await waitForLog(/Resetting metadata and cache/, 10_000);
  await expect(loadingScreen).toBeVisible();
  await waitForLog(/Loading metadata with orientation=portrait, query=nature/, 10_000);
  await waitForLog(/Loaded \d+ metadata items/, 10_000);
  await waitForLog(/Displaying image 0:/, 10_000);
  await expect(loadingScreen).toBeHidden({ timeout: 5_000 });

  const newOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  expect(newOrientation).toBe('portrait');

  const newIndex = await page.evaluate(() => window.theWall.currentIndex);
  const newMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  expect(newIndex).toBe(0);
  expect(newMetadataLength).toBeGreaterThan(0);

  // Back to landscape
  logs.length = 0;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await waitForLog(/Orientation changed from portrait to landscape/, 10_000);
  await waitForLog(/Resetting metadata and cache/, 10_000);
  await waitForLog(/Loading metadata with orientation=landscape, query=nature/, 10_000);

  const finalOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  expect(finalOrientation).toBe('landscape');
});
