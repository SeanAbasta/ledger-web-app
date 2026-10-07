// Keeps the app opening offline after the first visit. Same-origin files only:
// api.github.com is never touched, so sync always talks to GitHub directly.
const CACHE = "ledger-shell-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network first, so an update shows up on the next open; the cached copy is the offline fallback.
    e.respondWith(
      fetch(req)
        .then(async (res) => {
          if (res.ok) (await caches.open(CACHE)).put(self.registration.scope, res.clone());
          return res;
        })
        .catch(async () => (await caches.match(self.registration.scope)) || Response.error()),
    );
    return;
  }

  // Built files have hashed names, so cached copies never go stale.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then(async (res) => {
          if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
          return res;
        }),
    ),
  );
});
