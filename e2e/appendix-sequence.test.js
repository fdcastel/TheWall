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
  await page.keyboard.press('O');
  await waitForLog(/Manual offline toggle - offline mode: true/);
  expect(isOfflineMode()).toBe(true);
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\): 3/);
  expect(isOfflineMode()).toBe(true);
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\): 4/);
  expect(isOfflineMode()).toBe(true);
  await page.keyboard.press('N');
  await waitForLog(/Next image \(offline\): 0/);
  expect(isOfflineMode()).toBe(true);
  await page.keyboard.press('O');
  await waitForLog(/Manual offline toggle - offline mode: false/);
  expect(isOfflineMode()).toBe(false);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 1/);
  expect(isOfflineMode()).toBe(false);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  expect(isOfflineMode()).toBe(false);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 3/);
  expect(isOfflineMode()).toBe(false);
});
