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

test('Long filename images 21 and 22 work correctly', async ({ page }) => {
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

  // Wait for metadata to be loaded
  await waitForLog(/Loaded \d+ metadata items/);

  // Fetch metadata for images 21 and 22
  const metadataResponse = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?start=21&count=2');
    return await response.json();
  });

  expect(metadataResponse.images).toHaveLength(2);
  const image21 = metadataResponse.images[0];
  const image22 = metadataResponse.images[1];
  expect(image21.url).toMatch(/^\/api\/images\//);
  expect(image22.url).toMatch(/^\/api\/images\//);

  // Extract filenames
  const filename21 = image21.url.split('/').pop();
  const filename22 = image22.url.split('/').pop();
  expect(filename21).toMatch(/^21-/);
  expect(filename22).toMatch(/^22-/);

  // Read the actual files from disk
  const filePath21 = path.join('./samples', filename21);
  const filePath22 = path.join('./samples', filename22);
  const fileBuffer21 = fs.readFileSync(filePath21);
  const fileBuffer22 = fs.readFileSync(filePath22);
  const fileSize21 = fileBuffer21.length;
  const fileSize22 = fileBuffer22.length;

  // Fetch the images using Node.js http module
  const http = require('http');
  const response21 = await new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${image21.url}`, { timeout: 10000 }, (res) => {
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

  const response22 = await new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:3000${image22.url}`, { timeout: 10000 }, (res) => {
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

  // Check content-length
  expect(response21.headers['content-length']).toBe(fileSize21.toString());
  expect(response22.headers['content-length']).toBe(fileSize22.toString());
});
