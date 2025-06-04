const CACHE_NAME = 'xining-cache-v1';
const urlsToCache = [
    '/', // Home page
    '/local', // Local reader page
    '/favorites', // Favorites page
    '/static/css/style.css',
    '/static/font/font.ttf', // Main font if critical
    // JS files - these are managers and theme, reader.js is page-specific
    '/static/js/theme.js',
    '/static/js/favorites.js',
    '/static/js/recent_reads.js',
    '/static/js/annotations.js',
    '/static/js/pwa_init.js', // The script that registers this SW
    // Placeholder for icons (actual paths needed)
    // '/static/images/icon-192x192.png',
    // '/static/images/icon-512x512.png',
    // Note: reader.js and comic_reader.js are not included here as they are specific to certain pages
    // and might be large. Caching them aggressively might not be ideal unless they are very stable.
    // Consider caching them on first use via the fetch event if needed.
];

// Install event: open cache and add core assets
self.addEventListener('install', function(event) {
    console.log('[ServiceWorker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[ServiceWorker] Caching app shell');
                return cache.addAll(urlsToCache.map(url => new Request(url, {cache: 'reload'}))); // Force reload from network for app shell
            })
            .then(() => {
                console.log('[ServiceWorker] App shell cached successfully');
                return self.skipWaiting(); // Activate worker immediately
            })
            .catch(error => {
                console.error('[ServiceWorker] Failed to cache app shell:', error);
            })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', function(event) {
    console.log('[ServiceWorker] Activate');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[ServiceWorker] Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[ServiceWorker] Claiming clients');
            return self.clients.claim(); // Take control of open clients
        })
    );
});

// Fetch event: Cache, falling back to network strategy
self.addEventListener('fetch', function(event) {
    // We only want to cache GET requests.
    if (event.request.method !== 'GET') {
        return;
    }

    // For HTML pages, try network first to ensure freshness, then cache, then fallback to cache.
    // For other assets (CSS, JS, images), cache first is usually fine.
    if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(event.request)
                .then(function(response) {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        // If network fails, try to get from cache
                        return caches.match(event.request).then(cachedResponse => {
                            return cachedResponse || fetch(event.request); // Fallback to network again if not in cache (e.g. offline page)
                        });
                    }

                    // IMPORTANT: Clone the response. A response is a stream
                    // and because we want the browser to consume the response
                    // as well as the cache consuming the response, we need
                    // to clone it so we have two streams.
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(function(cache) {
                            console.log('[ServiceWorker] Caching new page:', event.request.url);
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                })
                .catch(function() {
                    // Network request failed, try to get it from the cache.
                    return caches.match(event.request);
                })
        );
    } else {
        // For non-HTML assets (CSS, JS, images): Cache first, then network
        event.respondWith(
            caches.match(event.request)
                .then(function(cachedResponse) {
                    // Cache hit - return response
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // Not in cache - fetch from network
                    return fetch(event.request).then(
                        function(response) {
                            // Check if we received a valid response
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response; // Return original error response
                            }

                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(function(cache) {
                                    console.log('[ServiceWorker] Caching new asset:', event.request.url);
                                    cache.put(event.request, responseToCache);
                                });
                            return response;
                        }
                    );
                })
        );
    }
});
