// TheWall Client Application

// Last-resort values, used only if GET /api/config itself fails — in which case
// the server is unreachable and the app is heading for offline mode anyway.
// The real defaults live in lib/config.js and arrive over /api/config; this is
// not a second place to configure the app.
// How long the attribution card waits before appearing, and how long it stays.
const ATTRIBUTION_DELAY_MS = 5000;

const FALLBACK_CONFIG = {
  provider: 'unsplash',
  imageInterval: 30,
  imageQuery: 'nature',
  metadataCount: 30,
  prefetchCount: 2
};

class TheWall {
  constructor() {
    this.currentIndex = 0;
    this.metadata = [];
    this.prefetched = new Set();
    this.trackedDownloads = new Set(); // photo ids already reported to the provider
    this.prefetchingImages = new Map(); // Map of index -> Image object for ongoing prefetches
    this.offline = false;
    this.autoAdvanceInterval = null;
    this.attributionShowTimeout = null;
    this.attributionHideTimeout = null;
    this.provider = FALLBACK_CONFIG.provider;
    this.imageInterval = FALLBACK_CONFIG.imageInterval; // seconds
    this.imageQuery = FALLBACK_CONFIG.imageQuery;
    this.previousImageQuery = FALLBACK_CONFIG.imageQuery; // last query known to return results
    this.metadataCount = FALLBACK_CONFIG.metadataCount;
    this.prefetchCount = FALLBACK_CONFIG.prefetchCount;
    this.firstImageLoaded = false;
    this.loadingMore = false;
    this.metadataExhausted = false; // set once a pagination request returns nothing
    this.currentOrientation = this.getOrientation();

    this.imageElements = [
      document.getElementById('current-image'),
      document.getElementById('next-image')
    ];
    this.activeImageIndex = 0;

    this.attributionElement = document.getElementById('attribution');
    this.attributionPhotographer = document.getElementById('attribution-photographer');
    this.attributionDetails = document.getElementById('attribution-details');
    this.offlineIndicator = document.getElementById('offline-indicator');
    this.loadingScreen = document.getElementById('loading-screen');
    this.searchDialog = document.getElementById('search-dialog');
    this.searchInput = document.getElementById('search-input');
    this.warningMessage = document.getElementById('warning-message');

    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.lastTapTime = 0;
    this.clickTimeout = null;
    this.lastTouchTime = 0;

    this.init();
  }

  async init() {
    console.log('Initializing TheWall');
    await this.loadConfig();
    await this.loadMetadata();
    this.setupEventListeners();
    this.setupOrientationListener();
    this.setupFullScreen();
    this.startAutoAdvance();
    this.displayImage();
  }

  setupFullScreen() {
    // Toggle attribution on any click
    document.addEventListener('click', (e) => {
      // Ignore clicks that follow recent touch events to prevent double triggering on mobile
      if (Date.now() - this.lastTouchTime < 500) return;
      // Don't toggle if clicking on interactive elements like links or inputs
      if (e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.closest('#search-dialog')) {
        return;
      }
      if (this.clickTimeout) clearTimeout(this.clickTimeout);
      this.clickTimeout = setTimeout(() => {
        this.toggleAttribution();
      }, 300);
    });

    // Toggle fullscreen on double click
    document.addEventListener('dblclick', (e) => {
      // Don't toggle if clicking on interactive elements like links or inputs
      if (e.target.tagName === 'A' || e.target.tagName === 'INPUT' || e.target.closest('#search-dialog')) {
        return;
      }
      if (this.clickTimeout) clearTimeout(this.clickTimeout);
      this.toggleFullScreen();
    });
  }

  toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  getOrientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  // Device-pixel width of the viewport, clamped to the range the API accepts.
  // Remote providers use it to return a display-sized rendition rather than the
  // full-size original, which matters most on the low-powered TVs this targets:
  // decoding a 6000x4000 JPEG to draw it at 1080p is pure waste.
  requestedWidth() {
    const raw = Math.round(window.innerWidth * (window.devicePixelRatio || 1));
    return Math.min(3840, Math.max(640, raw));
  }

