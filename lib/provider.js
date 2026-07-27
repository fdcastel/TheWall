import { createUnsplashProvider } from '../providers/unsplash.js';
import { createPexelsProvider } from '../providers/pexels.js';

/**
 * Build the provider described by `config`.
 *
 * Deliberately not memoised. The factories only close over their arguments --
 * no connection, no handshake -- so there is nothing to amortise, and the
 * previous cache keyed on provider *name* only, which meant a rotated
 * THEWALL_PROVIDER_KEY was ignored until the isolate recycled.
 */
export function getProvider(config) {
  switch (config.provider) {
    case 'unsplash':
      return createUnsplashProvider({ accessKey: config.providerKey });
    case 'pexels':
      return createPexelsProvider({ apiKey: config.providerKey });
    case 'local':
      throw new Error('local provider is not supported on Cloudflare Workers — use Docker for local folder serving');
    default:
      throw new Error(`Unsupported THEWALL_PROVIDER: ${config.provider}`);
  }
}
