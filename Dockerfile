# TheWall Docker Image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application files
COPY server.js ./
COPY public ./public
COPY img ./img

# Create samples directory (for local provider)
RUN mkdir -p ./samples

# Expose port
EXPOSE 3000

# Set default environment variables
ENV THEWALL_PROVIDER=unsplash
ENV THEWALL_IMAGE_INTERVAL=30
ENV THEWALL_IMAGE_QUERY=nature
ENV PORT=3000

# Start the application
CMD ["node", "server.js"]
