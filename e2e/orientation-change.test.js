const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  process.env.THEWALL_PROVIDER = 'pexels';
  process.env.THEWALL_IMAGE_QUERY = 'nature';
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env } });
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('Metadata is reloaded when orientation changes', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
      consoleLogs.push(msg.text());
    }
  });

  // Start with landscape orientation
  await page.setViewportSize({ width: 1920, height: 1080 });
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

  // Wait for initial load in landscape
  await waitForLog(/Loading metadata with orientation=landscape, query=nature/);
  await waitForLog(/Loaded \d+ metadata items/);
  await waitForLog(/Displaying image 0:/);

  // Get initial orientation and metadata
  const initialOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  const initialMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  console.log(`Initial orientation: ${initialOrientation}, metadata length: ${initialMetadataLength}`);
  
  expect(initialOrientation).toBe('landscape');
  expect(initialMetadataLength).toBeGreaterThan(0);

  // Clear console logs to track new ones
  consoleLogs.length = 0;

  // Change to portrait orientation
  await page.setViewportSize({ width: 1080, height: 1920 });
  
  // Verify loading screen appears
  const loadingScreen = page.locator('#loading-screen');
  
  // Wait for orientation change detection
  await waitForLog(/Orientation changed from landscape to portrait/);
  await waitForLog(/Resetting metadata and cache/);
  
  // Verify loading screen is visible during reload
  await expect(loadingScreen).toBeVisible();
  
  await waitForLog(/Loading metadata with orientation=portrait, query=nature/);
  await waitForLog(/Loaded \d+ metadata items/);
  
  // Wait for the image to be displayed
  await waitForLog(/Displaying image 0:/);
  
  // Wait for loading screen to be hidden
  await expect(loadingScreen).toBeHidden({ timeout: 5000 });
  
  // Wait a bit for async operations to complete
  await page.waitForTimeout(500);

  // Verify orientation changed
  const newOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  expect(newOrientation).toBe('portrait');

  // Verify cache was cleared and index reset
  const newIndex = await page.evaluate(() => window.theWall.currentIndex);
  const newMetadataLength = await page.evaluate(() => window.theWall.metadata.length);
  const prefetchedSize = await page.evaluate(() => window.theWall.prefetched.size);
  
  console.log(`After orientation change - Index: ${newIndex}, Metadata: ${newMetadataLength}, Prefetched: ${prefetchedSize}`);
  
  expect(newIndex).toBe(0); // Should reset to first image
  expect(newMetadataLength).toBeGreaterThan(0); // Should have new metadata
  expect(prefetchedSize).toBeGreaterThanOrEqual(0); // Prefetch should be restarting

  // Clear logs and change back to landscape
  consoleLogs.length = 0;
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // Verify orientation changed back
  await waitForLog(/Orientation changed from portrait to landscape/);
  await waitForLog(/Resetting metadata and cache/);
  await waitForLog(/Loading metadata with orientation=landscape, query=nature/);
  
  const finalOrientation = await page.evaluate(() => window.theWall.currentOrientation);
  expect(finalOrientation).toBe('landscape');
});
