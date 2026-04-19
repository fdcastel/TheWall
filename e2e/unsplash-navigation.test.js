const { test, expect } = require('./_fixtures');
const { startServer } = require('./_server');

const UNSPLASH_BASE_URL = 'http://localhost:3100';
let serverProcess;

test.skip(!process.env.UNSPLASH_ACCESS_KEY, 'UNSPLASH_ACCESS_KEY is required for integration test');

test.beforeAll(async () => {
  serverProcess = await startServer({
    port: 3100,
    env: { THEWALL_PROVIDER: 'unsplash' },
  });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
});

test.use({ baseURL: UNSPLASH_BASE_URL });

test('Navigate through images with Unsplash provider using keypresses', async ({ page, waitForLog }) => {
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
