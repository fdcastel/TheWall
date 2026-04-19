const { httpsGetWithTimeout } = require('./http');

function createUnsplashProvider({ accessKey, logger }) {
  if (!accessKey) {
    throw new Error('UNSPLASH_ACCESS_KEY is required for the unsplash provider');
  }

  return {
    name: 'unsplash',

    async getMetadata({ count = 30, orientation = 'landscape', query = '' } = {}) {
      // /search/photos does not return the `location` field, which attribution
      // depends on. /photos/random does — at the cost of no pagination.
      const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}&client_id=${accessKey}`;
      logger.info(`Fetching Unsplash metadata: ${url}`);
      const result = await httpsGetWithTimeout(url, { headers: { 'User-Agent': 'TheWall/1.0' } }, logger);
      if (!result) return [];
      try {
        if (result.statusCode !== 200) {
          throw new Error(`Unsplash API error: ${result.statusCode}`);
        }
        const photos = JSON.parse(result.body);
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
      } catch (err) {
        logger.error(`Failed to parse Unsplash response: ${err.message}`);
        return [];
      }
    }
  };
}

module.exports = { createUnsplashProvider };
