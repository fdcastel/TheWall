const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let serverProcess;

test.beforeAll(async () => {
  // Start the server with local provider
  process.env.THEWALL_PROVIDER = 'local';
  process.env.THEWALL_LOCAL_FOLDER = './samples';
  process.env.THEWALL_IMAGE_INTERVAL = '30';

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

test('Metadata API returns correct image data', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Fetch metadata
  const metadataResponse = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?count=1');
    return await response.json();
  });

  expect(metadataResponse.images).toHaveLength(1);
  const firstImage = metadataResponse.images[0];
  expect(firstImage.url).toMatch(/^\/api\/images\//);

  // Extract filename from URL
  const filename = firstImage.url.split('/').pop();

  // Read the actual file from disk
  const filePath = path.join('./samples', filename);
  const fileBuffer = fs.readFileSync(filePath);
  const fileArray = Array.from(new Uint8Array(fileBuffer));

  // Fetch the image content using Node.js http module
  const http = require('http');
  const fileSize = fileArray.length;
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

  // Check content-length
  expect(response.headers['content-length']).toBe(fileSize.toString());
});

test('Long filename images 21 and 22 work correctly', async ({ page }) => {
  await page.goto('http://localhost:3000');

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

test('Offline mode detection works when server is unavailable', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for initial load
  await page.waitForSelector('#current-image');

  // Press NEXT a few times to prefetch images
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('N');
    await page.waitForTimeout(500); // wait for prefetch
  }

  // Stop the server
  serverProcess.kill();

  // Wait for server to stop
  await page.waitForTimeout(1000);

  // Press NEXT to trigger image load attempt
  await page.keyboard.press('N');

  // Wait for offline detection
  await page.waitForFunction(() => !document.querySelector('#offline-indicator').classList.contains('hidden'), { timeout: 10000 });

  // Check that offline indicator is shown
  const offlineIndicator = await page.$('#offline-indicator');
  const isOfflineVisible = await offlineIndicator.isVisible();
  expect(isOfflineVisible).toBe(true);
});

test('Browser honors HTTP cache headers', async ({ page }) => {
  // Start another server for this test on a different port (will be killed)
  const anotherServerProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    env: { ...process.env, THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples', THEWALL_IMAGE_INTERVAL: '30', PORT: '3001' }
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await page.goto('http://localhost:3001');

  // Wait for initial load
  await page.waitForSelector('#current-image');

  // Press NEXT a few times to load and cache images
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('N');
    await page.waitForTimeout(1000); // wait for image to load and cache
  }

  // Stop the server to simulate offline scenario
  anotherServerProcess.kill();

  // Wait for server to stop
  await page.waitForTimeout(1000);

  // Press NEXT to try loading a new image - should use cache
  await page.keyboard.press('N');

  // Wait for the image to attempt loading and offline detection to complete
  await page.waitForTimeout(5000);

  // Check that the image is displayed (from cache)
  const img = await page.$('#current-image');
  const imgSrc = await img.getAttribute('src');
  expect(imgSrc).toMatch(/^\/api\/images\//);

  // Check that the image has loaded (complete and has dimensions)
  const isComplete = await page.evaluate(() => {
    const img = document.getElementById('current-image');
    return img.complete && img.naturalWidth > 0;
  });
  expect(isComplete).toBe(true);

  // Check that offline indicator is now shown
  const offlineIndicator = await page.$('#offline-indicator');
  const isOfflineVisible = await offlineIndicator.isVisible();
  expect(isOfflineVisible).toBe(true);
});