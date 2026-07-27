const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * GET a JSON document from a provider API.
 *
 * Throws a descriptive Error on transport failure, a non-2xx status, or an
 * unparseable body. Callers depend on a throw meaning "this provider is
 * unavailable" (which the routes turn into a 503), as distinct from a
 * successful response that happens to contain no results (a 200 with an empty
 * list). Returning [] for both is what previously drove the client into an
 * unbounded retry loop.
 */
export async function fetchJson(url, {
  headers = {},
  logger = console,
  label = 'Provider',
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'TheWall/1.0', ...headers },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw logged(logger, `${label} request failed: ${err.message}`);
  }

  if (!res.ok) {
    throw logged(logger, `${label} API error: ${res.status}`);
  }

  try {
    return await res.json();
  } catch (err) {
    throw logged(logger, `Failed to parse ${label} response: ${err.message}`);
  }
}

function logged(logger, message) {
  logger.error?.(message);
  return new Error(message);
}
