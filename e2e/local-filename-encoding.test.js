import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './_fixtures.js';
import { useServer } from './_server.js';

test.skip(process.env.THEWALL_TEST_RUNTIME !== 'node',
  'Local-provider test: set THEWALL_TEST_RUNTIME=node to run against the Fastify/Docker runtime');

// Filenames the local provider used to emit unencoded. '#' is the damaging one:
// it truncates the path into a fragment, so the image 404s, <img> onerror fires,
// and the app drops into offline mode -- for a folder of perfectly ordinary files.
const TRICKY_NAMES = [
  'with space.jpg',
  'with #hash.jpg',
  'with %percent.jpg',
  'with +plus & ampersand.jpg',
  // '?' and '*' are legal on POSIX but rejected by the Windows filesystem, so
  // they are only exercised where they can actually exist. CI runs on Linux.
  ...(process.platform === 'win32' ? [] : ['with ?question.jpg'])
];

// Built at module load, before useServer()'s beforeAll boots the server against it.
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thewall-encoding-'));
for (const name of TRICKY_NAMES) {
  fs.writeFileSync(path.join(fixtureDir, name), `stub for ${name}`);
}

useServer({ env: { THEWALL_PROVIDER: 'local', THEWALL_LOCAL_FOLDER: fixtureDir } });

test.afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test('Local filenames with URL-significant characters are encoded and fetchable', async ({ page, baseURL }) => {
  await page.goto('/');

  const { images } = await page.evaluate(async () => {
    const response = await fetch('/api/images/metadata?count=50');
    return response.json();
  });

  expect(images).toHaveLength(TRICKY_NAMES.length);

  for (const image of images) {
    // The raw character must never appear in the emitted URL.
    expect(image.url).not.toMatch(/[ #?%](?![0-9A-Fa-f]{2})/);

    const response = await page.request.get(`${baseURL}${image.url}`);
    expect(response.status(), `fetching ${image.url}`).toBe(200);
  }

  // And every fixture file is actually reachable, not just well-formed.
  const served = await Promise.all(images.map(async (image) => {
    const response = await page.request.get(`${baseURL}${image.url}`);
    return response.text();
  }));
  for (const name of TRICKY_NAMES) {
    expect(served).toContain(`stub for ${name}`);
  }
});
