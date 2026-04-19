const fastify = require('fastify')({ logger: true });
const fs = require('fs');
const path = require('path');
const https = require('https');

// Parse integer env with NaN fallback (preserves 0 instead of rewriting to default).
function parseIntEnv(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// Environment variables
const PROVIDER = process.env.THEWALL_PROVIDER || 'local';
const LOCAL_FOLDER = process.env.THEWALL_LOCAL_FOLDER || './samples';
const IMAGE_INTERVAL = parseIntEnv(process.env.THEWALL_IMAGE_INTERVAL, 30);
const IMAGE_QUERY = process.env.THEWALL_IMAGE_QUERY || 'nature';
const METADATA_COUNT = parseIntEnv(process.env.THEWALL_METADATA_COUNT, 30);
const PREFETCH_COUNT = parseIntEnv(process.env.THEWALL_PREFETCH_COUNT, 2);
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

const LOCAL_FOLDER_RESOLVED = path.resolve(LOCAL_FOLDER);

const EXTENSION_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const OUTBOUND_TIMEOUT_MS = 10000;

// Logging function
function log(level, message) {
  console.log(`[${level}] ${new Date().toISOString()}: ${message}`);
}

// Get metadata for local provider
function getLocalMetadata(count = 30, orientation = 'landscape', query = '', start = 0) {
  log('INFO', `Reading local folder "${LOCAL_FOLDER_RESOLVED}" for metadata`);
  let files;
  try {
    files = fs.readdirSync(LOCAL_FOLDER_RESOLVED);
  } catch (err) {
    log('INFO', `Failed to read local folder: ${err.message}`);
    return [];
  }
  // Filter image files
  files = files.filter(file => EXTENSION_CONTENT_TYPES[path.extname(file).toLowerCase()]);
  files.sort(); // alphabetical

  const metadata = [];
  const startIdx = parseInt(start);
  for (let i = 0; i < Math.min(count, files.length - startIdx); i++) {
    const idx = startIdx + i;
    if (idx >= files.length) break;
    const filename = files[idx];
    metadata.push({
      id: idx.toString(),
      url: `/api/images/${filename}`,
      color: '#000',
      user: null,
      created_at: null,
      location: { name: null }
    });
  }
  log('VERBOSE', `Generated metadata for ${metadata.length} images starting from ${start}`);
  return metadata;
}

// Perform an HTTPS GET with a hard timeout; resolves to { statusCode, body } or null on failure.
function httpsGetWithTimeout(url, options) {
  return new Promise((resolve) => {
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      res.on('error', (err) => {
        log('ERROR', `Response error: ${err.message}`);
        resolve(null);
      });
    });
    req.setTimeout(OUTBOUND_TIMEOUT_MS, () => {
      log('ERROR', `Upstream request timed out after ${OUTBOUND_TIMEOUT_MS}ms: ${url}`);
      req.destroy();
      resolve(null);
    });
    req.on('error', (err) => {
      log('ERROR', `Request error: ${err.message}`);
      resolve(null);
    });
  });
}

// Get metadata for Unsplash provider
async function getUnsplashMetadata(count = 30, orientation = 'landscape', query, start = 0) {
  if (!UNSPLASH_ACCESS_KEY) {
    log('ERROR', 'UNSPLASH_ACCESS_KEY not set');
    return [];
  }

  // Search endpoint does not return image location. Uses random endpoint, instead (does not have pagination).
  const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}&client_id=${UNSPLASH_ACCESS_KEY}`;

  log('INFO', `Fetching Unsplash metadata: ${url}`);
  const result = await httpsGetWithTimeout(url, { headers: { 'User-Agent': 'TheWall/1.0' } });
  if (!result) return [];
  try {
    if (result.statusCode !== 200) {
      throw new Error(`Unsplash API error: ${result.statusCode}`);
    }
    const photos = JSON.parse(result.body);
    const metadata = photos.map((photo) => ({
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
    log('VERBOSE', `Fetched ${metadata.length} Unsplash images`);
    return metadata;
  } catch (err) {
    log('ERROR', `Failed to parse Unsplash response: ${err.message}`);
    return [];
  }
}

// Get metadata for Pexels provider
async function getPexelsMetadata(count = 30, orientation = 'landscape', query, start = 0) {
  if (!PEXELS_API_KEY) {
    log('ERROR', 'PEXELS_API_KEY not set');
    return [];
  }
  // Pexels uses 1-indexed pages, calculate page from start
  const page = Math.floor(start / count) + 1;
  log('VERBOSE', `Pexels pagination: start=${start}, count=${count}, page=${page}`);
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&orientation=${orientation}`;
  log('INFO', `Fetching Pexels metadata: ${url}`);
  const result = await httpsGetWithTimeout(url, {
    headers: {
      'Authorization': PEXELS_API_KEY,
      'User-Agent': 'TheWall/1.0'
    }
  });
  if (!result) return [];
  try {
    if (result.statusCode !== 200) {
      throw new Error(`Pexels API error: ${result.statusCode}`);
    }
    const response = JSON.parse(result.body);
    const metadata = response.photos.map((photo) => ({
      id: photo.id.toString(),
      url: photo.src.original,
      color: photo.avg_color,
      user: {
        name: photo.photographer,
        href: photo.photographer_url
      },
      created_at: null, // Pexels doesn't provide creation date
      location: { name: null } // Pexels doesn't provide location
    }));
    log('VERBOSE', `Fetched ${metadata.length} Pexels images`);
    return metadata;
  } catch (err) {
    log('ERROR', `Failed to parse Pexels response: ${err.message}`);
    return [];
  }
}

