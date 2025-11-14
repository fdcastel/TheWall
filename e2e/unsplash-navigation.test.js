const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  process.env.THEWALL_PROVIDER = 'unsplash';
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env } });
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('Navigate through images with Unsplash provider using keypresses', async ({ page }) => {
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
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 1/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  await page.keyboard.press('P');
  await waitForLog(/Previous image: 1/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 3/);
});
