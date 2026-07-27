/**
 * Single source of truth for configuration defaults and request-validation
 * limits.
 *
 * Both runtimes read from a plain string map -- `process.env` on Node and the
 * `env` binding object on Workers -- so one reader serves both. Before this
 * existed the same defaults were written out in server.js, worker.js,
 * public/app.js, wrangler.toml, the Dockerfile and the README table, and the
 * two runtimes had silently drifted apart on THEWALL_PROVIDER.
 */

export const DEFAULTS = {
  provider: 'unsplash',
  localFolder: './samples',
  imageInterval: 30,
  imageQuery: 'nature',
  metadataCount: 30,
  prefetchCount: 2
};

export const LIMITS = {
  // Upper bound accepted by /api/images/metadata. 80 is the largest page any
  // provider supports (Pexels per_page); each provider clamps further to its
  // own ceiling -- see `maxCount` on the provider objects. The previous value
  // of 100 was above every provider's real maximum.
  countMin: 1,
  countMax: 80,

  queryMaxLength: 200,
  orientations: ['landscape', 'portrait'],

  // Requested image width, used to ask providers for a display-sized rendition
  // instead of the multi-megabyte original.
  widthMin: 640,
  widthMax: 3840,
  widthDefault: 1920
};

/**
 * Parse an integer environment variable, falling back to `defaultValue` when it
 * is absent or unparseable. `min` guards against values that are parseable but
 * nonsensical -- THEWALL_IMAGE_INTERVAL=0 previously reached
 * setInterval(fn, 0) and spun the slideshow as fast as the browser allowed.
 */
export function parseIntEnv(value, defaultValue, { min } = {}) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  if (min !== undefined && parsed < min) return defaultValue;
  return parsed;
}

/** Read the full application configuration out of an environment map. */
export function readConfig(env = {}) {
  return {
    provider: env.THEWALL_PROVIDER || DEFAULTS.provider,
    providerKey: env.THEWALL_PROVIDER_KEY,
    localFolder: env.THEWALL_LOCAL_FOLDER || DEFAULTS.localFolder,
    imageInterval: parseIntEnv(env.THEWALL_IMAGE_INTERVAL, DEFAULTS.imageInterval, { min: 1 }),
    imageQuery: env.THEWALL_IMAGE_QUERY || DEFAULTS.imageQuery,
    metadataCount: parseIntEnv(env.THEWALL_METADATA_COUNT, DEFAULTS.metadataCount, { min: 1 }),
    prefetchCount: parseIntEnv(env.THEWALL_PREFETCH_COUNT, DEFAULTS.prefetchCount, { min: 0 })
  };
}

/** The subset of the configuration exposed to the browser via /api/config. */
export function publicConfig(config) {
  return {
    provider: config.provider,
    imageInterval: config.imageInterval,
    imageQuery: config.imageQuery,
    metadataCount: config.metadataCount,
    prefetchCount: config.prefetchCount
  };
}

/**
 * Validate and normalise the /api/images/metadata query parameters.
 * Returns `{ ok: true, params }` or `{ ok: false, field }`.
 *
 * Shared so the Fastify and Workers routes cannot drift: they previously
 * encoded the same four rules independently, in two different styles, which is
 * how both ended up accepting a `count` no provider would honour.
 */
export function parseMetadataQuery(get, config) {
  const count = boundedInt(get('count'), LIMITS.countMin, LIMITS.countMax, config.metadataCount);
  if (count === null) return { ok: false, field: 'count' };

  const start = boundedInt(get('start'), 0, Number.MAX_SAFE_INTEGER, 0);
  if (start === null) return { ok: false, field: 'start' };

  const width = boundedInt(get('width'), LIMITS.widthMin, LIMITS.widthMax, LIMITS.widthDefault);
  if (width === null) return { ok: false, field: 'width' };

  const orientation = get('orientation') ?? 'landscape';
  if (!LIMITS.orientations.includes(orientation)) return { ok: false, field: 'orientation' };

  const query = get('query') ?? config.imageQuery;
  if (query.length > LIMITS.queryMaxLength) return { ok: false, field: 'query' };

  return { ok: true, params: { count, start, width, orientation, query } };
}

function boundedInt(raw, min, max, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}
