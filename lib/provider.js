import { createUnsplashProvider } from '../providers/unsplash.js';
import { createPexelsProvider } from '../providers/pexels.js';

let cached;
let cachedFor;

export function getProvider(env) {
  const name = env.THEWALL_PROVIDER;

  if (cached && cachedFor === name) return cached;

  if (name === 'unsplash') {
    cached = createUnsplashProvider({ accessKey: env.THEWALL_PROVIDER_KEY });
  } else if (name === 'pexels') {
    cached = createPexelsProvider({ apiKey: env.THEWALL_PROVIDER_KEY });
  } else if (name === 'local') {
    throw new Error('local provider is not supported on Cloudflare Workers — use Docker for local folder serving');
  } else {
    throw new Error(`Unsupported THEWALL_PROVIDER: ${name}`);
  }

  cachedFor = name;
  return cached;
}
