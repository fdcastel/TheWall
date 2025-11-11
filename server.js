const fastify = require('fastify')({ logger: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// Environment variables
const PROVIDER = process.env.THEWALL_PROVIDER || 'local';
const LOCAL_FOLDER = process.env.THEWALL_LOCAL_FOLDER || './samples';
const IMAGE_INTERVAL = parseInt(process.env.THEWALL_IMAGE_INTERVAL) || 30;    // TODO: Pass to client
const IMAGE_QUERY = process.env.THEWALL_IMAGE_QUERY || 'nature';    // TODO: Pass to client
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// Logging function
function log(level, message) {
  console.log(`[${level}] ${new Date().toISOString()}: ${message}`);
}

// Get metadata for local provider
function getLocalMetadata(count = 30, orientation = 'landscape', query = '', start = 0) {
  const folderPath = path.resolve(LOCAL_FOLDER);
  log('INFO', `Reading local folder "${folderPath}" for metadata`);
  let files;
  try {
    files = fs.readdirSync(folderPath);
  } catch (err) {
    log('INFO', `Failed to read local folder: ${err.message}`);
    return [];
  }
  // Filter image files
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  files = files.filter(file => imageExtensions.includes(path.extname(file).toLowerCase()));
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

// Get metadata for Unsplash provider
function getUnsplashMetadata(count = 30, orientation = 'landscape', query, start = 0) {
  return new Promise((resolve, reject) => {
    if (!UNSPLASH_ACCESS_KEY) {
      log('ERROR', 'UNSPLASH_ACCESS_KEY not set');
      resolve([]);
      return;
    }
    const url = `https://api.unsplash.com/photos/random?count=${count}&orientation=${orientation}&query=${encodeURIComponent(query)}&client_id=${UNSPLASH_ACCESS_KEY}`;
    log('INFO', `Fetching Unsplash metadata: ${url}`);
    https.get(url, { headers: { 'User-Agent': 'TheWall/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            throw new Error(`Unsplash API error: ${res.statusCode}`);
          }
          const photos = JSON.parse(data);
          const metadata = photos.map((photo, index) => ({
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
          resolve(metadata);
        } catch (err) {
          log('ERROR', `Failed to parse Unsplash response: ${err.message}`);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      log('ERROR', `Failed to fetch Unsplash metadata: ${err.message}`);
      resolve([]);
    });
  });
}

// Get metadata for Pexels provider
function getPexelsMetadata(count = 30, orientation = 'landscape', query, start = 0) {
  return new Promise((resolve, reject) => {
    if (!PEXELS_API_KEY) {
      log('ERROR', 'PEXELS_API_KEY not set');
      resolve([]);
      return;
    }
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=${orientation}`;
    log('INFO', `Fetching Pexels metadata: ${url}`);
    https.get(url, {
      headers: {
        'Authorization': PEXELS_API_KEY,
        'User-Agent': 'TheWall/1.0'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            throw new Error(`Pexels API error: ${res.statusCode}`);
          }
          const response = JSON.parse(data);
          const metadata = response.photos.map((photo, index) => ({
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
          resolve(metadata);
        } catch (err) {
          log('ERROR', `Failed to parse Pexels response: ${err.message}`);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      log('ERROR', `Failed to fetch Pexels metadata: ${err.message}`);
      resolve([]);
    });
  });
}

// Metadata endpoint
fastify.get('/api/images/metadata', async (request, reply) => {
  const { count = 30, orientation = 'landscape', query = IMAGE_QUERY, start = 0 } = request.query;
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
  const filePath = path.join(LOCAL_FOLDER, filename);
  try {
    const stat = fs.statSync(filePath);
    const etag = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('Content-Type', 'image/jpeg'); // assume jpeg, but could detect
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.send(fs.readFileSync(filePath));
  } catch (err) {
    log('INFO', `Failed to serve image ${filename}: ${err.message}`);
    reply.code(404).send({ error: 'Image not found' });
  }
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
  reply.send(fs.readFileSync(filePath, 'utf8'));
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