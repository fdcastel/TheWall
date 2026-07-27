import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './_fixtures.js';
import { useServer } from './_server.js';

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

// A 1x1 PNG: real enough to decode, so <img> fires onload rather than onerror.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const IMAGE_COUNT = 5;

// Deliberately tiny, so the list is exhausted and the index wraps within a few
// key presses. The bundled ./samples folder is far too large to reach the end of.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thewall-endoflist-'));
for (let i = 0; i < IMAGE_COUNT; i++) {
  fs.writeFileSync(path.join(fixtureDir, `${i}.png`), PNG);
}

useServer({ env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: fixtureDir } });

test.afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test('Pagination stops once a page comes back empty', async ({ page, waitForLog }) => {
  // The trigger is `currentIndex >= metadata.length - 2`, which stays true
  // forever once the length stops growing. Every advance -- and every
  // auto-advance tick -- used to fire another request that returned nothing.
  let paginationRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/images/metadata') && request.url().includes('start=')) {
      paginationRequests++;
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Image loaded successfully 0:/);

  expect(await page.evaluate(() => window.theWall.metadata.length)).toBe(IMAGE_COUNT);

  // Walk to the end and keep going, well past the point the list is exhausted.
  for (let i = 0; i < IMAGE_COUNT * 3; i++) {
    await page.keyboard.press('N');
    await page.waitForTimeout(60);
  }

  expect(await page.evaluate(() => window.theWall.metadataExhausted)).toBe(true);
  // Once exhausted, no further pagination requests: one or two probes, not one
  // per navigation.
  expect(paginationRequests,
    'pagination requests after the list is exhausted').toBeLessThanOrEqual(2);
});

test('Prefetching still works after the index wraps past the end', async ({ page, waitForLog }) => {
  // Prefetch targets are computed modulo metadata.length, but the "is this
  // still ahead of us?" check used `index > currentIndex`, which is false for
  // every wrapped index. At the last image nothing was ever recorded as
  // prefetched, so nothing wrapped ever joined the offline pool.
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Image loaded successfully 0:/);

  // Move to the last image, whose prefetch targets wrap to 0 and 1.
  for (let i = 0; i < IMAGE_COUNT - 1; i++) {
    await page.keyboard.press('N');
    await page.waitForTimeout(80);
  }
  expect(await page.evaluate(() => window.theWall.currentIndex)).toBe(IMAGE_COUNT - 1);

  await expect.poll(
    () => page.evaluate(() => Array.from(window.theWall.prefetched).sort((a, b) => a - b)),
    { message: 'wrapped indices should be recorded as prefetched', timeout: 5000 }
  ).toContain(0);
});
