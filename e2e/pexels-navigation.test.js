import { test, expect } from './_fixtures.js';
import { startServer } from './_server.js';

const PEXELS_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(!process.env.PEXELS_API_KEY, 'PEXELS_API_KEY is required for integration test');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'pexels' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: PEXELS_BASE_URL });

test('Navigate through images with Pexels provider using keypresses', async ({ page, waitForLog }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 1/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  await page.keyboard.press('P');
  await waitForLog(/Previous image: 1/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 2/);
  await page.keyboard.press('N');
  await waitForLog(/Next image: 3/);
});
