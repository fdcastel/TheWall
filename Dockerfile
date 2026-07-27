# TheWall Docker Image
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only.
# --ignore-scripts: no production dependency needs a lifecycle script, and not
# running them removes an arbitrary-code-execution path at image build time.
RUN npm ci --omit=dev --ignore-scripts

# Copy application files
COPY server.js ./
COPY public ./public
COPY providers ./providers
COPY lib ./lib

# Mount point for the local provider. The repository's ./samples folder is
# deliberately NOT copied in -- .dockerignore excludes it, to keep 12 MB of
# JPEGs out of the image -- so this starts empty and the local provider serves
# nothing until you bind-mount your own folder over it:
#   docker run -v /path/to/images:/app/samples:ro ...
RUN mkdir -p ./samples

# Expose port
EXPOSE 3000

# Set default environment variables.
# Defaults to the local provider so an unconfigured container serves whatever
# is mounted at /app/samples. Switch to `unsplash`/`pexels` and supply
# THEWALL_PROVIDER_KEY to use the external providers.
ENV THEWALL_PROVIDER=local
ENV THEWALL_LOCAL_FOLDER=/app/samples
ENV THEWALL_IMAGE_INTERVAL=30
ENV THEWALL_IMAGE_QUERY=nature
ENV PORT=3000

# Drop root. The node image ships an unprivileged `node` user; the app only
# ever reads from /app, so it needs nothing more.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the application
CMD ["node", "server.js"]
