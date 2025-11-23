# TheWall Application Specification

## Overview

TheWall is a web-based image slideshow application that displays high-resolution landscape images in a full-screen, auto-advancing presentation. 

The application supports multiple image providers (local storage, Unsplash, Pexels) that can be configured before startup.

Images are displayed with smooth transitions, attribution information, and have support for working in offline mode (reusing previously downloaded content).

The application provides a unified command control experience across devices: desktops with keyboards/mice, tablets/totems with touch screens, and TVs with remote controls.

## Core Functionality

### Image Display
- Images must be displayed full-screen, covering the entire viewport
- Images should maintain their aspect ratio while filling the screen (object-fit: cover)
- Transitions between images should be smooth (e.g. a quick fade effect)
- Double buffering should be used to preload the next image in a hidden element before fading it in, preventing black screens during transitions.
- Hardware acceleration hints (will-change) should be used to improve performance on lower-end devices (e.g., TVs).
- Full-screen mode can be toggled by double-clicking anywhere on the screen (except interactive elements).
- Attribution can be toggled by single-clicking anywhere on the screen (except interactive elements).

### Navigation
- Users can navigate to the next/previous image using keyboard shortcuts
- Images should automatically advance every 30 seconds (default, configurable)
- Timer should reset when user manually navigates
- Auto-advance should continue in offline mode
- Navigation should work in both online and offline modes

### Search Functionality
- Users can change the search query for images (disabled for local provider)
- A search dialog appears at the top center of the screen with modern styling
- The dialog shows the current search query and allows editing
- Press Enter to confirm the new search term
- Press Escape to cancel and close the dialog
- When the search query changes, the application attempts to fetch new images with the new query
- If the new query returns results, the loading screen is displayed while metadata and cache are reset and new images are fetched
- If the new query returns no results, a warning message is displayed and the application reverts to the previous query without showing the loading screen
- Search functionality is only available for Unsplash and Pexels providers (local provider ignores search)

### Orientation Handling
- Application automatically detects viewport orientation (landscape or portrait)
- Orientation is passed to image provider APIs to request appropriately oriented images
- When orientation changes (e.g., window resize), metadata and cache are reset and new images are fetched
- Orientation handling is only active for Unsplash and Pexels providers (local provider ignores orientation)

### Attribution Display
- Attribution information should appear as an overlay in the bottom-left and bottom-right corner (alternated)
- Attribution should include photographer name (linked to their profile)
- Attribution should include location and creation date when available
- Attribution overlay should be shown after 5 seconds the image being displayed
- Attribution overlay should auto-hide after 5 seconds the attribution being displayed
- If the attribution overlay is visible when the image changes, it should remain visible, update its content immediately, and reset the auto-hide timer (5 seconds).
- Users can toggle attribution visibility manually
- Attribution should be hidden if no information is available (e.g., local provider)

### Offline Mode
- Application should detect when it cannot fetch new images (e.g., due to network issues)
- In offline mode, display an offline indicator (icon-only, subtle) in the top-right corner
- Offline mode should cycle through previously prefetched images (locally available in the browser cache)
- Navigation should work within the offline image set
- Offline detection occurs when image fetches fail (e.g., during prefetching or display loading), as this happens more frequently than metadata fetches. Metadata fetch failures may also trigger offline mode as a fallback.
- When in offline mode, the application should periodically check for connectivity (e.g., via a `/api/ping` endpoint) during image transitions. If connectivity is restored, the application should automatically exit offline mode and resume normal operation.

### Image Prefetching
- Application should prefetch upcoming images by fetching their URLs
- Browser HTTP caching will ensure instant loading when images are displayed
- On initial page load, fetch metadata for 30 images (indices 0-29) and prefetch images 0-2 (current + 2 ahead)
- As the user navigates forward, maintain at least 3 prefetched images ahead of the current display
- When nearing the end of the current metadata batch (e.g., displaying image 28), fetch the next batch of 30 metadata (indices 30-59) and continue prefetching
- Prefetching should not occur in offline mode; instead, cycle through previously prefetched images
- Prefetching works by programmatically creating `<img>` elements in the DOM with the image URLs, forcing the browser to download and cache them via HTTP. 
  - This differs from metadata fetching, which retrieves JSON data (e.g., 30 items at a time) without downloading the actual image files. 
  - Metadata is lightweight and fetched in batches to populate the image list, while images are prefetched individually for instant display.
  - The Metadata API is rate-limited, while the image endpoints are not. That's why we request a batch of images per API call (configured via `THEWALL_METADATA_COUNT`, default: 30). For instance, the Unsplash API limits requests to 50 calls per hour.

### Prefetching Optimization for Rapid Navigation
When users navigate rapidly through images (e.g., pressing next multiple times in quick succession), the application must avoid unnecessary network overhead:
- **Problem**: Without optimization, prefetching initiated at image N for image N+2 may complete after the user has already navigated to image N+5, resulting in wasteful downloads of already-passed images
- **Solution**: The application tracks all ongoing prefetch operations and validates at completion time whether the prefetched image is still ahead of the current display position
- **Implementation**: 
  - Only initiate prefetches for images strictly ahead of the current index (not at or behind)
  - When a prefetch completes, check if `imageIndex > currentIndex` before marking it as successfully prefetched
  - If the check fails, the prefetch is discarded (not added to the prefetched set), preventing it from consuming unnecessary memory and network resources
