import { test, expect } from './_fixtures.js';
import { useServer } from './_server.js';

test.skip(!process.env.THEWALL_PROVIDER_KEY, 'THEWALL_PROVIDER_KEY is required for integration test');

useServer({ env: { THEWALL_PROVIDER: 'unsplash' } });

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
