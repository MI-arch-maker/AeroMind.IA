// AeroMind — Service Worker (v17 — fix cache 404)
//
// CAHIER DES CHARGES 2026-10-30 — Correction 404 assets après déploiement :
// Le SW précédent (v15) utilisait cache-first pour le HTML, ce qui servait
// l'ancien index.html référençant d'anciens noms de bundles (hashes Vite).
// Après un nouveau déploiement, ces anciens bundles n'existaient plus → 404.
//
// Nouvelle stratégie :
//   - HTML (navigation) : NETWORK-FIRST — toujours le dernier index.html
//     (qui référence les bons hashes de bundles). Fallback cache si offline.
//   - Assets (/assets/*.js, *.css) : CACHE-FIRST — les hashes Vite garantissent
//     l'immutabilité. Si le fichier n'est pas en cache, on fetch depuis le
//     serveur. Si le serveur retourne 404, on ne cache pas (fichier obsolète).
//   - API : network-only (pas de cache — données critiques)
//   - Images/fonts : cache-first avec mise à jour en arrière-plan
//   - SSE/WebSocket : toujours network (pas de cache)

const CACHE_NAME = "aeromind-v17-shell-v2";
const STATIC_CACHE = "aeromind-v17-static-v2";

// App shell: fichiers HTML seulement (les assets JS/CSS sont gérés à la volée)
const APP_SHELL = [
  "/",
  "/labbench",
  "/manifest.json",
  "/aeromind-logo.svg",
];

// Install: pre-cache the app shell HTML
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => {})
    )
  );
  self.skipWaiting();
});

// Activate: clean ALL old caches (v15, v16, etc.) and claim clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: route-based caching strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip SSE streams and WebSocket upgrades — always network
  if (url.pathname.includes("/api/hardware/fleet/telemetry/stream") ||
      url.pathname.includes("/api/realtime/ws") ||
      event.request.headers.get("upgrade") === "websocket") {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // ── HTML navigation : NETWORK-FIRST ──
  // Toujours fetcher le dernier index.html depuis le serveur.
  // Fallback vers le cache uniquement si le réseau échoue (offline).
  if (event.request.mode === "navigate" ||
      (event.request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          // Mettre en cache le nouveau HTML
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => {
          // Offline fallback: servir le HTML en cache
          return caches.match(event.request).then((cached) =>
            cached || caches.match("/")
          );
        })
    );
    return;
  }

  // ── Assets Vite (/assets/*.js, *.css, fonts) : CACHE-FIRST ──
  // Les hashes Vite garantissent l'immutabilité : un fichier avec un hash
  // donné ne change jamais. Si le fichier est en cache, il est valide.
  // Si non en cache, on fetch depuis le serveur. Si 404, on ne cache pas.
  if (url.pathname.startsWith("/assets/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".ttf")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        // Pas en cache → fetch depuis le serveur
        return fetch(event.request).then((resp) => {
          // Ne pas cacher les erreurs (404 = fichier obsolète)
          if (resp && resp.ok && resp.type === "basic") {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        }).catch(() => {
          // Offline et pas en cache → erreur
          return new Response("Asset unavailable offline", { status: 503 });
        });
      })
    );
    return;
  }

  // ── Images/SVG : cache-first avec stale-while-revalidate ──
  if (url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".webp") ||
      url.pathname.endsWith(".jpg") ||
      url.pathname.endsWith(".ico")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // ── API : network-only (données critiques, pas de cache) ──
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: { code: "OFFLINE", message: "Hors ligne" } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // ── Default: try cache, then network ──
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
