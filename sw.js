const SHELL_PREFIX = 'piano-shell:' + self.registration.scope + ':';
const VERSION = SHELL_PREFIX + 'v4';
const MODEL_CACHE = 'sight-reading-model-v1';
const FILES = [
  './', 'index.html', 'css/style.css', 'css/key-guide.css', 'manifest.webmanifest',
  'js/generator.js', 'js/alignment.js', 'js/audio.js', 'js/input.js', 'js/recorder-worklet.js',
  'js/transcribe.js', 'js/storage.js', 'js/score.js', 'js/app.js', 'js/i18n.js',
  'js/static-i18n.js', 'js/app-i18n.js', 'js/key-guide.js', 'js/timing.js', 'js/score-follow.js', 'css/score-follow.css', 'vendor/vexflow.js',
  'fonts/bodoni-moda-subset.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'docs/research.md', 'docs/plan.md', 'docs/verification.md', 'docs/grade-scope.md'
];
self.addEventListener('install', event => {
  const requests = FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' }));
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(SHELL_PREFIX) && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  const vendorAsset = event.request.url.startsWith(self.registration.scope + 'vendor/');
  event.respondWith(caches.match(event.request, { cacheName: VERSION }).then(async cached => {
    if (cached) return cached;
    if (vendorAsset) {
      const stored = await caches.match(event.request, { cacheName: MODEL_CACHE });
      if (stored) return stored;
    }
    return fetch(event.request).then(response => {
      if (response.ok && vendorAsset) {
        const copy = response.clone();
        event.waitUntil(caches.open(MODEL_CACHE).then(cache => cache.put(event.request, copy)));
      }
      return response;
    });
  }));
});
