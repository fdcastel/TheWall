const DEFAULT_TIMEOUT_MS = 10_000;

export function createPexelsProvider({ apiKey, logger = console }) {
  if (!apiKey) {
    throw new Error('THEWALL_PROVIDER_KEY is required for the pexels provider');
  }

  return {
    name: 'pexels',

    async getMetadata({ count = 30, orientation = 'landscape', query = '', start = 0 } = {}) {
      // Pexels pagination is 1-indexed.
      const page = Math.floor(start / count) + 1;
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&orientation=${orientation}`;
      logger.info?.(`Fetching Pexels metadata: ${url} (page=${page}, start=${start})`);

      let res;
      try {
        res = await fetch(url, {
          headers: {
            'Authorization': apiKey,
            'User-Agent': 'TheWall/1.0'
          },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
        });
      } catch (err) {
        logger.error?.(`Pexels request failed: ${err.message}`);
        return [];
      }

      if (!res.ok) {
        logger.error?.(`Pexels API error: ${res.status}`);
        return [];
      }

      let response;
      try {
        response = await res.json();
      } catch (err) {
        logger.error?.(`Failed to parse Pexels response: ${err.message}`);
        return [];
      }

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
    }
  };
}
