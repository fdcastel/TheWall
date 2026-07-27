import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { createLocalProvider } from './providers/local.js';
import { getProvider } from './lib/provider.js';
import { readConfig, publicConfig, parseMetadataQuery } from './lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({ logger: true });

const config = readConfig(process.env);
const PROVIDER = config.provider;

const logger = fastify.log;

// Build the provider; abort startup if configuration is incomplete.
// `local` is constructed here rather than in lib/provider.js so that the
// Workers bundle never has to pull in node:fs.
let imageProvider;
try {
  imageProvider = PROVIDER === 'local'
    ? createLocalProvider({ folder: config.localFolder, logger })
    : getProvider(config);
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
  // @fastify/static v8+ calls this as fn(reply, path, stat) with a Fastify
  // Reply. It was fn(res, path, stat) with a raw ServerResponse in v6, so
  // res.setHeader() here threw and killed the process on every /app.js request.
  setHeaders: (reply, filePath) => {
    // app.js mutates often enough that caching hurts during development.
    if (filePath.endsWith(`${path.sep}app.js`)) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
});

// ---------- Local image serving ----------

// Served by hand rather than by a second @fastify/static registration, which
// looks like the obvious simplification but cannot work here: the plugin
// resolves the path with decodeURI(), which by design leaves reserved
// characters escaped. A file named "Photo #3.jpg" is emitted as
// "Photo%20%233.jpg", decodeURI() yields "Photo %233.jpg", and it 404s. Since
// a 404 here fires <img> onerror and drops the whole app into offline mode,
// one ordinary filename would take the slideshow down. Verified against
// @fastify/static 10.1.2.
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
    // Deliberately no `Accept-Ranges: bytes`. This route does not read the
    // Range header and always sends the whole file, so advertising range
    // support was simply untrue. <img> never issues range requests, so nothing
    // depends on it.
    reply.header('Last-Modified', stat.mtime.toUTCString());
    reply.header('ETag', etag);
    return reply.send(fs.createReadStream(resolved));
  });
}

// ---------- API routes ----------

// Validation lives in lib/config.js so this route and the Workers route cannot
// drift; they previously encoded the same rules independently, in two different
// styles, and both ended up accepting a `count` no provider would honour.
fastify.get('/api/images/metadata', async (request, reply) => {
  const parsed = parseMetadataQuery((key) => request.query[key], config);
  if (!parsed.ok) {
    return reply.code(400).send({ error: `Invalid ${parsed.field}` });
  }
  const { count, orientation, query, start, width } = parsed.params;

  logger.info(`Metadata request: count=${count}, orientation=${orientation}, query=${query}, start=${start}, width=${width}`);

  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');

  let images;
  try {
    images = await imageProvider.getMetadata(parsed.params);
  } catch (err) {
    // 503, not an empty list: the client must be able to distinguish an
    // unavailable provider (go offline) from a query that matched nothing
    // (show the warning and keep the current images).
    logger.error(`Provider error: ${err.message}`);
    return reply.code(503).send({ images: [], error: 'provider_unavailable' });
  }

  return { images };
});

fastify.get('/api/config', async (_request, reply) => {
  logger.info('Config request');
  reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return publicConfig(config);
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
