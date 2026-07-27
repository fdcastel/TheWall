const DEFAULT_TIMEOUT_MS = 10_000;

export function createUnsplashProvider({ accessKey, logger = console }) {
  if (!accessKey) {
    throw new Error('THEWALL_PROVIDER_KEY is required for the unsplash provider');
  }

  return {
    name: 'unsplash',

    async getMetadata({ count = 30, orientation = 'landscape', query = '' } = {}) {
      // /search/photos does not return the `location` field, which attribution
      // depends on. /photos/random does — at the cost of no pagination.
      const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}&client_id=${accessKey}`;
      logger.info?.(`Fetching Unsplash metadata: ${url}`);

      // Failures throw rather than returning []: the caller must be able to tell
      // "this provider is unavailable" (-> 503, client goes offline) apart from
      // "this query genuinely matched nothing" (-> 200 with an empty list).
      let res;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'TheWall/1.0' },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
        });
      } catch (err) {
        logger.error?.(`Unsplash request failed: ${err.message}`);
        throw new Error(`Unsplash request failed: ${err.message}`);
      }

      if (!res.ok) {
        logger.error?.(`Unsplash API error: ${res.status}`);
        throw new Error(`Unsplash API error: ${res.status}`);
      }

      let photos;
      try {
        photos = await res.json();
      } catch (err) {
        logger.error?.(`Failed to parse Unsplash response: ${err.message}`);
        throw new Error(`Failed to parse Unsplash response: ${err.message}`);
      }

      return photos.map((photo) => ({
        id: photo.id,
        url: photo.urls.raw,
        color: photo.color,
        user: {
          name: photo.user.name,
          href: photo.user.links.html
        },
        created_at: photo.created_at,
        location: photo.location ? { name: photo.location.name } : { name: null }
      }));
    }
  };
}
