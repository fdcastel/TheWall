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

test('TheWall behavior matches appendix sequence', async ({ page }) => {
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
  const isOfflineMode = () => {
    const logs = consoleLogs.slice().reverse();
    for (const log of logs) {
      if (log.includes('Entering offline mode')) return true;
      if (log.includes('Exiting offline mode')) return false;
    }
    return false;
  };
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
  
  // Trigger next image load. 
  // We need to navigate enough times to exhaust the cache and trigger a failure.
  // Prefetch buffer is 3 images. So 3, 4, 5 might be cached.
  // We are at 2.
  
  let offlineTriggered = false;
  // Try navigating a few times to trigger offline mode
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('N');
    // Check if we went offline
    if (isOfflineMode()) {
      offlineTriggered = true;
      break;
    }
    // Wait a bit for async errors
    await page.waitForTimeout(500);
    if (isOfflineMode()) {
      offlineTriggered = true;
      break;
    }
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
  
  // Restore network
  await page.unroute('**/api/images/*');
  await page.unroute('**/api/ping');
  
  // Trigger recovery
  await page.keyboard.press('N');
  
  // We expect to go online.
  // It might take one navigation to trigger the ping and recover.
  await waitForLog(/Server connectivity restored - exiting offline mode/);
  await waitForLog(/Exiting offline mode/);
  expect(isOfflineMode()).toBe(false);
  
  // Verify normal navigation
  await page.keyboard.press('N');
  await waitForLog(/Next image: /);
});
