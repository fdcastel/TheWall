const https = require('https');

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Perform an HTTPS GET with a hard timeout. Resolves to
 * `{ statusCode, body }` or `null` on network error / timeout.
 */
function httpsGetWithTimeout(url, options, logger, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      res.on('error', (err) => {
        logger.error(`Response error: ${err.message}`);
        resolve(null);
      });
    });
    req.setTimeout(timeoutMs, () => {
      logger.error(`Upstream request timed out after ${timeoutMs}ms: ${url}`);
      req.destroy();
      resolve(null);
    });
    req.on('error', (err) => {
      logger.error(`Request error: ${err.message}`);
      resolve(null);
    });
  });
}

module.exports = { httpsGetWithTimeout };
