/**
 * ESA Service Worker — Offline Support
 *
 * Cache strategy:
 *   - Static assets: cache-first (CSS, JS, images, fonts)
 *   - API calls: network-first with cache fallback
 *   - Calculator results: cached in IndexedDB for offline use
 *   - Offline fallback page for navigation requests
 *
 * PART 1: Cache configuration
 * PART 2: Install event
 * PART 3: Activate event
 * PART 4: Fetch strategies
 * PART 5: IndexedDB helpers for calculator cache
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Cache Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'esa-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/calc',
  '/mobile',
  '/projects',
  '/manifest.json',
  '/offline.html',
];

const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff', '.woff2', '.ttf', '.png', '.jpg',
  '.jpeg', '.svg', '.ico', '.webp',
];

const API_PATTERNS = [
  '/api/calculate',
  '/api/search',
  '/api/autocomplete',
];

const IDB_NAME = 'esa-offline';
const IDB_STORE = 'calc-results';
const IDB_VERSION = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Install Event
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Non-critical: some pages may not exist yet during development
        console.warn('[SW] Failed to cache some static assets:', err);
      });
    })
  );
  // Activate immediately without waiting for existing clients to close
  self.skipWaiting();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Activate Event
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Claim all clients so the SW is active immediately
  self.clients.claim();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4 — Fetch Strategies
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // API requests: network-first
  if (API_PATTERNS.some((pattern) => url.pathname.startsWith(pattern))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests: network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(request));
});

/**
 * Cache-first strategy for static assets.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Network-first strategy for API calls.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());

      // Also cache calculator results in IndexedDB
      if (request.url.includes('/api/calculate')) {
        cacheCalcResult(request.url, response.clone());
      }
    }
    return response;
  } catch {
    // Try cache fallback
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try IndexedDB for calc results
    if (request.url.includes('/api/calculate')) {
      const idbResult = await getCalcResult(request.url);
      if (idbResult) {
        return new Response(JSON.stringify(idbResult), {
          headers: {
            'Content-Type': 'application/json',
            'X-ESA-Source': 'offline-cache',
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ error: 'Offline', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Navigation handler with offline fallback.
 */
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    // Try cached version of the page
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fall back to offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    return new Response(
      '<html><body><h1>ESA Offline</h1><p>인터넷 연결을 확인해 주세요.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/**
 * Check if a URL path is a static asset.
 */
function isStaticAsset(pathname) {
  return STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5 — IndexedDB Helpers for Calculator Cache
// ═══════════════════════════════════════════════════════════════════════════════

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'url' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheCalcResult(url, response) {
  try {
    const data = await response.json();
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put({
      url,
      data,
      cachedAt: new Date().toISOString(),
    });
  } catch {
    // Non-critical: silently ignore IDB write errors
  }
}

async function getCalcResult(url) {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const result = req.result;
        if (result) {
          resolve({ ...result.data, _offlineCachedAt: result.cachedAt });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Push notification handler (stub for future use)
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    event.waitUntil(
      self.registration.showNotification(payload.title ?? 'ESA', {
        body: payload.body ?? '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: payload.data,
      })
    );
  } catch {
    // Ignore malformed push payloads
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
