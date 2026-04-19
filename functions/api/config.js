import { parseIntEnv } from '../../lib/env.js';

export async function onRequestGet({ env }) {
  const body = {
    provider:      env.THEWALL_PROVIDER       ?? 'unsplash',
    imageInterval: parseIntEnv(env.THEWALL_IMAGE_INTERVAL, 30),
    imageQuery:    env.THEWALL_IMAGE_QUERY    ?? 'nature',
    metadataCount: parseIntEnv(env.THEWALL_METADATA_COUNT, 30),
    prefetchCount: parseIntEnv(env.THEWALL_PREFETCH_COUNT, 2)
  };

  return Response.json(body, {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  });
}
