const { test, expect } = require('./_fixtures');
const fs = require('fs');
const path = require('path');

test('Metadata API returns correct image data', async ({ page, waitForLog, baseURL }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
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
  const fileSize = fs.statSync(filePath).size;

  const response = await page.request.get(`${baseURL}${firstImage.url}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-length']).toBe(fileSize.toString());
});
