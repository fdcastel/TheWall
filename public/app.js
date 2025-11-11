// TheWall Client Application

class TheWall {
  constructor() {
    this.currentIndex = 0;
    this.metadata = [];
    this.prefetched = new Set();
    this.offline = false;
    this.manualOffline = false;
    this.autoAdvanceInterval = null;
    this.attributionTimeout = null;
    this.imageInterval = 30; // seconds

    this.imageElement = document.getElementById('current-image');
    this.attributionElement = document.getElementById('attribution');
    this.attributionContent = document.getElementById('attribution-content');
    this.offlineIndicator = document.getElementById('offline-indicator');

    this.init();
  }

  log(level, message) {
    console.log(`[${level}] ${new Date().toISOString()}: ${message}`);
  }

  async init() {
    this.log('INFO', 'Initializing TheWall');
    await this.loadMetadata();
    this.setupEventListeners();
    this.startAutoAdvance();
    this.displayImage();
  }

  async loadMetadata(count = 30) {
    this.log('INFO', 'Loading metadata');
    try {
      const response = await fetch(`/api/images/metadata?count=${count}`);
      if (!response.ok) throw new Error('Failed to load metadata');
      const data = await response.json();
      this.metadata = data.images;
      this.log('VERBOSE', `Loaded ${this.metadata.length} metadata items`);
      this.offline = false;
      this.updateOfflineIndicator();
    } catch (err) {
      this.log('INFO', `Metadata load failed: ${err.message}`);
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
    this.log('VERBOSE', `Displaying image ${this.currentIndex}: ${image.url}`);
    this.imageElement.src = image.url;
    this.imageElement.onload = () => {
      // Image loaded successfully
    };
    this.imageElement.onerror = () => {
      this.offline = true;
      this.updateOfflineIndicator();
    };
    document.body.style.backgroundColor = image.color || '#000';
    // Check connectivity
    fetch('/api/ping').then(() => {
      // If was offline and not manual, set back online
      if (this.offline && !this.manualOffline) {
        this.offline = false;
        this.updateOfflineIndicator();
        this.offlineImages = null;
        this.currentOfflineIndex = null;
      }
    }).catch(() => {
      if (!this.offline) {
        this.toggleOffline();
        this.manualOffline = false;
      }
    });
    this.prefetchImages();
    this.showAttribution(image);

    // Fetch more metadata if nearing the end
    if (!this.offline && this.currentIndex >= this.metadata.length - 3 && this.metadata.length < 47) { // assuming max 47
      this.loadMoreMetadata();
    }
  }

  async loadMoreMetadata() {
    const nextStart = this.metadata.length;
    this.log('INFO', `Loading more metadata starting from ${nextStart}`);
    try {
      const response = await fetch(`/api/images/metadata?count=30&start=${nextStart}`);
      if (!response.ok) throw new Error('Failed to load more metadata');
      const data = await response.json();
      this.metadata.push(...data.images);
      this.log('VERBOSE', `Loaded additional ${data.images.length} metadata items, total: ${this.metadata.length}`);
    } catch (err) {
      this.log('INFO', `Load more metadata failed: ${err.message}`);
      this.offline = true;
      this.updateOfflineIndicator();
    }
  }

  showAttribution(image) {
    if (!image.user || !image.user.name) {
      this.attributionElement.classList.add('hidden');
      return;
    }
    let content = `Photo by <a href="${image.user.href}" target="_blank">${image.user.name}</a>`;
    if (image.location && image.location.name) {
      content += ` in ${image.location.name}`;
    }
    if (image.created_at) {
      content += ` on ${new Date(image.created_at).toLocaleDateString()}`;
    }
    this.attributionContent.innerHTML = content;
    this.attributionElement.classList.remove('hidden');
    if (this.attributionTimeout) clearTimeout(this.attributionTimeout);
    this.attributionTimeout = setTimeout(() => {
      this.attributionElement.classList.add('hidden');
    }, 4000);
  }

  toggleAttribution() {
    this.attributionElement.classList.toggle('hidden');
    if (!this.attributionElement.classList.contains('hidden')) {
      if (this.attributionTimeout) clearTimeout(this.attributionTimeout);
      this.attributionTimeout = setTimeout(() => {
        this.attributionElement.classList.add('hidden');
      }, 4000);
    }
  }

  updateOfflineIndicator() {
    if (this.offline) {
      this.offlineIndicator.classList.remove('hidden');
    } else {
      this.offlineIndicator.classList.add('hidden');
    }
  }

  toggleOffline() {
    this.offline = !this.offline;
    this.manualOffline = true;
    this.log('VERBOSE', `Offline mode: ${this.offline}`);
    if (this.offline) {
      // When going offline, cycle through currently prefetched images
      this.offlineImages = Array.from(this.prefetched).sort((a, b) => a - b);
      this.currentOfflineIndex = this.offlineImages.indexOf(this.currentIndex);
      if (this.currentOfflineIndex === -1) {
        this.currentOfflineIndex = 0;
        this.currentIndex = this.offlineImages[0] || 0;
      }
    } else {
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
      this.log('VERBOSE', `Next offline image: ${this.currentIndex}`);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.metadata.length;
      this.log('VERBOSE', `Next image: ${this.currentIndex}`);
    }
    this.displayImage();
    this.resetAutoAdvance();
  }

  prevImage() {
    if (this.metadata.length === 0) return;
    if (this.offline && this.offlineImages) {
      this.currentOfflineIndex = (this.currentOfflineIndex - 1 + this.offlineImages.length) % this.offlineImages.length;
      this.currentIndex = this.offlineImages[this.currentOfflineIndex];
      this.log('VERBOSE', `Previous offline image: ${this.currentIndex}`);
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.metadata.length) % this.metadata.length;
      this.log('VERBOSE', `Previous image: ${this.currentIndex}`);
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
      img.src = image.url;
      this.prefetched.add(index);
      this.log('VERBOSE', `Prefetched image ${index}`);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.theWall = new TheWall();
});