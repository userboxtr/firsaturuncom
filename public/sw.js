// FIRSAT ÜRÜN - Service Worker
const CACHE_NAME = 'firsat-urun-v1';
const ASSETS = ['/', '/css/main.css', '/css/responsive.css', '/js/api.js', '/js/auth.js', '/js/modal.js', '/js/deals.js', '/js/app.js'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.url.includes('/api/')) return; // API isteklerini cache'leme
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
