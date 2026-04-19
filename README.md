# TheWall

TheWall is a full-screen image slideshow web application. It displays high-resolution landscape images in a full-screen presentation and supports multiple image providers (Unsplash, Pexels, or a local folder).

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/fdcastel/TheWall)

## Features
- Full-screen image display with smooth transitions
- Optimized for devices with limited CPU resources (such as TVs)
- Keyboard, mouse, touch (gestures) and remote-control support for navigation
- Prefetching for fast image switches
- Deployable to Cloudflare Pages (zero-ops) or self-hostable via Docker

## Controls

### Keyboard / Remote
- `N` or `→`: Next image
- `P` or `←`: Previous image
- `I` or `Space`: Toggle image attribution
- `S` or `5`: Search for different images (remote providers only)
- `F`: Toggle fullscreen

### Mouse
- Wheel up/down: Navigate images
- Single click: Toggle attribution
- Double click: Toggle fullscreen

### Touch
- Swipe left/right: Navigate images
- Single tap: Toggle attribution
- Double tap: Toggle fullscreen

## Deploy to Cloudflare Pages (recommended)

The fastest path to a live instance is the Deploy to Cloudflare button at the top of this README:

1. Click the button. Cloudflare will fork this repository into your GitHub account and open the Workers Builds form pre-configured from [wrangler.toml](wrangler.toml).
2. **Fill `UNSPLASH_ACCESS_KEY` or `PEXELS_API_KEY`** (whichever provider you picked via `THEWALL_PROVIDER`) in the dedicated field on the form. Leave the other one blank. Optionally override the plaintext defaults (`THEWALL_PROVIDER`, `THEWALL_IMAGE_QUERY`, etc.) in the same screen.
3. **Clear the "Non-production branch deploy command" field.** The form's default of `npx wrangler versions upload` is a Workers-only command that won't work for this Pages project — either leave the field empty, or set it to `npm run deploy` to also deploy preview builds for non-production branches.
4. Click **Create and deploy**. Your site will be live at `https://<project-name>.pages.dev` once the build finishes.
5. *(Optional)* To use your own domain, open **Workers & Pages → your project → Custom domains → Set up a custom domain** and follow the DNS-verification flow.

Notes:
- The `local` provider is **not** supported on Cloudflare Pages — Workers isolates don't have filesystem access. Use the Docker path below if you need to serve a local folder of images.
- Provider keys should be set as Cloudflare **Secrets** (the Workers Builds form does this automatically when you fill them in the dedicated fields). If you add them later via **Settings → Variables and Secrets**, choose the **Secret** type rather than plaintext.

## Self-host with Docker

TheWall is also published as a container image on GHCR so you can self-host it on any Docker host. The Docker path supports all three providers (Unsplash, Pexels, **and** local).

Example using the local provider:

```bash
docker run -d --name thewall -p 3000:3000 \
  -e THEWALL_PROVIDER=local \
  -e THEWALL_LOCAL_FOLDER=/app/samples \
  -v /path/to/your/images:/app/samples:ro \
  ghcr.io/fdcastel/thewall:latest
```

Example using a remote provider:

```bash
docker run -d --name thewall -p 3000:3000 \
  -e THEWALL_PROVIDER=unsplash \
  -e UNSPLASH_ACCESS_KEY=your-key \
  ghcr.io/fdcastel/thewall:latest
```

## Quick start (local development)

Requires Node.js 24.15.0 or newer.

### Cloudflare Pages runtime (default)

Uses `wrangler pages dev` to emulate the production Cloudflare environment locally.

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in UNSPLASH_ACCESS_KEY or PEXELS_API_KEY
npm run dev
```

Open http://localhost:8788.

### Node / Fastify runtime

Used for the Docker path and when you need the `local` provider.

```bash
npm install
npm run dev:node
```

Open http://localhost:3000. Node 24's `--watch --env-file=.dev.vars` flags drive the hot-reload and env loading — no extra devDeps needed.

## Environment variables

| Variable                 | Description                                                                            | Default    | Required                |
|--------------------------|----------------------------------------------------------------------------------------|:----------:|:-----------------------:|
| `THEWALL_PROVIDER`       | Image provider: `unsplash`, `pexels`, or `local` (`local` is Docker/Node only)         | `unsplash` | No                      |
| `THEWALL_IMAGE_INTERVAL` | Seconds between transitions                                                            | `30`       | No                      |
| `THEWALL_IMAGE_QUERY`    | Search query for external providers                                                    | `nature`   | No                      |
| `THEWALL_METADATA_COUNT` | Number of images to fetch per metadata request                                         | `30`       | No                      |
| `THEWALL_PREFETCH_COUNT` | Number of upcoming images to prefetch                                                  | `2`        | No                      |
| `PORT`                   | Server port (Node/Docker only; Pages handles routing)                                  | `3000`     | No                      |
| `UNSPLASH_ACCESS_KEY`    | Unsplash API key — set as a **Secret** on Cloudflare Pages                             | -          | Yes, for Unsplash       |
| `PEXELS_API_KEY`         | Pexels API key — set as a **Secret** on Cloudflare Pages                               | -          | Yes, for Pexels         |
| `THEWALL_LOCAL_FOLDER`   | Path to local images (Docker/Node `local` provider only)                               | `./samples`| Yes, for local provider |

## Development notes

Scripts from [package.json](package.json):
- `npm run dev` — run the Cloudflare Pages runtime via `wrangler pages dev public`
- `npm run dev:node` — run the Fastify server with Node 24's `--watch --env-file=.dev.vars`
- `npm start` — run `node server.js` (used by the Dockerfile)
- `npm run deploy` — publish to Cloudflare Pages via `wrangler pages deploy public`
- `npm test` — runs the Playwright E2E suite (defaults to the wrangler runtime; set `THEWALL_TEST_RUNTIME=node` to run the local-provider tests against Fastify)

Notes and links
- See [SPEC.md](SPEC.md) for a complete specification of expected behavior and the dual-runtime architecture.
- When using a remote provider, set the provider API key environment variables before starting the server.
