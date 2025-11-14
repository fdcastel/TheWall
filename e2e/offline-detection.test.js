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

  // Toggle manual offline mode
  await page.keyboard.press('O');
  await waitForLog(/Manual offline toggle - offline mode: true/);
  await waitForLog(/Entering offline mode/);

  // Verify we can navigate in offline mode
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\):/);

  const offlineNavigationLogs = consoleLogs.filter(log => log.includes('Next image (offline)'));
  expect(offlineNavigationLogs.length).toBeGreaterThan(0);

  // Exit offline mode
  await page.keyboard.press('O');
  await waitForLog(/Manual offline toggle - offline mode: false/);
  await waitForLog(/Exiting offline mode/);
});