// Metadata endpoint
fastify.get('/api/images/metadata', async (request, reply) => {
  const { count = METADATA_COUNT, orientation = 'landscape', query = IMAGE_QUERY, start = 0 } = request.query;
  log('INFO', `Metadata request: count=${count}, orientation=${orientation}, query=${query}, start=${start}`);

  if (PROVIDER === 'local') {
    const metadata = getLocalMetadata(parseInt(count), orientation, query, parseInt(start));
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.send({ images: metadata });
  } else if (PROVIDER === 'unsplash') {
    const metadata = await getUnsplashMetadata(parseInt(count), orientation, query, parseInt(start));
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.send({ images: metadata });
  } else if (PROVIDER === 'pexels') {
    const metadata = await getPexelsMetadata(parseInt(count), orientation, query, parseInt(start));
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.send({ images: metadata });
  } else {
    reply.code(501).send({ error: 'Provider not implemented' });
  }
});

// Image serving endpoint for local
fastify.get('/api/images/*', async (request, reply) => {
  const filename = request.params['*'];
  log('INFO', `Serving image: ${filename}`);

  // Reject absolute paths outright (Windows `C:\...` or Unix `/...`).
  if (path.isAbsolute(filename)) {
    log('INFO', `Rejected absolute path: ${filename}`);
    return reply.code(404).send({ error: 'Image not found' });
  }

  const resolved = path.resolve(LOCAL_FOLDER_RESOLVED, filename);
  const rootWithSep = LOCAL_FOLDER_RESOLVED + path.sep;
  if (resolved !== LOCAL_FOLDER_RESOLVED && !resolved.startsWith(rootWithSep)) {
    log('INFO', `Rejected path traversal: ${filename} -> ${resolved}`);
    return reply.code(404).send({ error: 'Image not found' });
  }

  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (err) {
    log('INFO', `Failed to stat image ${filename}: ${err.message}`);
    return reply.code(404).send({ error: 'Image not found' });
  }
  if (!stat.isFile()) {
    return reply.code(404).send({ error: 'Image not found' });
  }

  const etag = `"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (request.headers['if-none-match'] === etag) {
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.code(304).send();
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = EXTENSION_CONTENT_TYPES[ext] || 'application/octet-stream';

  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  reply.header('Content-Type', contentType);
  reply.header('Content-Length', stat.size);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Last-Modified', stat.mtime.toUTCString());
  reply.header('ETag', etag);
  return reply.send(fs.createReadStream(resolved));
});

// Serve static files
fastify.get('/', async (request, reply) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  reply.header('Content-Type', 'text/html');
  reply.send(fs.readFileSync(filePath, 'utf8'));
});

fastify.get('/style.css', async (request, reply) => {
  const filePath = path.join(__dirname, 'public', 'style.css');
  reply.header('Content-Type', 'text/css');
  reply.send(fs.readFileSync(filePath, 'utf8'));
});

fastify.get('/app.js', async (request, reply) => {
  const filePath = path.join(__dirname, 'public', 'app.js');
  reply.header('Content-Type', 'application/javascript');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.send(fs.readFileSync(filePath, 'utf8'));
});

fastify.get('/manifest.json', async (request, reply) => {
  const filePath = path.join(__dirname, 'public', 'manifest.json');
  reply.header('Content-Type', 'application/manifest+json');
  reply.send(fs.readFileSync(filePath, 'utf8'));
});

fastify.get('/img/thewall-icon.svg', async (request, reply) => {
  const filePath = path.join(__dirname, 'img', 'thewall-icon.svg');
  reply.header('Content-Type', 'image/svg+xml');
  reply.send(fs.readFileSync(filePath, 'utf8'));
});

// Config endpoint
fastify.get('/api/config', async (request, reply) => {
  log('INFO', 'Config request');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.send({
    provider: PROVIDER,
    imageInterval: IMAGE_INTERVAL,
    imageQuery: IMAGE_QUERY,
    metadataCount: METADATA_COUNT,
    prefetchCount: PREFETCH_COUNT
  });
});

// Ping endpoint for connectivity checks
fastify.get('/api/ping', async (request, reply) => {
  reply.send({ status: 'ok' });
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: '0.0.0.0' });
    log('INFO', `Server started on port ${port}`);
  } catch (err) {
    log('INFO', `Server failed to start: ${err.message}`);
    process.exit(1);
  }
};

start();
