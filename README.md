# TheWall

TheWall is a full-screen image slideshow web application. It displays high-resolution landscape images in a full-screen presentation and supports multiple image providers (Unsplash, Pexels, or a local folder).

thewall.dalcastel.com

## Features
- Full-screen image display with smooth transitions
- Optimized for devices with limited CPU resources (such as TVs)
- Keyboard, mouse, touch (gestures) and remote-control support for navigation
- Prefetching for fast image switches
- Docker-friendly for easy deployment

## Controls

### Keyboard / Remote
- `N` or `→`: Next image
- `P` or `←`: Previous image  
- `I` or `Space`: Toggle image attribution
- `S` or `5`: Search for different images (remote providers only)
- `F`: Toggle fullscreen
- `O` or `0`: Toggle offline mode

### Mouse
- Wheel up/down: Navigate images
- Single click: Toggle attribution
- Double click: Toggle fullscreen

### Touch
- Swipe left/right: Navigate images
- Single tap: Toggle attribution
- Double tap: Toggle fullscreen

## Quick start (Node)
1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open http://localhost:3000 in your browser.

## Docker 

Example using local provider:
```bash
docker run -d --name thewall -p 3000:3000 \
  -e THEWALL_PROVIDER=local \
  -e THEWALL_LOCAL_FOLDER=/app/samples \
  -v /path/to/your/images:/app/samples:ro \
  ghcr.io/fdcastel/thewall:latest
```

## Environment variables
| Variable                 | Description                                      | Default    | Required                |
|--------------------------|--------------------------------------------------|:----------:|:-----------------------:|
| `THEWALL_PROVIDER`       | Image provider: `unsplash`, `pexels`, or `local` | `unsplash` | No                      |
| `THEWALL_IMAGE_INTERVAL` | Seconds between transitions                      | `30`       | No                      |
| `THEWALL_IMAGE_QUERY`    | Search query for external providers              | `nature`   | No                      |
| `PORT`                   | Server port                                      | `3000`     | No                      |
| `UNSPLASH_ACCESS_KEY`    | Unsplash API key (Unsplash provider)             | -          | Yes, for Unsplash       |
| `PEXELS_API_KEY`         | Pexels API key (Pexels provider)                 | -          | Yes, for Pexels         |
| `THEWALL_LOCAL_FOLDER`   | Path to local images (Local provider)            | -          | Yes, for local provider |

# Development notes

Scripts from `package.json`:
- `npm start` — run `node server.js`
- `npm run dev` — run `node server.js` (same as start here)
- `npm test` — runs Jest tests
- `npm run test:e2e` — runs Playwright tests
- `npm run test:unit` — runs unit tests

Testing
- Unit tests: `npm run test:unit`
- E2E tests: `npm run test`

Notes and links
- See `SPEC.md` for a complete specification of expected behavior.
- When using a remote provider, set the provider API key environment variables before starting the server.
