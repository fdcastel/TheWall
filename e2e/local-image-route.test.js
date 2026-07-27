import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './_fixtures.js';
import { useServer } from './_server.js';

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// The image folder sits inside a parent that also holds a file the route must
// never expose, so traversal has something real to reach for.
const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thewall-route-'));
const imageDir = path.join(parentDir, 'images');
fs.mkdirSync(imageDir);
fs.writeFileSync(path.join(imageDir, 'photo.png'), PNG);
fs.writeFileSync(path.join(parentDir, 'secret.txt'), 'TOP-SECRET-DO-NOT-SERVE');

useServer({ env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: imageDir } });

test.afterAll(() => {
  fs.rmSync(parentDir, { recursive: true, force: true });
});

test('The local image route refuses to escape its folder', async ({ page, baseURL }) => {
  // Covers the hand-written /api/images/* route. An earlier revision of this
  // work replaced it with @fastify/static and verified traversal against *that*
  // implementation, then reverted -- leaving the shipping code untested.
  const attempts = [
    '../secret.txt',
    '..%2Fsecret.txt',
    '..%252Fsecret.txt',
    '%2e%2e/secret.txt',
    '....//secret.txt',
    '..\\secret.txt',
    '/etc/passwd',
    'C:\\Windows\\win.ini'
  ];

  for (const attempt of attempts) {
    const response = await page.request.get(`${baseURL}/api/images/${attempt}`, {
      maxRedirects: 0,
      failOnStatusCode: false
    });
    expect(response.status(), `traversal attempt: ${attempt}`).not.toBe(200);
    expect(await response.text(), `traversal attempt leaked content: ${attempt}`)
      .not.toContain('TOP-SECRET');
  }
});

test('The local image route serves real files with the documented cache headers', async ({ page, baseURL }) => {
  const response = await page.request.get(`${baseURL}/api/images/photo.png`);
  expect(response.status()).toBe(200);

  const headers = response.headers();
  expect(headers['content-type']).toBe('image/png');
  expect(headers['content-length']).toBe(String(PNG.length));
  expect(headers['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(headers['last-modified']).toBeTruthy();
  expect(headers['etag']).toBeTruthy();
  // Deliberately absent: the route never reads Range and always sends the whole
  // file, so advertising range support would be a lie.
  expect(headers['accept-ranges']).toBeUndefined();

  // A cached client must still get a 304.
  const revalidated = await page.request.get(`${baseURL}/api/images/photo.png`, {
    headers: { 'If-None-Match': headers['etag'] },
    failOnStatusCode: false
  });
  expect(revalidated.status()).toBe(304);

  const missing = await page.request.get(`${baseURL}/api/images/nope.png`, { failOnStatusCode: false });
  expect(missing.status()).toBe(404);
});

test('app.js is served uncached, other static assets are not', async ({ page, baseURL }) => {
  // The setHeaders callback that sets this crashed the process under
  // @fastify/static v10 until its signature was fixed, and no test noticed
  // because a leaked pre-upgrade server was answering.
  const appJs = await page.request.get(`${baseURL}/app.js`);
  expect(appJs.status()).toBe(200);
  expect(appJs.headers()['cache-control']).toBe('no-cache, no-store, must-revalidate');

  const css = await page.request.get(`${baseURL}/style.css`);
  expect(css.status()).toBe(200);
  expect(css.headers()['cache-control']).not.toBe('no-cache, no-store, must-revalidate');
});
