const { test, expect } = require('./_fixtures');
const fs = require('fs');
const path = require('path');

test('Long filename images 21 and 22 work correctly', async ({ page, waitForLog, baseURL }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Loaded \d+ metadata items/);

  const metadataResponse = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?start=21&count=2');
    return await response.json();
  });

  expect(metadataResponse.images).toHaveLength(2);
  const [image21, image22] = metadataResponse.images;
  expect(image21.url).toMatch(/^\/api\/images\//);
  expect(image22.url).toMatch(/^\/api\/images\//);

  const filename21 = image21.url.split('/').pop();
  const filename22 = image22.url.split('/').pop();
  expect(filename21).toMatch(/^21-/);
  expect(filename22).toMatch(/^22-/);

  const fileSize21 = fs.statSync(path.join('./samples', filename21)).size;
  const fileSize22 = fs.statSync(path.join('./samples', filename22)).size;

  const response21 = await page.request.get(`${baseURL}${image21.url}`);
  const response22 = await page.request.get(`${baseURL}${image22.url}`);
  expect(response21.status()).toBe(200);
  expect(response22.status()).toBe(200);
  expect(response21.headers()['content-length']).toBe(fileSize21.toString());
  expect(response22.headers()['content-length']).toBe(fileSize22.toString());
});
