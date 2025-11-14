const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

test('Metadata API returns correct image data', async ({ page }) => {
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
  await waitForLog(/Loaded \d+ metadata items/);
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);
  const metadataResponse = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?count=1');
    return await response.json();
  });
  expect(metadataResponse.images).toHaveLength(1);
  const firstImage = metadataResponse.images[0];
  expect(firstImage.url).toMatch(/^\/api\/images\//);
  const filename = firstImage.url.split('/').pop();
  const filePath = path.join('./samples', filename);
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  const http = require('http');
  const response = await new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${firstImage.url}`, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed with status ${res.statusCode}`));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
  expect(response.headers['content-length']).toBe(fileSize.toString());
});
