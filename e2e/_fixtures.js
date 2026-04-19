const base = require('@playwright/test');

/**
 * Shared Playwright fixtures:
 *   - `logs`: an array that captures browser console log/warn/error messages.
 *   - `waitForLog(pattern, timeout?)`: polls `logs` until a line matches the regex.
 */
const test = base.test.extend({
  logs: async ({ page }, use) => {
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'warn' || msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    await use(logs);
  },
  waitForLog: async ({ page, logs }, use) => {
    const waitForLog = async (pattern, timeout = 5000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const match = logs.find(line => pattern.test(line));
        if (match) return match;
        await page.waitForTimeout(100);
      }
      throw new Error(`Timeout waiting for log matching: ${pattern}`);
    };
    await use(waitForLog);
  }
});

module.exports = { test, expect: base.expect };
