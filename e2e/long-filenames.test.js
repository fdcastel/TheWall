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
