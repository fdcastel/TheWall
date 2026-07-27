import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

export function createLocalProvider({ folder, logger }) {
  const resolvedFolder = path.resolve(folder);

  return {
    name: 'local',
    resolvedFolder,
    extensionContentTypes: EXTENSION_CONTENT_TYPES,

    async getMetadata({ count = 30, start = 0 } = {}) {
      logger.info(`Reading local folder "${resolvedFolder}" for metadata`);
      // An unreadable folder is a provider failure (-> 503), distinct from a
      // readable folder whose page is past the end (-> 200 with an empty list).
      let files;
      try {
        files = fs.readdirSync(resolvedFolder);
      } catch (err) {
        logger.error(`Failed to read local folder: ${err.message}`);
        throw new Error(`Failed to read local folder: ${err.message}`);
      }
      files = files
        .filter(file => EXTENSION_CONTENT_TYPES[path.extname(file).toLowerCase()])
        .sort();

      const metadata = [];
      const startIdx = Number(start);
      for (let i = 0; i < Math.min(count, files.length - startIdx); i++) {
        const idx = startIdx + i;
        if (idx >= files.length) break;
        metadata.push({
          id: idx.toString(),
          // Must be encoded: a filename containing a space, '#', '?' or '%' is
          // otherwise emitted as a malformed URL. '#' in particular truncates
          // the path into a fragment, so the image 404s, the <img> onerror
          // handler fires, and the whole app drops into offline mode.
          url: `/api/images/${encodeURIComponent(files[idx])}`,
          color: '#000',
          user: null,
          created_at: null,
          location: { name: null }
        });
      }
      return metadata;
    }
  };
}
