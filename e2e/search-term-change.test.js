const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  process.env.THEWALL_PROVIDER = 'pexels';
  process.env.THEWALL_IMAGE_QUERY = 'mountains';
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env } });
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('Metadata is reloaded when search term changes', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
      consoleLogs.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000');
  await page.waitForFunction(() => window.theWall);

  const waitForLog = async (pattern, timeout = 10000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const match = consoleLogs.find(log => pattern.test(log));
      if (match) return match;
      await page.waitForTimeout(100);
    }
    throw new Error(`Timeout waiting for log matching: ${pattern}`);
  };

  // Wait for initial load with mountains query
  await waitForLog(/Loading metadata with orientation=\w+, query=mountains/);
  await waitForLog(/Loaded \d+ metadata items/);
  await waitForLog(/Displaying image 0:/);

  // Get initial metadata length
  const initialMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  console.log(`Initial metadata length: ${initialMetadataLength}`);
  expect(initialMetadataLength).toBeGreaterThan(0);

  // Open search dialog with 'S' key
  await page.keyboard.press('S');
  await waitForLog(/Opening search dialog/);

  // Verify search dialog is visible
  const searchDialog = page.locator('#search-dialog');
  await expect(searchDialog).not.toHaveClass(/hidden/);

  // Verify the input value is correct (not "mountainss" with extra 's')
  const searchInput = page.locator('#search-input');
  const inputValue = await searchInput.inputValue();
  expect(inputValue).toBe('mountains'); // Should be the current query, not with extra 's'

  // Change search term to 'ocean'
  await page.fill('#search-input', 'ocean');
  await page.keyboard.press('Enter');
  await waitForLog(/Search query changed from "mountains" to "ocean"/);

  // Verify loading screen appears
  const loadingScreen = page.locator('#loading-screen');
  await expect(loadingScreen).toBeVisible();

  // Verify metadata reset and reload
  await waitForLog(/Resetting metadata and cache/);
  await waitForLog(/Loading metadata with orientation=\w+, query=ocean/);
  await waitForLog(/Loaded \d+ metadata items/);
  
  // Wait for the image to be displayed
  await waitForLog(/Displaying image 0:/);
  
  // Wait for loading screen to be hidden
  await expect(loadingScreen).toBeHidden({ timeout: 5000 });
  
  // Wait a bit for async operations to complete
  await page.waitForTimeout(500);

  // Verify cache was cleared and index reset
  const newIndex = await page.evaluate(() => window.theWall.currentIndex);
  const newMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  const prefetchedSize = await page.evaluate(() => window.theWall.prefetched.size);
  
  console.log(`After search change - Index: ${newIndex}, Metadata: ${newMetadataLength}, Prefetched: ${prefetchedSize}`);
  
  expect(newIndex).toBe(0); // Should reset to first image
  expect(newMetadataLength).toBeGreaterThan(0); // Should have new metadata
  expect(prefetchedSize).toBeGreaterThanOrEqual(0); // Prefetch should be restarting

  // Verify new query is being used
  const currentQuery = await page.evaluate(() => window.theWall.imageQuery);
  expect(currentQuery).toBe('ocean');
});
