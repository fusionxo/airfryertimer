/**
 * sw.js
 * Progressive Web App (PWA) Service Worker
 * Provides full offline cooking timer capabilities by caching local assets.
 */

const CACHE_NAME = 'airfryer-timer-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './audio.js',
  './manifest.json',
  './icon.svg'
];

// Install Event - Cache all structural assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Caching static assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches if versions change
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('SW: Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch Event - Serve assets from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local scope schemas
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached asset immediately
        return cachedResponse;
      }
      
      // Fallback to network fetch
      return fetch(event.request).then((networkResponse) => {
        // Cache the dynamically fetched resource if valid
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline backup fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
