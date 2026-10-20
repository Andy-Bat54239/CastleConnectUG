/* Bridge Grind service worker. Generated into dist/sw.js at build time. */
const VERSION = '__VERSION__'
const SHELL = __SHELL__
const SHELL_CACHE = 'bg-shell-' + VERSION
const RUNTIME_CACHE = 'bg-runtime-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bg-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // The player counter and its private page are always fetched live, never from the cache.
  if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/stats.html') return

  // Page loads: try the network (so updates arrive), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./').then((r) => r || caches.match(req))),
    )
    return
  }

  // Everything else (hashed assets, lesson chunks): cache first, fill the cache on first use.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
