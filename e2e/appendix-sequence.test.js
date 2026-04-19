const { test, expect } = require('./_fixtures');

test('TheWall behavior matches appendix sequence', async ({ page, waitForLog, logs }) => {
  const isOfflineMode = () => {
    const reversed = logs.slice().reverse();
    for (const log of reversed) {
      if (log.includes('Entering offline mode')) return true;
      if (log.includes('Exiting offline mode')) return false;
    }
    return false;
  };

  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:.*00-4k-458510-colosseum\.jpg/);
  await waitForLog(/Image loaded successfully 0:.*00-4k-458510-colosseum\.jpg/);
  expect(isOfflineMode()).toBe(false);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 1/);
  await waitForLog(/Image loaded successfully 1/);
  expect(isOfflineMode()).toBe(false);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  expect(isOfflineMode()).toBe(false);

  // Simulate network failure
  await page.route('**/api/images/*', route => route.abort());
  await page.route('**/api/ping', route => route.abort());

  let offlineTriggered = false;
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('N');
    if (isOfflineMode()) { offlineTriggered = true; break; }
    await page.waitForTimeout(500);
    if (isOfflineMode()) { offlineTriggered = true; break; }
  }

  expect(offlineTriggered).toBe(true);
  expect(isOfflineMode()).toBe(true);

  // Verify offline navigation
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\):/);
  expect(isOfflineMode()).toBe(true);

  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\):/);
  expect(isOfflineMode()).toBe(true);

  // Restore network and trigger recovery
  await page.unroute('**/api/images/*');
  await page.unroute('**/api/ping');
  await page.keyboard.press('N');
  await waitForLog(/Server connectivity restored - exiting offline mode/);
  await waitForLog(/Exiting offline mode/);
  expect(isOfflineMode()).toBe(false);

  await page.keyboard.press('N');
  await waitForLog(/Next image: /);

  // Additional test: Verify pagination works correctly (no image repetition)
  // Navigate through 35+ images to ensure we cross the metadata batch boundary.
  const displayedUrls = new Set();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('P');
    await page.waitForTimeout(100);
  }
  for (let i = 0; i < 35; i++) {
    const currentUrl = await page.evaluate(() => {
      return window.theWall.metadata[window.theWall.currentIndex]?.url;
    });
    if (currentUrl) {
      if (displayedUrls.has(currentUrl)) {
        throw new Error(`Image URL repeated at index ${i}: ${currentUrl}`);
      }
      displayedUrls.add(currentUrl);
    }
    if (i < 34) {
      await page.keyboard.press('N');
      await page.waitForTimeout(200);
    }
  }
  console.log(`Successfully verified ${displayedUrls.size} unique images without repetition`);
});
