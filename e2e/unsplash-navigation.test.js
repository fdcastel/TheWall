const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');

let serverProcess;

test.beforeAll(async () => {
  // Start the server with Unsplash provider
  process.env.THEWALL_PROVIDER = 'unsplash';
  // UNSPLASH_ACCESS_KEY should be set in environment

  serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('Navigate through images with Unsplash provider using keypresses', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for initial load
  await page.waitForSelector('#current-image');

  // Press NEXT
  await page.keyboard.press('N');
  await page.waitForTimeout(1000);

  // Press NEXT again
  await page.keyboard.press('N');
  await page.waitForTimeout(1000);

  // Press PREV
  await page.keyboard.press('P');
  await page.waitForTimeout(1000);

  // Press NEXT
  await page.keyboard.press('N');
  await page.waitForTimeout(1000);

  // Press NEXT again
  await page.keyboard.press('N');
  await page.waitForTimeout(1000);
});