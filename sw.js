const VERSION = 'sight-reading-shell-v3';
const FILES = [
  './', 'index.html', 'css/style.css', 'css/key-guide.css', 'manifest.webmanifest',
  'js/generator.js', 'js/alignment.js', 'js/audio.js', 'js/input.js', 'js/recorder-worklet.js',
  'js/transcribe.js', 'js/storage.js', 'js/score.js', 'js/app.js', 'js/i18n.js',
  'js/static-i18n.js', 'js/app-i18n.js', 'js/key-guide.js', 'js/timing.js', 'js/score-follow.js', 'css/score-follow.css', 'vendor/vexflow.js',
  'fonts/bodoni-moda-subset.woff2', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'docs/research.md', 'docs/plan.md', 'docs/verification.md', 'docs/grade-scope.md'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('sight-reading-shell-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response.ok && new URL(event.request.url).pathname.includes('/vendor/')) {
        const copy = response.clone();
        event.waitUntil(caches.open('sight-reading-model-v1').then(cache => cache.put(event.request, copy)));
      }
      return response;
    });
  }));
});
