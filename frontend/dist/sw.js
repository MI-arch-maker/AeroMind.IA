// Retire l’ancien cache-first PWA, responsable de servir un index.html et des
// bundles hashés issus de déploiements différents. Les assets sont servis par
// le cache HTTP (fingerprint Vite) ; l’application reste réseau-first.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("aeromind-v") || name.startsWith("aeromind-"))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    // Retire l’enregistrement une fois les anciens caches supprimés. Cette
    // activation ne contrôle aucune réponse: toutes passent au réseau normal.
    await self.registration.unregister();
  })());
});