- **Benefit**: During rapid navigation, this ensures only relevant forward images are prefetched, significantly reducing bandwidth usage and improving performance

## User Interface

### Layout
- Single-page application with no visible navigation elements
- Full-screen image container
- Attribution overlay (bottom-left or bottom-right, alternated, initially hidden)
- Offline indicator (top-right, only visible in offline mode)
- Search dialog (top-center, initially hidden)

### Keyboard Controls / Remote Control (on TVs)
- `→` (right arrow): Next image
- `←` (left arrow): Previous image
- `↓` (down arrow): Toggle attribution visibility
- `↑` (up arrow): Open search dialog to change search query (disabled for local provider)

### Touch Controls
- Swipe left: Next image
- Swipe right: Previous image
- Single tap: Toggle attribution visibility
- Double tap: Toggle fullscreen mode
- Single tap on upper part of screen: Open search dialog (disabled for local provider)

### Visual Design
- Clean, minimal interface
- Attribution card with semi-transparent black background
- Subtle offline indicator (icon-only)
- The application needs to run on both totems and TVs, so the text must remain readable from a reasonable distance without being so large that it distracts from the images.
- Smooth transitions and animations (using CSS)

## Data Sources

The application supports multiple image providers that can be selected at configuration (startup) time. Only one provider can be chosen:

### Local Provider
- Loads images from a local server folder
- No photographer attribution or location information available
- Metadata is generated by scanning the `THEWALL_LOCAL_FOLDER` for image files (e.g., .jpg, .png), sorting them alphabetically, and assigning sequential IDs (0, 1, 2, ...). URLs point to `/api/images/{filename}`, color defaults to #000, and user/location fields are null.
- Useful for development, testing, or offline scenarios

