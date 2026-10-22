/* ================================================
   HOSTAL HDQ — Service worker de la versión móvil
   Red primero (siempre datos y código al día) y caché
   como respaldo para abrir la app sin conexión.
   Las llamadas a Google Apps Script nunca se cachean.
   ================================================ */

const CACHE = 'hdq-movil-v1';
const SHELL = [
  './', './index.html', './app.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  '../js/auth.js', '../js/sheets.js', '../js/reservas.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
