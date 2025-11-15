// TheWall Client Application

class TheWall {
  constructor() {
    this.currentIndex = 0;
    this.metadata = [];
    this.prefetched = new Set();
    this.offline = false;
    this.manualOffline = false;
    this.autoAdvanceInterval = null;
    this.attributionShowTimeout = null;
    this.attributionHideTimeout = null;
    this.imageInterval = 30; // seconds (default, will be overridden by config)
    this.provider = 'local'; // default, will be overridden by config
    this.imageQuery = 'nature'; // default, will be overridden by config
    this.firstImageLoaded = false;

    this.imageElement = document.getElementById('current-image');
    this.attributionElement = document.getElementById('attribution');
    this.attributionPhotographer = document.getElementById('attribution-photographer');
    this.attributionDetails = document.getElementById('attribution-details');
    this.offlineIndicator = document.getElementById('offline-indicator');
    this.loadingScreen = document.getElementById('loading-screen');

    this.init();
  }

  async init() {
    console.log('Initializing TheWall');
    await this.loadConfig();
    await this.loadMetadata();
    this.setupEventListeners();
    this.startAutoAdvance();
    this.displayImage();
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
      console.log(`Config loaded: provider=${this.provider}, interval=${this.imageInterval}s, query=${this.imageQuery}`);
    } catch (err) {
      console.error(`Config load failed: ${err.message}`);
      // Use defaults already set in constructor
    }
  }

  async loadMetadata(count = 30) {
    console.log('Loading metadata');
    try {
      const response = await fetch(`/api/images/metadata?count=${count}`);
      if (!response.ok) throw new Error('Failed to load metadata');
      const data = await response.json();
      this.metadata = data.images;
      console.log(`Loaded ${this.metadata.length} metadata items`);
      this.offline = false;
      this.updateOfflineIndicator();
    } catch (err) {
      console.error(`Metadata load failed: ${err.message}`);
      this.offline = true;
      this.updateOfflineIndicator();
    }
  }

  setupEventListeners() {
    document.addEventListener('keydown', (e) => {
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
        case 'a':
        case 'A':
          this.toggleAttribution();
          break;
        case 'o':
        case 'O':
          this.toggleOffline();
          break;
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
    
    // Hide attribution immediately when changing images
    this.attributionElement.classList.add('hidden');
    
    // Clear any pending attribution timeouts
    if (this.attributionShowTimeout) clearTimeout(this.attributionShowTimeout);
    if (this.attributionHideTimeout) clearTimeout(this.attributionHideTimeout);
    
    // Fade out current image
    this.imageElement.classList.add('fade-out');
    
    // Wait for fade out, then change image
    setTimeout(() => {
      this.imageElement.src = image.url;
      this.imageElement.onload = () => {
        console.log(`Image loaded successfully ${this.currentIndex}: ${image.url}`);
        
        // Hide loading screen on first image load
        if (!this.firstImageLoaded) {
          this.firstImageLoaded = true;
          this.loadingScreen.classList.add('fade-out');
          setTimeout(() => {
            this.loadingScreen.style.display = 'none';
          }, 800); // Match the CSS transition duration
        }
        
        // Fade in new image
        this.imageElement.classList.remove('fade-out');
        // Schedule attribution to show after 5 seconds
        this.scheduleAttribution(image);
      };
      this.imageElement.onerror = () => {
        console.error(`Image load failed ${this.currentIndex}: ${image.url}`);
        this.offline = true;
        this.updateOfflineIndicator();
        this.imageElement.classList.remove('fade-out');
      };
    }, 400); // A bit sooner than half of the 1s transition
    
    document.body.style.backgroundColor = image.color || '#000';
    
    // Check connectivity
    fetch('/api/ping').then(() => {
      // If was offline and not manual, set back online
      if (this.offline && !this.manualOffline) {
        console.log('Server connectivity restored - exiting offline mode');
        this.offline = false;
        this.updateOfflineIndicator();
        this.offlineImages = null;
        this.currentOfflineIndex = null;
      }
    }).catch(() => {
      if (!this.offline) {
        console.warn('Server connectivity lost - entering offline mode');
        this.toggleOffline();
        this.manualOffline = false;
      }
    });
    this.prefetchImages();

    // Fetch more metadata if nearing the end
    if (!this.offline && this.currentIndex >= this.metadata.length - 3 && this.metadata.length < 47) { // assuming max 47
      this.loadMoreMetadata();
    }
  }

  async loadMoreMetadata() {
    const nextStart = this.metadata.length;
    console.log(`Loading more metadata starting from ${nextStart}`);
    try {
      const response = await fetch(`/api/images/metadata?count=30&start=${nextStart}`);
      if (!response.ok) throw new Error('Failed to load more metadata');
      const data = await response.json();
      this.metadata.push(...data.images);
      console.log(`Loaded additional ${data.images.length} metadata items, total: ${this.metadata.length}`);
    } catch (err) {
      console.error(`Load more metadata failed: ${err.message}`);
      this.offline = true;
      this.updateOfflineIndicator();
    }
  }

  scheduleAttribution(image) {
    if (!image.user || !image.user.name) {
      return;
    }
    
    // Build photographer name with link and provider attribution
    let photographerHTML = `<a href="${image.user.href}" target="_blank" rel="noopener noreferrer">${image.user.name}</a>`;
    
    // Add provider attribution for Unsplash and Pexels
    if (this.provider === 'unsplash') {
      photographerHTML += ` <span class="provider-attribution">on <a href="https://unsplash.com/?utm_source=TheWall&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a></span>`;
    } else if (this.provider === 'pexels') {
      photographerHTML += ` <span class="provider-attribution">on <a href="https://www.pexels.com/?utm_source=TheWall&utm_medium=referral" target="_blank" rel="noopener noreferrer">Pexels</a></span>`;
    }
    
    this.attributionPhotographer.innerHTML = photographerHTML;
    
    // Build details (location and date)
    let details = [];
    if (image.location && image.location.name) {
      details.push(`<span class="attribution-location">${image.location.name}</span>`);
    }
    if (image.created_at) {
      const date = new Date(image.created_at);
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
      details.push(formattedDate);
    }
    this.attributionDetails.innerHTML = details.join(' · ');
    
    // Show attribution after 5 seconds
    this.attributionShowTimeout = setTimeout(() => {
      this.attributionElement.classList.remove('hidden');
      
      // Hide attribution 5 seconds after showing
      this.attributionHideTimeout = setTimeout(() => {
        this.attributionElement.classList.add('hidden');
      }, 5000);
    }, 5000);
  }

  showAttribution(image) {
    if (!image.user || !image.user.name) {
      this.attributionElement.classList.add('hidden');
      return;
    }
    
    // Build photographer name with link and provider attribution
    let photographerHTML = `<a href="${image.user.href}" target="_blank" rel="noopener noreferrer">${image.user.name}</a>`;
    
    // Add provider attribution for Unsplash and Pexels
    if (this.provider === 'unsplash') {
      photographerHTML += ` <span class="provider-attribution">on <a href="https://unsplash.com/?utm_source=TheWall&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a></span>`;
    } else if (this.provider === 'pexels') {
      photographerHTML += ` <span class="provider-attribution">on <a href="https://www.pexels.com/?utm_source=TheWall&utm_medium=referral" target="_blank" rel="noopener noreferrer">Pexels</a></span>`;
    }
    
    this.attributionPhotographer.innerHTML = photographerHTML;
    
    // Build details (location and date)
    let details = [];
    if (image.location && image.location.name) {
      details.push(`<span class="attribution-location">${image.location.name}</span>`);
    }
    if (image.created_at) {
      const date = new Date(image.created_at);
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      });
      details.push(formattedDate);
    }
    this.attributionDetails.innerHTML = details.join(' · ');
    
    // Show attribution with animation
    this.attributionElement.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    if (this.attributionHideTimeout) clearTimeout(this.attributionHideTimeout);
    this.attributionHideTimeout = setTimeout(() => {
      this.attributionElement.classList.add('hidden');
    }, 5000);
  }

  toggleAttribution() {
    this.attributionElement.classList.toggle('hidden');
    if (!this.attributionElement.classList.contains('hidden')) {
      if (this.attributionHideTimeout) clearTimeout(this.attributionHideTimeout);
      this.attributionHideTimeout = setTimeout(() => {
        this.attributionElement.classList.add('hidden');
      }, 5000);
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

  toggleOffline() {
    this.offline = !this.offline;
    this.manualOffline = true;
    console.log(`Manual offline toggle - offline mode: ${this.offline}`);
    if (this.offline) {
      // When going offline, cycle through currently prefetched images
      this.offlineImages = Array.from(this.prefetched).sort((a, b) => a - b);
      console.log(`Offline mode activated - ${this.offlineImages.length} prefetched images available: [${this.offlineImages.join(', ')}]`);
      this.currentOfflineIndex = this.offlineImages.indexOf(this.currentIndex);
      if (this.currentOfflineIndex === -1) {
        this.currentOfflineIndex = 0;
        this.currentIndex = this.offlineImages[0] || 0;
      }
    } else {
      console.log('Offline mode deactivated');
      this.offlineImages = null;
      this.currentOfflineIndex = null;
    }
    this.updateOfflineIndicator();
  }

  nextImage() {
    if (this.metadata.length === 0) return;
    if (this.offline && this.offlineImages) {
      this.currentOfflineIndex = (this.currentOfflineIndex + 1) % this.offlineImages.length;
      this.currentIndex = this.offlineImages[this.currentOfflineIndex];
      console.log(`Next image (offline): ${this.currentIndex}`);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.metadata.length;
      console.log(`Next image: ${this.currentIndex}`);
    }
    this.displayImage();
    this.resetAutoAdvance();
  }

  prevImage() {
    if (this.metadata.length === 0) return;
    if (this.offline && this.offlineImages) {
      this.currentOfflineIndex = (this.currentOfflineIndex - 1 + this.offlineImages.length) % this.offlineImages.length;
      this.currentIndex = this.offlineImages[this.currentOfflineIndex];
      console.log(`Previous image (offline): ${this.currentIndex}`);
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.metadata.length) % this.metadata.length;
      console.log(`Previous image: ${this.currentIndex}`);
    }
    this.displayImage();
    this.resetAutoAdvance();
  }

  prefetchImages() {
    if (this.offline) return;
    const prefetchCount = 3;
    for (let i = 0; i < prefetchCount; i++) {
      const index = (this.currentIndex + i) % this.metadata.length;
      if (this.prefetched.has(index)) continue;
      const image = this.metadata[index];
      const img = new Image();
      img.onload = () => {
        console.log(`Image prefetched successfully ${index}: ${image.url}`);
      };
      img.onerror = () => {
        console.warn(`Image prefetch failed ${index}: ${image.url}`);
      };
      img.src = image.url;
      this.prefetched.add(index);
      console.log(`Prefetching image ${index}: ${image.url}`);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.theWall = new TheWall();
});