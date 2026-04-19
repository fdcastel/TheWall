import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { createLocalProvider } from './providers/local.js';
import { createUnsplashProvider } from './providers/unsplash.js';
import { createPexelsProvider } from './providers/pexels.js';
import { parseIntEnv } from './lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

// Environment variables
const PROVIDER = process.env.THEWALL_PROVIDER || 'local';
const LOCAL_FOLDER = process.env.THEWALL_LOCAL_FOLDER || './samples';
const IMAGE_INTERVAL = parseIntEnv(process.env.THEWALL_IMAGE_INTERVAL, 30);
const IMAGE_QUERY = process.env.THEWALL_IMAGE_QUERY || 'nature';
const METADATA_COUNT = parseIntEnv(process.env.THEWALL_METADATA_COUNT, 30);
const PREFETCH_COUNT = parseIntEnv(process.env.THEWALL_PREFETCH_COUNT, 2);

const logger = fastify.log;

// Build the provider; abort startup if configuration is incomplete.
let imageProvider;
try {
  if (PROVIDER === 'local') {
    imageProvider = createLocalProvider({ folder: LOCAL_FOLDER, logger });
  } else if (PROVIDER === 'unsplash') {
    imageProvider = createUnsplashProvider({ accessKey: process.env.THEWALL_PROVIDER_KEY, logger });
  } else if (PROVIDER === 'pexels') {
    imageProvider = createPexelsProvider({ apiKey: process.env.THEWALL_PROVIDER_KEY, logger });
  } else {
    throw new Error(`Unknown THEWALL_PROVIDER: ${PROVIDER}`);
  }
} catch (err) {
  // Using console.error rather than logger.fatal so the message is visible
  // before the Fastify logger has been initialised in some test environments.
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
}

// ---------- Static assets ----------

fastify.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  index: 'index.html',
  decorateReply: true,
  setHeaders: (res, filePath) => {
    // app.js mutates often enough that caching hurts during development.
    if (filePath.endsWith(`${path.sep}app.js`)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
});

// ---------- Local image serving ----------

if (PROVIDER === 'local') {
  const { resolvedFolder, extensionContentTypes } = imageProvider;

  fastify.get('/api/images/*', async (request, reply) => {
    const filename = request.params['*'];
    logger.info(`Serving image: ${filename}`);

    if (path.isAbsolute(filename)) {
      logger.info(`Rejected absolute path: ${filename}`);
      return reply.code(404).send({ error: 'Image not found' });
    }

    const resolved = path.resolve(resolvedFolder, filename);
    const rootWithSep = resolvedFolder + path.sep;
    if (resolved !== resolvedFolder && !resolved.startsWith(rootWithSep)) {
      logger.info(`Rejected path traversal: ${filename} -> ${resolved}`);
      return reply.code(404).send({ error: 'Image not found' });
    }

    let stat;
    try {
      stat = fs.statSync(resolved);
    } catch (err) {
      logger.info(`Failed to stat image ${filename}: ${err.message}`);
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
    const contentType = extensionContentTypes[ext] || 'application/octet-stream';

    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    reply.header('Content-Type', contentType);
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Last-Modified', stat.mtime.toUTCString());
    reply.header('ETag', etag);
    return reply.send(fs.createReadStream(resolved));
  });
}

// ---------- API routes ----------

const metadataQuerySchema = {
  type: 'object',
  properties: {
    count: { type: 'integer', minimum: 1, maximum: 100 },
    start: { type: 'integer', minimum: 0 },
    orientation: { type: 'string', enum: ['landscape', 'portrait'] },
    query: { type: 'string', maxLength: 200 }
  },
  additionalProperties: false
};

fastify.get('/api/images/metadata', { schema: { querystring: metadataQuerySchema } }, async (request, reply) => {
  const {
    count = METADATA_COUNT,
    orientation = 'landscape',
    query = IMAGE_QUERY,
    start = 0
  } = request.query;

  logger.info(`Metadata request: count=${count}, orientation=${orientation}, query=${query}, start=${start}`);
  const images = await imageProvider.getMetadata({ count, orientation, query, start });

  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return { images };
});

fastify.get('/api/config', async (_request, reply) => {
  logger.info('Config request');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return {
    provider: PROVIDER,
    imageInterval: IMAGE_INTERVAL,
    imageQuery: IMAGE_QUERY,
    metadataCount: METADATA_COUNT,
    prefetchCount: PREFETCH_COUNT
  };
});

fastify.get('/api/ping', async () => ({ status: 'ok' }));

// ---------- Start ----------

const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    logger.info(`Server started on port ${port} (provider=${PROVIDER})`);
  } catch (err) {
    logger.error(`Server failed to start: ${err.message}`);
    process.exit(1);
  }
};

start();
