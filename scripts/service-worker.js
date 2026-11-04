/* Generated during the production build. No photo or external AI model is cached here. */
const RESOURCES = __PRECACHE__;
const VERSION = __VERSION__;
const PREFIX = "particules-shell-";
const CACHE = PREFIX + VERSION;
const URLS = new Set(RESOURCES.map((path) => new URL(path, self.location.origin).href));

self.addEventListener("install", (event) => {
  // Atomic install: one failed resource leaves the current app untouched.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(RESOURCES.map((url) => new Request(url, { cache: "reload" })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith(PREFIX));
    // Retain one previous shell for older tabs after an explicit update.
    const previous = names.filter((name) => name !== CACHE).at(-1);
    await Promise.all(names.filter((name) => name !== CACHE && name !== previous)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Pin HTML and its hashed modules to the same build, even during a rollout.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match("/index.html") || fetch(request);
    })());
  } else if (URLS.has(url.href) || /^\/assets\//.test(url.pathname)) {
    event.respondWith((async () => {
      const current = await caches.open(CACHE);
      return await current.match(request) || await caches.match(request) || fetch(request);
    })());
  }
});
