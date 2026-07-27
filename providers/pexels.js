const DEFAULT_TIMEOUT_MS = 10_000;

export function createPexelsProvider({ apiKey, logger = console }) {
  if (!apiKey) {
    throw new Error('THEWALL_PROVIDER_KEY is required for the pexels provider');
  }

  return {
    name: 'pexels',
    // /v1/search documents "Default: 15 | Max: 80" for per_page.
    maxCount: 80,

    async getMetadata({ count = 30, orientation = 'landscape', query = '', start = 0, width = 1920 } = {}) {
      count = Math.min(count, 80);
      // Pexels pagination is 1-indexed.
      const page = Math.floor(start / count) + 1;
      const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&orientation=${orientation}`;
      logger.info?.(`Fetching Pexels metadata: ${url} (page=${page}, start=${start})`);

      // Failures throw rather than returning []: the caller must be able to tell
      // "this provider is unavailable" (-> 503, client goes offline) apart from
      // "this query genuinely matched nothing" (-> 200 with an empty list).
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
        throw new Error(`Pexels request failed: ${err.message}`);
      }

      if (!res.ok) {
        logger.error?.(`Pexels API error: ${res.status}`);
        throw new Error(`Pexels API error: ${res.status}`);
      }

      let response;
      try {
        response = await res.json();
      } catch (err) {
        logger.error?.(`Failed to parse Pexels response: ${err.message}`);
        throw new Error(`Failed to parse Pexels response: ${err.message}`);
      }

      return response.photos.map((photo) => ({
        id: photo.id.toString(),
        // `src.original` is the uncapped original. Pexels does not *document*
        // resize parameters on it, but its own `src.*` variants are exactly
        // this URL plus these parameters, and they demonstrably work: measured
        // on a 1.94 MB original, 373 KB at w=1920. If Pexels ever drops them
        // the URL still returns the original, so this degrades to the previous
        // behaviour rather than breaking. The documented alternative is the
        // fixed-size src.large2x (1880x1300), which cannot match the viewport.
        url: `${photo.src.original}?auto=compress&cs=tinysrgb&w=${width}`,
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
