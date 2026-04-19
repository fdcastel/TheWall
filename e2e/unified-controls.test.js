const { test, expect } = require('./_fixtures');

test('Mouse wheel navigation works', async ({ page, waitForLog }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:/);
  await waitForLog(/Image loaded successfully 0:/);

  // Simulate mouse wheel down (next image)
  await page.mouse.wheel(0, 100);
  await waitForLog(/Next image: 1/);

  // Simulate mouse wheel up (previous image)
  await page.mouse.wheel(0, -100);
  await waitForLog(/Previous image: 0/);
});

test('Double-click toggles fullscreen without affecting attribution', async ({ page, waitForLog }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:/);

  // Initially attribution should be hidden
  await expect(page.locator('#attribution')).toHaveClass('hidden');

  // Double-click to toggle fullscreen
  await page.mouse.dblclick(100, 100);
  // Attribution should still be hidden (not toggled)
  await expect(page.locator('#attribution')).toHaveClass('hidden');

  // Single click should toggle attribution
  await page.mouse.click(100, 100);
  await expect(page.locator('#attribution')).not.toHaveClass('hidden');
});

test('Warning message for no search results appears and disappears correctly', async ({ page, waitForLog }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.theWall);
  await waitForLog(/Displaying image 0:/);

  // Show the warning message (simulating no search results)
  await page.evaluate(() => {
    window.theWall.showWarningMessage();
  });

  // Wait for warning message to appear
  await expect(page.locator('#warning-message')).not.toHaveClass('hidden');

  // Wait for warning message to disappear
  await page.waitForTimeout(6000);
  await expect(page.locator('#warning-message')).toHaveClass('hidden');

  // Verify that images are still being displayed
  await waitForLog(/Displaying image \d+:/);
});
