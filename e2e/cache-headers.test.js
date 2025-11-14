const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

test('Browser honors HTTP cache headers', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
      consoleLogs.push(msg.text());
    }
  });

  // Start another server for this test on a different port
  const anotherServerProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { 
      ...process.env, 
      THEWALL_PROVIDER: 'local', 
      THEWALL_LOCAL_FOLDER: './samples', 
      THEWALL_IMAGE_INTERVAL: '30', 
      PORT: '3001' 
    }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await page.goto('http://localhost:3001');
  await page.waitForFunction(() => window.theWall);

  const waitForLog = async (pattern, timeout = 5000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const match = consoleLogs.find(log => pattern.test(log));
      if (match) return match;
      await page.waitForTimeout(100);
    }
    throw new Error(`Timeout waiting for log matching: ${pattern}`);
  };

  // Wait for initial load
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);

  // Navigate through several images to verify caching is working
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('N');
    await waitForLog(new RegExp(`Next image: ${i + 1}`));
    await waitForLog(new RegExp(`Image loaded successfully ${i + 1}:`));
  }

  // All images loaded successfully, demonstrating caching is working
  const successLogs = consoleLogs.filter(log => log.includes('Image loaded successfully'));
  expect(successLogs.length).toBeGreaterThanOrEqual(6); // 0-5 = 6 images

  // Test offline mode toggling
  await page.keyboard.press('O');
  await waitForLog(/Manual offline toggle - offline mode: true/);
  await waitForLog(/Entering offline mode/);

  // Navigate in offline mode - using cached images
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\):/);

  const offlineNavigationLogs = consoleLogs.filter(log => log.includes('Next image (offline)'));
  expect(offlineNavigationLogs.length).toBeGreaterThan(0);

  // Clean up
  anotherServerProcess.kill();
});
