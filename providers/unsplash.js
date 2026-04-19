const DEFAULT_TIMEOUT_MS = 10_000;

export function createUnsplashProvider({ accessKey, logger = console }) {
  if (!accessKey) {
    throw new Error('UNSPLASH_ACCESS_KEY is required for the unsplash provider');
  }

  return {
    name: 'unsplash',

    async getMetadata({ count = 30, orientation = 'landscape', query = '' } = {}) {
      // /search/photos does not return the `location` field, which attribution
      // depends on. /photos/random does — at the cost of no pagination.
      const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}&client_id=${accessKey}`;
      logger.info?.(`Fetching Unsplash metadata: ${url}`);

      let res;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': 'TheWall/1.0' },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
        });
      } catch (err) {
        logger.error?.(`Unsplash request failed: ${err.message}`);
        return [];
      }

      if (!res.ok) {
        logger.error?.(`Unsplash API error: ${res.status}`);
        return [];
      }

      let photos;
      try {
        photos = await res.json();
      } catch (err) {
        logger.error?.(`Failed to parse Unsplash response: ${err.message}`);
        return [];
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
