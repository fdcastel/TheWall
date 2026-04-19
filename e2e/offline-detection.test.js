const { test, expect } = require('./_fixtures');

test('Offline mode detection works when server is unavailable', async ({ page, waitForLog, logs }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);

  // Wait for initial load
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);

  // Navigate through a few images
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('N');
    await waitForLog(new RegExp(`Next image: ${i + 1}`));
  }

  // Simulate network failure for images and ping
  await page.route('**/api/images/*', route => route.abort());
  await page.route('**/api/ping', route => route.abort());

  // Trigger next image load which should fail and activate offline mode
  await page.keyboard.press('N');

  // Wait for offline mode activation
  await waitForLog(/Image load failed/);
  await waitForLog(/Entering offline mode/);

  // Verify we can navigate in offline mode
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\):/);

  const offlineNavigationLogs = logs.filter(log => log.includes('Next image (offline)'));
  expect(offlineNavigationLogs.length).toBeGreaterThan(0);

  // Restore network
  await page.unroute('**/api/images/*');
  await page.unroute('**/api/ping');

  // Navigate again - this should trigger ping check and recovery
  await page.keyboard.press('N');

  // Wait for recovery
  await waitForLog(/Server connectivity restored - exiting offline mode/);
  await waitForLog(/Exiting offline mode/);

  // Verify we are back online (next navigation should be normal)
  await page.keyboard.press('N');
  await waitForLog(/Next image: /);
});
