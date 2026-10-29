// AeroMind LabBench 01 — Service Worker (v14 PWA)
//
// Strategy:
//   - App shell (HTML, CSS, JS bundles): cache-first, fallback to network
//   - API requests: network-first, fallback to cache (stale-while-revalidate)
//   - Static assets (images, fonts): cache-first
//   - SSE streams: always network (no caching)
//
// The SW is intentionally minimal — no background sync or push notifications
// (those would require additional permissions and complex edge cases).

const CACHE_NAME = "aeromind-v15-shell-v1";
const API_CACHE_NAME = "aeromind-v15-api-v1";

// App shell: files that make the UI load without network
const APP_SHELL = [
  "/",
  "/labbench",
  "/manifest.json",
  "/aeromind-logo.svg",
];

// Install: pre-cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: route-based caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip SSE streams — always network
  if (url.pathname.includes("/api/hardware/fleet/telemetry/stream") ||
      url.pathname.includes("/api/realtime/ws")) {
    return;
  }

  // Skip WebSocket upgrades
  if (event.request.headers.get("upgrade") === "websocket") {
    return;
  }

  // App shell (HTML, CSS, JS): cache-first
  if (event.request.mode === "navigate" ||
      url.pathname.startsWith("/assets/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".webp")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Update in background
          fetch(event.request).then((resp) => {
            if (resp && resp.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then((resp) => {
          if (resp && resp.ok && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        }).catch(() => {
          // Offline fallback: serve the app shell
          return caches.match("/");
        });
      })
    );
    return;
  }

  // P3-05 fix: API requests are NOT cached anymore. The previous network-first
  // with cache fallback could serve stale mission/telemetry/gate data without
  // any client-side warning (the X-AeroMind-Cache:stale header was never read
  // by the React layer). For an aviation operator UI, stale authorization or
  // telemetry data could drive unsafe actions. Now: network-only with 503
  // offline fallback (no stale cache serving).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: { code: "OFFLINE", message: "Hors ligne — données non disponibles" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
