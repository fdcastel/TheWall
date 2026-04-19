import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './_fixtures.js';
import { startServer } from './_server.js';

const LOCAL_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: './samples' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: LOCAL_BASE_URL });

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
