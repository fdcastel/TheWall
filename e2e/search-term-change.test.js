import { test, expect } from './_fixtures.js';
import { startServer } from './_server.js';

const SEARCH_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(!process.env.THEWALL_PROVIDER_KEY, 'THEWALL_PROVIDER_KEY is required for integration test');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'pexels', THEWALL_IMAGE_QUERY: 'mountains' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: SEARCH_BASE_URL });

test('Metadata is reloaded when search term changes', async ({ page, waitForLog }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);

  await waitForLog(/Loading metadata with orientation=\w+, query=mountains/, 10_000);
  await waitForLog(/Loaded \d+ metadata items/, 10_000);
  await waitForLog(/Displaying image 0:/, 10_000);

  const initialMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  expect(initialMetadataLength).toBeGreaterThan(0);

  await page.keyboard.press('S');
  await waitForLog(/Opening search dialog/);

  const searchDialog = page.locator('#search-dialog');
  await expect(searchDialog).not.toHaveClass(/hidden/);

  const searchInput = page.locator('#search-input');
  const inputValue = await searchInput.inputValue();
  expect(inputValue).toBe('mountains');

  await page.fill('#search-input', 'ocean');
  await page.keyboard.press('Enter');
  await waitForLog(/Search query changed from "mountains" to "ocean"/);

  const loadingScreen = page.locator('#loading-screen');
  await expect(loadingScreen).toBeVisible();

  await waitForLog(/Resetting metadata and cache/, 10_000);
  await waitForLog(/Loading metadata with orientation=\w+, query=ocean/, 10_000);
  await waitForLog(/Loaded \d+ metadata items/, 10_000);
  await waitForLog(/Displaying image 0:/, 10_000);
  await expect(loadingScreen).toBeHidden({ timeout: 5_000 });

  const newIndex = await page.evaluate(() => window.theWall.currentIndex);
  const newMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  expect(newIndex).toBe(0);
  expect(newMetadataLength).toBeGreaterThan(0);

  const currentQuery = await page.evaluate(() => window.theWall.imageQuery);
  expect(currentQuery).toBe('ocean');
});
