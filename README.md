# TheWall

A web-based image slideshow application that displays high-resolution landscape images in a full-screen, auto-advancing presentation.

## Features

- Full-screen image display with smooth transitions
- Auto-advance every 30 seconds (configurable)
- Keyboard navigation (N/→ for next, P/← for previous)
- Attribution overlay with photographer info
- Offline mode support
- Image prefetching for instant loading
- Support for local image provider

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables:
   ```bash
   export THEWALL_PROVIDER=local
   export THEWALL_LOCAL_FOLDER=./samples
   export THEWALL_IMAGE_INTERVAL=30
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open http://localhost:3000 in your browser.

## Testing

- Unit tests: `npm run test:unit`
- E2E tests: `npm run test:e2e` (requires server running)

## Usage

- Use keyboard shortcuts to navigate
- Press 'A' to toggle attribution
- Press 'O' to toggle offline mode