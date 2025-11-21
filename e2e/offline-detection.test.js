const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  process.env.THEWALL_PROVIDER = 'local';
  process.env.THEWALL_LOCAL_FOLDER = './samples';
  process.env.THEWALL_IMAGE_INTERVAL = '30';
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env } });
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('Offline mode detection works when server is unavailable', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
      consoleLogs.push(msg.text());
    }
  });

  await page.goto('http://localhost:3000');
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

  const offlineNavigationLogs = consoleLogs.filter(log => log.includes('Next image (offline)'));
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
  // We might need to wait a bit because exiting offline mode might reset things or just allow next nav
  // The log "Next image: ..." indicates online mode
  await waitForLog(/Next image: /);
});