### Unsplash Provider
- Fetches images from `/search/photos` endpoint of Unsplash API (https://unsplash.com/documentation#search-photos)
- Requires `UNSPLASH_ACCESS_KEY` environment variable
- Provides full photographer attribution, location, and creation date information
- Supports pagination (1-indexed `page` parameter), orientation preference and search queries
- May be passed a search query (e.g. "mountains", or "Norway")
- Pagination is calculated from the `start` parameter: `page = floor(start / count) + 1`

### Pexels Provider
- Fetches images from `/v1/search` endpoint of Pexels API (https://www.pexels.com/api/documentation/#photos-search)
- Requires `PEXELS_API_KEY` environment variable
- Provides photographer attribution and creation information
- Supports pagination (1-indexed `page` parameter), orientation preference and search queries
- May be passed a search query (e.g. "mountains", or "Norway")
- Pagination is calculated from the `start` parameter: `page = floor(start / count) + 1`

## API Endpoints

### Configuration Endpoint
- **Path**: `/api/config`
- **Method**: GET
- **Response**: JSON object containing application configuration
  - `provider`: Current image provider (local, unsplash, or pexels)
  - `imageInterval`: Auto-advance interval in seconds
  - `imageQuery`: Current search query for images
  - `metadataCount`: Number of metadata items retrieved per API call
  - `prefetchCount`: Number of images to prefetch ahead of the current image

### Image Metadata Endpoint
- **Path**: `/api/images/metadata`
- **Method**: GET
- **Query Parameters**:
  - `count` (optional): Number of images to return (default: 30)
  - `orientation` (optional): Image orientation preference (default: "landscape")
  - `query` (optional): Search query for filtering images (ignored for local provider)
- **Response**: JSON object containing an array of image metadata
- **Environment Variables**:
  - `UNSPLASH_ACCESS_KEY`: Required for Unsplash provider
  - `PEXELS_API_KEY`: Required for Pexels provider
- **Image Metadata Structure** (some fields may be null due absence by provider):
  - `id`: Unique identifier for the image
  - `url`: the image URL for the best quality version available ("raw" in Unsplash, "original" in "Pexels" )
  - `color`: Dominant color of the image (hex code, "color" field in Unsplash, "avg_color" in Pexels; use default #000 for local storage)
  - `user`: Photographer information (null for local provider)
    - `name`: Photographer name
    - `href`: Link to photographer's profile
  - `created_at`: ISO date string of image creation (null for local provider and Pexels)
  - `location.name`: Location name where image was taken (null for local provider and Pexels)

### Image Serving Endpoint (Local Provider Only)
- **Path**: `/api/images/{filename}`
- **Method**: GET
- **Description**: Serves individual image files from the local provider folder. Not required for Unsplash or Pexels providers, as images are sourced directly from their APIs.
- **Response**: The image file with appropriate MIME type.
- **Cache Headers**: Emulate Unsplash/Pexels behavior with `Cache-Control: public, max-age=31536000` (1-year cache lifetime), `Last-Modified` set to the file's last modified timestamp, and optionally `ETag` as an MD5 hash of the file content for conditional requests. Include `Content-Type`, `Content-Length`, and `Accept-Ranges: bytes`.
  - **ETag Benefit**: Even for static images, ETag enables efficient revalidation. If the browser sends an `If-None-Match` header with the cached ETag, the server can respond with `304 Not Modified` instead of re-sending the image, saving bandwidth and improving performance for large files.

## Performance Requirements

### Loading
- Subsequent images should load instantly due prefetch
- Application should handle network failures gracefully

### Responsiveness
- Interface should remain responsive during image loading
- Navigation should be immediate (no loading delays for cached images)

## Error Handling

### Network Failures
- Failed image loads should be logged but not crash the application
- Offline mode should activate automatically when network is unavailable
- Application should continue functioning with available images

### Missing Data
- Images without attribution should display without overlay (common for local provider)
- Missing location/date information should be omitted from attribution
- Provider-specific fields may be null depending on the selected provider

## Browser Compatibility
- Application targets modern web browsers only
- Uses standard Web APIs (Fetch API, Blob URLs, etc.)
- HTTP caching and prefetching rely on browser native capabilities

## Accessibility
- Images should have appropriate alt text
- Attribution overlay should be properly labeled for screen readers
- Keyboard navigation should be fully functional
- Color contrast should meet WCAG guidelines

## Development and Testing

### Provider Configuration
- Application configuration must be done exclusively over environment variables starting with `THEWALL_`
  - `THEWALL_PROVIDER`: one of `local`, `unsplash`, `pexels`
  - `THEWALL_LOCAL_FOLDER`: path of images when using `local` provider.
  - `THEWALL_IMAGE_INTERVAL`: interval, in seconds, to auto-advance the next image (default: 30 seconds)
  - `THEWALL_IMAGE_QUERY`: string to use in the `query` parameter of the external providers APIs (default: 'nature')
  - `THEWALL_METADATA_COUNT`: number of metadata items to retrieve per API call (default: 30)
  - `THEWALL_PREFETCH_COUNT`: number of images to prefetch ahead of the current image (default: 2)
- Environment variables required for external providers
  - `UNSPLASH_ACCESS_KEY` for Unsplash
  - `PEXELS_API_KEY` for Pexels
- Local provider works without external dependencies

### Debugging
- Debug logging must be complete, both in server as in client. 
- Default log level: INFO. Must register any non-pure (external I/O) action taken (read from disk, download a file, invoke an Web API request)
- log level: VERBOSE. Must also register any branch-decision taken (IF/ELSE statements taken) and changes in variables controlling the application state. A human or a LLM debugging the application must be able to correctly pinpoint errors just based on the informations from this log.

### Testing
- API endpoints should be testable independently
- Image loading, prefetching and caching should be verifiable
- Navigation and offline mode should be testable

## Appendix: Example Application Behavior

The following table illustrates the expected behavior of the application during a sample execution sequence. It shows how the displayed image index changes, offline status toggles, metadata cache expands, and prefetching progresses.

This sequence is built with the default configuration parameters: `THEWALL_METADATA_COUNT=30` (number of metadata items retrieved per API call) and `THEWALL_PREFETCH_COUNT=2` (number of images prefetched ahead of the current image).

| Action    | Display Image | Offline | Metadata Cache        | Prefetched Images |
|-----------|---------------|---------|-----------------------|-------------------|
| Page Load | 0             | false   | 0..29                 | 0..2              |
| NEXT      | 1             | false   | 0..29                 | 0..3              |
| NEXT      | 2             | false   | 0..29                 | 0..4              |
| NET FAIL  | 2             | true    | 0..29                 | 0..4              |
| NEXT      | 3             | true    | 0..29                 | 0..4              |
| NEXT      | 4             | true    | 0..29                 | 0..4              |
| NEXT      | 0             | true    | 0..29                 | 0..4              |
| NEXT      | 1             | true    | 0..29                 | 0..4              |
| NEXT      | 2             | true    | 0..29                 | 0..4              |
| NEXT      | 3             | true    | 0..29                 | 0..4              |
| NEXT      | 4             | true    | 0..29                 | 0..4              |
| ONLINE    | 4             | false   | 0..29                 | 0..6              |
| NEXT      | 5             | false   | 0..29                 | 0..7              |
| NEXT      | 6             | false   | 0..29                 | 0..8              |
| NEXT      | 7             | false   | 0..29                 | 0..9              |
| ...       | ...           | ...     | ...                   | ...               |
| NEXT      | 26            | false   | 0..29                 | 0..28             |
| NEXT      | 27            | false   | 0..29                 | 0..29             |
| NEXT      | 28            | false   | 0..59 (fetch 30 more) | 0..30             |
| NEXT      | 29            | false   | 0..59                 | 0..31             |
| NEXT      | 30            | false   | 0..59                 | 0..32             |
| NEXT      | 31            | false   | 0..59                 | 0..33             |
| NEXT      | 32            | false   | 0..59                 | 0..34             |

Notes:
 - Ranges like `0..4` represent the sequence of integers 0, 1, 2, 3, 4. 
 - In offline mode, navigation cycles through prefetched images. 
 - When online, prefetching expands dynamically, and metadata is fetched in batches of 30 when nearing the end.