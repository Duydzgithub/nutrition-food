const CACHE_NAME = 'foodninja-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/modern.css',
  '/main.js',
  '/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match('/index.html')))
  );
});
