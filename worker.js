import { readConfig, publicConfig, parseMetadataQuery } from './lib/config.js';
import { getProvider } from './lib/provider.js';

const NO_STORE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // Unmatched /api/* must not fall through to the asset handler, which
      // would answer POST /api/config with index.html and a 200.
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 });
      }

      const config = readConfig(env);

      if (url.pathname === '/api/ping') {
        return Response.json({ status: 'ok' });
      }

      if (url.pathname === '/api/config') {
        return Response.json(publicConfig(config), { headers: NO_STORE });
      }

      if (url.pathname === '/api/images/metadata') {
        return handleMetadata(url, env, config);
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleMetadata(url, env, config) {
  const parsed = parseMetadataQuery((key) => url.searchParams.get(key) ?? undefined, config);
  if (!parsed.ok) {
    return Response.json({ error: `Invalid ${parsed.field}` }, { status: 400 });
  }

  let images;
  try {
    const provider = getProvider(config);
    images = await provider.getMetadata(parsed.params);
  } catch (err) {
    // 503, not an empty list: the client must be able to distinguish an
    // unavailable provider (go offline) from a query that matched nothing
    // (show the warning and keep the current images).
    console.error(`Provider error: ${err.message}`);
    return Response.json(
      { images: [], error: 'provider_unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }

  return Response.json({ images }, { headers: NO_STORE });
}
