self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open('veyro-v1').then(cache => {
            return cache.addAll([
                '/',
                '/index.html'
                // Add more assets as needed
            ]);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames
                .filter(cacheName => cacheName !== 'veyro-v1')
                .map(cacheName => caches.delete(cacheName))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});
