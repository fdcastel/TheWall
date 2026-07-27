import { fetchJson } from '../lib/http.js';

export function createUnsplashProvider({ accessKey, logger = console }) {
  if (!accessKey) {
    throw new Error('THEWALL_PROVIDER_KEY is required for the unsplash provider');
  }

  return {
    name: 'unsplash',
    // /photos/random documents "Default: 1; max: 30".
    maxCount: 30,

    async getMetadata({ count = 30, orientation = 'landscape', query = '', width = 1920 } = {}) {
      count = Math.min(count, 30);

      // /search/photos does not return the `location` field, which attribution
      // depends on. /photos/random does — at the cost of no pagination.
      //
      // The access key goes in the Authorization header, not the query string:
      // this URL is logged, and `client_id=` would put the secret into Fastify
      // stdout and `wrangler tail`. Unsplash documents both forms.
      const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}`;
      logger.info?.(`Fetching Unsplash metadata: ${url}`);

      const photos = await fetchJson(url, {
        headers: { 'Authorization': `Client-ID ${accessKey}` },
        logger,
        label: 'Unsplash'
      });

      return photos.map((photo) => ({
        id: photo.id,
        // Carried through so the client can report the photo as used; see
        // trackDownload below.
        download_location: photo.links?.download_location ?? null,
        // `urls.raw` is the uncapped original — routinely 6000x4000 and ~2 MB,
        // decoded in full on a TV only to be drawn downscaled. Unsplash serves
        // raw URLs through Imgix and documents these parameters; `fit=max`
        // never upscales, so a small original is passed through untouched.
        // Measured on a 1.89 MB original: 317 KB at w=1920, 1.18 MB at w=3840.
        url: `${photo.urls.raw}&w=${width}&q=80&fm=jpg&fit=max`,
        color: photo.color,
        user: {
          name: photo.user.name,
          href: photo.user.links.html
        },
        created_at: photo.created_at,
        location: photo.location ? { name: photo.location.name } : { name: null }
      }));
    },

    /**
     * Unsplash's API guidelines require a GET to the photo's
     * `download_location` every time the application actually uses a photo.
     * This is tracking only: it does not transfer the image.
     *
     * The location arrives from the browser, and this request carries the
     * access key, so the host is checked before it is sent anywhere — an
     * unchecked URL here would be an SSRF that leaks the key to any host the
     * caller names.
     */
    async trackDownload(location) {
      if (typeof location !== 'string' || !location.startsWith('https://api.unsplash.com/photos/')) {
        throw new Error('Refusing to track a download location outside api.unsplash.com');
      }
      logger.info?.(`Tracking Unsplash download: ${location}`);
      await fetchJson(location, {
        headers: { 'Authorization': `Client-ID ${accessKey}` },
        logger,
        label: 'Unsplash download'
      });
    }
  };
}