  metadataUrl({ count, start = 0 }) {
    const params = new URLSearchParams({
      count: String(count),
      orientation: this.currentOrientation,
      query: this.imageQuery,
      width: String(this.requestedWidth())
    });
    if (start > 0) params.set('start', String(start));
    return `/api/images/metadata?${params}`;
  }

  setupOrientationListener() {
    // Debounce: dragging a window edge fires many resize events, each of which
    // would otherwise hit the provider API and risk rate-limiting.
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const newOrientation = this.getOrientation();
        if (newOrientation !== this.currentOrientation && this.provider !== 'local') {
          console.log(`Orientation changed from ${this.currentOrientation} to ${newOrientation}`);
          this.currentOrientation = newOrientation;
          this.resetMetadataAndCache(true, false);
        }
      }, 200);
    });
  }

  async loadConfig() {
    console.log('Loading configuration');
    try {
      const response = await fetch('/api/config');
      if (!response.ok) throw new Error('Failed to load config');
      const config = await response.json();
      this.provider = config.provider;
      this.imageInterval = config.imageInterval;
      this.imageQuery = config.imageQuery;
      // The configured query is the baseline, so it is also what a failed user
      // search reverts to. Leaving this at the constructor value meant a search
      // that returned nothing fell back to a query the user never chose.
      this.previousImageQuery = config.imageQuery;
      this.metadataCount = config.metadataCount;
      this.prefetchCount = config.prefetchCount;
      console.log(`Config loaded: provider=${this.provider}, interval=${this.imageInterval}s, query=${this.imageQuery}, metadataCount=${this.metadataCount}, prefetchCount=${this.prefetchCount}`);
    } catch (err) {
      console.error(`Config load failed: ${err.message}`);
      // Use defaults already set in constructor
    }
  }

  // `allowFallback` guards the "no results -> retry with the previous query" path.
  // It must be false on the retry itself: `previousImageQuery` is not reassigned
  // here, so an unconditional retry re-issues the *same* request forever. A
  // provider outage used to hit exactly that path and produced ~200 requests/sec.
  async loadMetadata(count = null, isSearchChange = false, allowFallback = true) {
    if (count === null) count = this.metadataCount;
    console.log(`Loading metadata with orientation=${this.currentOrientation}, query=${this.imageQuery}`);
    try {
      const response = await fetch(this.metadataUrl({ count }));
      // A 503 means the provider is unavailable — fall through to the catch so we
      // go offline instead of mistaking it for an empty search result.
      if (!response.ok) throw new Error(`Failed to load metadata (HTTP ${response.status})`);
      const data = await response.json();
      this.metadata = data.images;
      console.log(`Loaded ${this.metadata.length} metadata items`);

      // If this is a search change and we have results, show loading screen
      if (isSearchChange && this.metadata.length > 0) {
        this.loadingScreen.style.display = 'flex';
        this.loadingScreen.classList.remove('fade-out');
        this.firstImageLoaded = false; // Reset to trigger loading screen hide
      }

      // Check if no images were found
      if (this.metadata.length === 0) {
        if (allowFallback && this.imageQuery !== this.previousImageQuery) {
          console.warn(`No images found for query "${this.imageQuery}", reverting to previous query "${this.previousImageQuery}"`);
          this.imageQuery = this.previousImageQuery;
          this.showWarningMessage();
          // Retry once only — never again from within the retry.
          await this.loadMetadata(count, false, false);
          return;
        }
        console.warn(`No images found for query "${this.imageQuery}" and no fallback available`);
        this.showWarningMessage();
        return;
      }

      this.setOffline(false);
    } catch (err) {
      console.error(`Metadata load failed: ${err.message}`);
      this.setOffline(true);
    }
  }

  setupEventListeners() {
    // Use capture phase to ensure global keyboard handling works regardless of focus
    document.addEventListener('keydown', (e) => {
      // Ignore keys when search dialog is open, except ESC and Enter
      if (!this.searchDialog.classList.contains('hidden')) {
        if (e.key === 'Escape') {
          this.closeSearchDialog();
        } else if (e.key === 'Enter') {
          this.confirmSearchDialog();
        }
        return;
      }

      switch (e.key) {
        case 'n':
        case 'N':
        case 'ArrowRight':
          this.nextImage();
          break;
        case 'p':
        case 'P':
        case 'ArrowLeft':
          this.prevImage();
          break;
        case 'ArrowUp':
          // UP: Toggle search dialog (for remote controls)
          if (this.provider !== 'local') {
            e.preventDefault();
            this.toggleSearchDialog();
          }
          break;
        case 'ArrowDown':
          // DOWN: Toggle attribution overlay (for remote controls)
          e.preventDefault();
          this.toggleAttribution();
          break;
        case 'a':
        case 'A':
          this.toggleAttribution();
          break;
        case ' ':
          e.preventDefault();
          this.toggleAttribution();
          break;
        case 'f':
        case 'F':
          this.toggleFullScreen();
          break;
        case '5':
          if (this.provider !== 'local') {
            e.preventDefault();
            this.openSearchDialog();
          }
          break;
        case 's':
        case 'S':
          if (this.provider !== 'local') {
            e.preventDefault(); // Prevent 's' from being typed into the input
            this.openSearchDialog();
          }
          break;
      }
    }, true); // Use capture phase for global handling

    // Wheel for navigation. `passive: false` is required: wheel listeners on
    // document-level nodes default to passive in every browser except Safari,
    // and preventDefault() inside a passive listener is ignored with a console
    // warning. It only appeared to work because body has overflow: hidden.
    document.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.deltaY > 0) this.nextImage();
      else this.prevImage();
    }, { passive: false });

    // Touch gestures with zone-based navigation
    document.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
      this.touchStartTime = Date.now();
    });

    document.addEventListener('touchend', (e) => {
      // Don't process touches on interactive elements (links, inputs, buttons)
      const target = e.target;
      if (target.tagName === 'A' || target.tagName === 'INPUT' || target.tagName === 'BUTTON' ||
        target.closest('a') || target.closest('#search-dialog') || target.closest('#attribution')) {
        return;
      }

      this.lastTouchTime = Date.now();
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;
      const deltaTime = Date.now() - this.touchStartTime;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (absDeltaX > 50 && absDeltaX > absDeltaY) {
        // Swipe
        if (deltaX > 0) this.prevImage();
        else this.nextImage();
      } else if (absDeltaX < 10 && absDeltaY < 10) {
        // Tap - check for zone-based navigation
        if (deltaTime < 500) {
          // Short tap
          const now = Date.now();
          if (now - this.lastTapTime < 300) {
            // Double tap - toggle fullscreen
            this.toggleFullScreen();
            this.lastTapTime = 0; // Reset to prevent triple-tap issues
          } else {
            // Single tap - check zones (20% edges)
            const leftZone = viewportWidth * 0.2;
            const rightZone = viewportWidth * 0.8;
            const topZone = viewportHeight * 0.2;
            const bottomZone = viewportHeight * 0.8;

            if (touchEndX < leftZone) {
              // Left 20% - previous image
              this.prevImage();
            } else if (touchEndX > rightZone) {
              // Right 20% - next image
              this.nextImage();
            } else if (touchEndY < topZone) {
              // Top 20% - toggle search dialog (only if dialog is not already open)
              if (this.provider !== 'local' && this.searchDialog.classList.contains('hidden')) {
                this.openSearchDialog();
              }
            } else if (touchEndY > bottomZone) {
              // Bottom 20% - toggle attribution
              this.toggleAttribution();
            } else {
              // Center area - toggle attribution (default behavior)
              this.toggleAttribution();
            }
            this.lastTapTime = now;
          }
        }
      }
    });
  }

  startAutoAdvance() {
    this.autoAdvanceInterval = setInterval(() => {
      this.nextImage();
    }, this.imageInterval * 1000);
  }

  stopAutoAdvance() {
    if (this.autoAdvanceInterval) {
      clearInterval(this.autoAdvanceInterval);
      this.autoAdvanceInterval = null;
    }
  }

  resetAutoAdvance() {
    this.stopAutoAdvance();
    this.startAutoAdvance();
  }

  displayImage() {
    if (this.metadata.length === 0) return;
    const image = this.metadata[this.currentIndex];
    console.log(`Displaying image ${this.currentIndex}: ${image.url}`);

    // Handle attribution visibility during transition
    const isAttributionVisible = !this.attributionElement.classList.contains('hidden');

    if (isAttributionVisible) {
      // Keep it visible, but stop it disappearing mid-transition.
      clearTimeout(this.attributionHideTimeout);
    } else {
      // Keep it hidden, and drop any pending show.
      this.attributionElement.classList.add('hidden');
      this.clearAttributionTimers();
    }

    const activeImg = this.imageElements[this.activeImageIndex];
    const nextIndex = (this.activeImageIndex + 1) % 2;
    const nextImg = this.imageElements[nextIndex];

    // Load new image into next element
    nextImg.src = image.url;
    // Describe the incoming image for screen readers; the outgoing one is
    // cleared on swap so the off-screen buffer is not announced.
    nextImg.alt = image.user?.name ? `Photo by ${image.user.name}` : 'Slideshow image';

    nextImg.onload = () => {
      console.log(`Image loaded successfully ${this.currentIndex}: ${image.url}`);

      this.dismissLoadingScreen();
      this.trackDownload(image);

      // Swap active classes for crossfade
      nextImg.classList.add('active');
      activeImg.classList.remove('active');
      activeImg.alt = '';
      this.activeImageIndex = nextIndex;

      // Schedule attribution to show after 5 seconds
      this.scheduleAttribution(image);
    };

    nextImg.onerror = () => {
      console.error(`Image load failed ${this.currentIndex}: ${image.url}`);
      // Dismiss the loading screen even on failure so the UI doesn't hang
      // waiting for a first image that will never arrive.
      this.dismissLoadingScreen();
      this.setOffline(true);
    };

    document.body.style.backgroundColor = image.color || '#000';

    // Check connectivity if offline
    if (this.offline) {
      fetch('/api/ping').then(response => {
        if (response.ok) {
          console.log('Server connectivity restored - exiting offline mode');
          this.setOffline(false);
        }
      }).catch(() => {
        // Still offline, do nothing
      });
    }

    this.prefetchImages();

    // Fetch more metadata if nearing the end (spec Appendix: fire at length - 2).
    // `metadataExhausted` stops this once a page comes back empty: the length
    // then stops growing, so the condition stays true and every advance -- and
    // every auto-advance tick -- fired another pointless request forever.
    if (!this.offline && !this.metadataExhausted && this.currentIndex >= this.metadata.length - 2) {
      this.loadMoreMetadata();
    }
  }

  // Unsplash's API guidelines require reporting a photo as used once it is
  // actually shown. Fired at most once per photo per session, and deliberately
  // best-effort: the slideshow must not care whether this succeeds.
  trackDownload(image) {
    if (!image.download_location || this.trackedDownloads.has(image.id)) return;
    this.trackedDownloads.add(image.id);
    fetch(`/api/images/track?location=${encodeURIComponent(image.download_location)}`)
      .catch(err => console.log(`Download tracking request failed: ${err.message}`));
  }

  createSafeLink(href, text) {
    const a = document.createElement('a');
    // Allow only http(s) URLs; everything else (including javascript:) is neutered.
    let safeHref = '#';
    if (typeof href === 'string') {
      try {
        const parsed = new URL(href, window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          safeHref = parsed.href;
        }
      } catch { /* invalid URL — keep placeholder */ }
    }
    a.href = safeHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = text;
    return a;
  }

  dismissLoadingScreen() {
    if (this.firstImageLoaded) return;
    this.firstImageLoaded = true;
    this.loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      this.loadingScreen.style.display = 'none';
    }, 800);
  }

  async loadMoreMetadata() {
    if (this.loadingMore) {
      console.log('loadMoreMetadata skipped: already in flight');
      return;
    }
    this.loadingMore = true;
    const nextStart = this.metadata.length;
    console.log(`Loading more metadata starting from ${nextStart} with orientation=${this.currentOrientation}, query=${this.imageQuery}`);
    try {
      const response = await fetch(this.metadataUrl({ count: this.metadataCount, start: nextStart }));
      if (!response.ok) throw new Error('Failed to load more metadata');
      const data = await response.json();
      if (data.images.length === 0) {
        this.metadataExhausted = true;
        console.log(`No further metadata beyond ${nextStart}; stopping pagination`);
        return;
      }
      this.metadata.push(...data.images);
      console.log(`Loaded additional ${data.images.length} metadata items, total: ${this.metadata.length}`);
    } catch (err) {
      console.error(`Load more metadata failed: ${err.message}`);
      this.setOffline(true);
    } finally {
      this.loadingMore = false;
    }
  }

  scheduleAttribution(image) {
    if (!image.user || !image.user.name) {
      return;
    }

    // Photographer link — provider strings are rendered via textContent and href
    // is validated against an http(s) allow-list to block `javascript:` payloads.
    this.attributionPhotographer.replaceChildren();
    this.attributionPhotographer.appendChild(
      this.createSafeLink(image.user.href, image.user.name)
    );

    if (this.provider === 'unsplash' || this.provider === 'pexels') {
      const providerSpan = document.createElement('span');
      providerSpan.className = 'provider-attribution';
      providerSpan.appendChild(document.createTextNode(' on '));
      const providerLink = this.provider === 'unsplash'
        ? this.createSafeLink('https://unsplash.com/?utm_source=TheWall&utm_medium=referral', 'Unsplash')
        : this.createSafeLink('https://www.pexels.com/?utm_source=TheWall&utm_medium=referral', 'Pexels');
      providerSpan.appendChild(providerLink);
      this.attributionPhotographer.appendChild(document.createTextNode(' '));
      this.attributionPhotographer.appendChild(providerSpan);
    }

    // Build details (location and date)
    this.attributionDetails.replaceChildren();
    const detailNodes = [];
    if (image.location && image.location.name) {
      const locSpan = document.createElement('span');
      locSpan.className = 'attribution-location';
      locSpan.textContent = image.location.name;
      detailNodes.push(locSpan);
    }
    if (image.created_at) {
      const date = new Date(image.created_at);
      const formattedDate = date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
      });
      detailNodes.push(document.createTextNode(formattedDate));
    }
    detailNodes.forEach((node, idx) => {
      if (idx > 0) this.attributionDetails.appendChild(document.createTextNode(' · '));
      this.attributionDetails.appendChild(node);
    });

    // Already visible (kept up from displayImage) — the text just changed under
    // it, so restart its dwell. Otherwise show it after the delay, then hide it.
    if (!this.attributionElement.classList.contains('hidden')) {
      this.restartHideTimer();
    } else {
      clearTimeout(this.attributionShowTimeout);
      this.attributionShowTimeout = setTimeout(() => {
        this.attributionElement.classList.remove('hidden');
        this.restartHideTimer();
      }, ATTRIBUTION_DELAY_MS);
    }
  }

  clearAttributionTimers() {
    clearTimeout(this.attributionShowTimeout);
    clearTimeout(this.attributionHideTimeout);
    this.attributionShowTimeout = null;
    this.attributionHideTimeout = null;
  }

  restartHideTimer() {
    clearTimeout(this.attributionHideTimeout);
    this.attributionHideTimeout = setTimeout(() => {
      this.attributionElement.classList.add('hidden');
    }, ATTRIBUTION_DELAY_MS);
  }

  toggleAttribution() {
    this.attributionElement.classList.toggle('hidden');
    if (!this.attributionElement.classList.contains('hidden')) {
      this.restartHideTimer();
    }
  }

  updateOfflineIndicator() {
    if (this.offline) {
      console.log('Entering offline mode');
      this.offlineIndicator.classList.remove('hidden');
    } else {
      console.log('Exiting offline mode');
      this.offlineIndicator.classList.add('hidden');
    }
  }

  setOffline(isOffline) {
    if (this.offline === isOffline) return;

    this.offline = isOffline;
    console.log(`Offline mode set to: ${this.offline}`);

    if (this.offline) {
      // When going offline, cycle through currently prefetched images
      this.offlineImages = Array.from(this.prefetched).sort((a, b) => a - b);
      console.log(`Offline mode activated - ${this.offlineImages.length} prefetched images available: [${this.offlineImages.join(', ')}]`);
      if (this.offlineImages.length === 0) {
        // No prefetched images — keep the current index frozen and let nav skip.
        this.currentOfflineIndex = -1;
      } else {
        this.currentOfflineIndex = this.offlineImages.indexOf(this.currentIndex);
        if (this.currentOfflineIndex === -1) {
          this.currentOfflineIndex = 0;
          this.currentIndex = this.offlineImages[0];
        }
      }
    } else {
      console.log('Offline mode deactivated');
      this.offlineImages = null;
      this.currentOfflineIndex = null;
    }
    this.updateOfflineIndicator();
  }

  toggleSearchDialog() {
    if (this.searchDialog.classList.contains('hidden')) {
      this.openSearchDialog();
    } else {
      this.closeSearchDialog();
    }
  }

  openSearchDialog() {
    console.log('Opening search dialog');
    this.searchInput.value = this.imageQuery;
    this.searchDialog.classList.remove('hidden');

    // Close the dialog when the input loses focus. `once: true` is what keeps
    // these from stacking: the handler previously removed itself only from
    // inside itself, so closing via Escape left it attached and every reopen
    // added another.
    this.searchInput.addEventListener('blur', () => {
      // Small delay to allow Enter key to be processed first
      setTimeout(() => {
        if (!this.searchDialog.classList.contains('hidden')) {
          this.closeSearchDialog();
        }
      }, 150);
    }, { once: true });

    setTimeout(() => {
      this.searchInput.focus();
      this.searchInput.select();
    }, 100);
  }

  closeSearchDialog() {
    console.log('Closing search dialog (cancelled)');
    this.searchDialog.classList.add('hidden');
  }

  showWarningMessage() {
    console.log('Showing warning message');
    this.warningMessage.classList.remove('hidden');
    setTimeout(() => {
      this.warningMessage.classList.add('hidden');
    }, 5000);
  }

  confirmSearchDialog() {
    const newQuery = this.searchInput.value.trim();
    if (newQuery && newQuery !== this.imageQuery) {
      console.log(`Search query changed from "${this.imageQuery}" to "${newQuery}"`);
      this.previousImageQuery = this.imageQuery; // Store previous query for fallback
      this.imageQuery = newQuery;
      this.resetMetadataAndCache(false, true);
    }
    this.closeSearchDialog();
  }

  async resetMetadataAndCache(showLoading = true, isSearchChange = false) {
    console.log('Resetting metadata and cache');

    if (showLoading) {
      // Show loading screen
      this.loadingScreen.style.display = 'flex';
      this.loadingScreen.classList.remove('fade-out');
      this.firstImageLoaded = false; // Reset to trigger loading screen hide
    }

    // Stop auto-advance during reset
    this.stopAutoAdvance();

    // Clear existing data
    this.metadata = [];
    this.prefetched.clear();
    this.prefetchingImages.clear();
    this.currentIndex = 0;
    this.metadataExhausted = false;
    this.offlineImages = null;
    this.currentOfflineIndex = null;

    // Reload metadata
    await this.loadMetadata(this.metadataCount, isSearchChange);

    // Restart auto-advance and display first image
    this.startAutoAdvance();
    this.displayImage();
  }

  // `step` is +1 or -1. Offline navigation walks the prefetched pool instead of
  // the full metadata list, since those are the only images actually available.
  advance(step) {
    if (this.metadata.length === 0) return;
    const label = step > 0 ? 'Next image' : 'Previous image';

    if (this.offline && this.offlineImages) {
      if (this.offlineImages.length === 0) {
        console.log(`${label} (offline): no prefetched images, navigation skipped`);
        return;
      }
      const total = this.offlineImages.length;
      this.currentOfflineIndex = (this.currentOfflineIndex + step + total) % total;
      this.currentIndex = this.offlineImages[this.currentOfflineIndex];
      console.log(`${label} (offline): ${this.currentIndex}`);
    } else {
      const total = this.metadata.length;
      this.currentIndex = (this.currentIndex + step + total) % total;
      console.log(`${label}: ${this.currentIndex}`);
    }

    this.displayImage();
    this.resetAutoAdvance();
  }

  nextImage() {
    this.advance(1);
  }

  prevImage() {
    this.advance(-1);
  }

  // How far `index` sits ahead of the current image in display order, which
  // wraps. A plain `index > currentIndex` comparison silently broke at the end
  // of a finite list: at the last image the next index wraps to 0, which is not
  // greater than currentIndex, so the image was never recorded as prefetched
  // and never joined the offline pool.
  distanceAhead(index) {
    const total = this.metadata.length;
    if (total === 0) return 0;
    return (index - this.currentIndex + total) % total;
  }

  prefetchImages() {
    if (this.offline) return;

    // Cancel prefetches that are no longer within the upcoming window, i.e.
    // ones the user has navigated past.
    for (const [index, imgObj] of this.prefetchingImages.entries()) {
      if (this.distanceAhead(index) > this.prefetchCount) {
        console.log(`Cancelling stale prefetch for image ${index} (current: ${this.currentIndex})`);
        imgObj.cancelled = true; // Mark as cancelled
        imgObj.img.src = ''; // Cancel the ongoing request
        this.prefetchingImages.delete(index);
      }
    }

    // Only prefetch images AHEAD of current position
    const prefetchCount = this.prefetchCount; // N images ahead (not including current)
    for (let i = 1; i <= prefetchCount; i++) { // Start at 1 to skip current image
      const index = (this.currentIndex + i) % this.metadata.length;
      
      // Skip if already prefetched or currently prefetching
      if (this.prefetched.has(index) || this.prefetchingImages.has(index)) continue;
      
      const image = this.metadata[index];
      const img = new Image();
      const imgObj = { img, cancelled: false };
      
      img.onload = () => {
        // Keep it only if it was not cancelled and is still strictly upcoming.
        // Distance 0 means the user advanced onto it while it was in flight; it
        // is the displayed image, not a prefetch. `distanceAhead` is wrap-aware,
        // which `index > currentIndex` was not -- that comparison dropped every
        // prefetch once the index wrapped at the end of a finite list.
        const ahead = this.distanceAhead(index);
        if (!imgObj.cancelled && ahead >= 1 && ahead <= this.prefetchCount) {
          console.log(`Image prefetched successfully ${index}: ${image.url}`);
          this.prefetched.add(index);
        } else if (imgObj.cancelled) {
          console.log(`Image prefetch completed but was cancelled ${index}: ${image.url}`);
        } else {
          console.log(`Image prefetch completed but already passed ${index}: ${image.url} (current: ${this.currentIndex})`);
        }
        this.prefetchingImages.delete(index);
      };
      
      img.onerror = () => {
        console.warn(`Image prefetch failed ${index}: ${image.url}`);
        this.prefetchingImages.delete(index);
      };
      
      this.prefetchingImages.set(index, imgObj);
      console.log(`Prefetching image ${index}: ${image.url}`);
      img.src = image.url; // Start the prefetch
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.theWall = new TheWall();
});