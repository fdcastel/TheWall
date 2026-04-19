const fs = require('fs');
const path = require('path');

const EXTENSION_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

function createLocalProvider({ folder, logger }) {
  const resolvedFolder = path.resolve(folder);

  return {
    name: 'local',
    resolvedFolder,
    extensionContentTypes: EXTENSION_CONTENT_TYPES,

    async getMetadata({ count = 30, start = 0 } = {}) {
      logger.info(`Reading local folder "${resolvedFolder}" for metadata`);
      let files;
      try {
        files = fs.readdirSync(resolvedFolder);
      } catch (err) {
        logger.info(`Failed to read local folder: ${err.message}`);
        return [];
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
          url: `/api/images/${files[idx]}`,
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

module.exports = { createLocalProvider };
