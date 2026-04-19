import { parseIntEnv } from './lib/env.js';
import { getProvider } from './lib/provider.js';

const MAX_COUNT = 100;
const MAX_QUERY_LEN = 200;
const ALLOWED_ORIENTATIONS = new Set(['landscape', 'portrait']);

const NO_STORE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      if (url.pathname === '/api/ping') {
        return Response.json({ status: 'ok' });
      }

      if (url.pathname === '/api/config') {
        return Response.json({
          provider:      env.THEWALL_PROVIDER       ?? 'unsplash',
          imageInterval: parseIntEnv(env.THEWALL_IMAGE_INTERVAL, 30),
          imageQuery:    env.THEWALL_IMAGE_QUERY    ?? 'nature',
          metadataCount: parseIntEnv(env.THEWALL_METADATA_COUNT, 30),
          prefetchCount: parseIntEnv(env.THEWALL_PREFETCH_COUNT, 2)
        }, { headers: NO_STORE });
      }

      if (url.pathname === '/api/images/metadata') {
        return handleMetadata(url, env);
      }
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleMetadata(url, env) {
  const q = url.searchParams;

  const count = clampInt(q.get('count'), 1, MAX_COUNT,
    parseIntEnv(env.THEWALL_METADATA_COUNT, 30));
  if (count === null) return bad('count');

  const start = clampInt(q.get('start'), 0, Number.MAX_SAFE_INTEGER, 0);
  if (start === null) return bad('start');

  const orientation = q.get('orientation') ?? 'landscape';
  if (!ALLOWED_ORIENTATIONS.has(orientation)) return bad('orientation');

  const query = q.get('query') ?? env.THEWALL_IMAGE_QUERY ?? 'nature';
  if (query.length > MAX_QUERY_LEN) return bad('query');

  let images;
  try {
    const provider = getProvider(env);
    images = await provider.getMetadata({ count, start, orientation, query });
  } catch (err) {
    console.error(`Provider error: ${err.message}`);
    return Response.json({ images: [] }, { headers: NO_STORE });
  }

  return Response.json({ images }, { headers: NO_STORE });
}

function clampInt(raw, min, max, fallback) {
  if (raw == null) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

function bad(field) {
  return Response.json({ error: `Invalid ${field}` }, { status: 400 });
}
