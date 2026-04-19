const { httpsGetWithTimeout } = require('./http');

function createPexelsProvider({ apiKey, logger }) {
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is required for the pexels provider');
  }

  return {
    name: 'pexels',

    async getMetadata({ count = 30, orientation = 'landscape', query = '', start = 0 } = {}) {
      // Pexels pagination is 1-indexed.
      const page = Math.floor(start / count) + 1;
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&orientation=${orientation}`;
      logger.info(`Fetching Pexels metadata: ${url} (page=${page}, start=${start})`);
      const result = await httpsGetWithTimeout(url, {
        headers: {
          'Authorization': apiKey,
          'User-Agent': 'TheWall/1.0'
        }
      }, logger);
      if (!result) return [];
      try {
        if (result.statusCode !== 200) {
          throw new Error(`Pexels API error: ${result.statusCode}`);
        }
        const response = JSON.parse(result.body);
        return response.photos.map((photo) => ({
          id: photo.id.toString(),
          url: photo.src.original,
          color: photo.avg_color,
          user: {
            name: photo.photographer,
            href: photo.photographer_url
          },
          created_at: null,
          location: { name: null }
        }));
      } catch (err) {
        logger.error(`Failed to parse Pexels response: ${err.message}`);
        return [];
      }
    }
  };
}

module.exports = { createPexelsProvider };
