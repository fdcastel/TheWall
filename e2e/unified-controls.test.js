const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  process.env.THEWALL_PROVIDER = 'local';
  serverProcess = spawn('node', ['server.js'], { stdio: 'inherit', env: { ...process.env } });
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test('Mouse wheel navigation works', async ({ page }) => {
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

  // Simulate mouse wheel down (next image)
  await page.mouse.wheel(0, 100);
  await waitForLog(/Next image: 1/);

  // Simulate mouse wheel up (previous image)
  await page.mouse.wheel(0, -100);
  await waitForLog(/Previous image: 0/);
});

test('Double-click toggles fullscreen without affecting attribution', async ({ page }) => {
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

  // Initially attribution should be hidden
  await expect(page.locator('#attribution')).toHaveClass('hidden');

  // Double-click to toggle fullscreen
  await page.mouse.dblclick(100, 100);
  // Attribution should still be hidden (not toggled)
  await expect(page.locator('#attribution')).toHaveClass('hidden');

  // Single click should toggle attribution
  await page.mouse.click(100, 100);
  await expect(page.locator('#attribution')).not.toHaveClass('hidden');
});

test('Warning message for no search results appears and disappears correctly', async ({ page }) => {
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

  // Show the warning message (simulating no search results)
  await page.evaluate(() => {
    window.theWall.showWarningMessage();
  });

  // Wait for warning message to appear
  await expect(page.locator('#warning-message')).not.toHaveClass('hidden');

  // Wait for warning message to disappear
  await page.waitForTimeout(6000);
  await expect(page.locator('#warning-message')).toHaveClass('hidden');

  // Verify that images are still being displayed
  await waitForLog(/Displaying image \d+:/);
});