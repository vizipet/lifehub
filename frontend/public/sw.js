const CACHE_NAME = 'lifehub-shell-v2';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/assets/lifehub-mark.svg',
  '/assets/lifehub-logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const shell = await cache.match('/');
    if (!shell) throw new Error('Application shell was not cached.');
    const html = await shell.text();
    const bundles = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
      .map((url) => url.pathname + url.search);
    if (!bundles.length) throw new Error('Application bundles were not found.');
    await cache.addAll([...new Set(bundles)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => (key.startsWith('lifehub-shell-') || key.startsWith('vizipet-shell-')) && key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) {
    return;
  }
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.headers.has('Authorization')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }

  if (url.pathname.startsWith('/assets/') && ['script', 'style', 'image', 'font'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok && !/\b(?:private|no-store)\b/i.test(response.headers.get('Cache-Control') || '')) {
            const responseCopy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        });
      }),
    );
  }
});
