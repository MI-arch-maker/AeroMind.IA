# Anomalies Render — Diagnostic et Correction définitive

## Source

Log de déploiement Render : `aeromind.ia-deploy-46f0b8a-2026-10-30-1756.log`
Commit GitHub : `46f0b8a2bc06e1d19d6bd0626e756dd426faa06e`
URL Render : `https://aeromind-ia.onrender.com`

## Résultat du déploiement

✅ **Build Docker réussi** — image construite et poussée
✅ **TypeScript check passé** — `pnpm run check` (tsc --noEmit) sans erreur
✅ **Vite build réussi** — bundle `index-ql_Q0gVB.js` (3 378 kB)
✅ **Service en ligne** — `https://aeromind-ia.onrender.com` respond en 200

## Anomalies identifiées dans le log runtime

### Anomalie 1 — Processus enfant [25] mort immédiatement

**Log :**
```
15:58:25 INFO: Uvicorn running on http://0.0.0.0:10000
15:58:25 INFO: Started parent process [1]
15:58:31 INFO: Waiting for child process [25]
15:58:31 INFO: Child process [25] died
```

**Cause racine :** Le CMD du Dockerfile utilisait `--workers 2`. Avec 2 workers uvicorn, les deux processus tentent simultanément :
- `Base.metadata.create_all()` dans le lifespan (race condition sur SQLite/PostgreSQL)
- le démarrage du thread SITL emitter (`mavlink_sitl_emitter.py`)
- l'initialisation du MAVLink pool (`mavlink_pool.py`)

Le premier worker [25] perd la course et crash. Uvicorn le remplace par [26], qui hang à son tour, puis [27] finit par réussir.

**Correction :** Dockerfile ligne 62 — `--workers 2` → `--workers 1`.
```dockerfile
CMD ["sh", "-c", "exec uvicorn web.app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 ..."]
```

### Anomalie 2 — Processus [26] n'a jamais complété son startup

**Log :**
```
15:59:02 INFO: Started server process [26]
15:59:02 INFO: Waiting for application startup.
15:59:04 INFO: Started server process [27]    ← [26] n'a jamais affiché "Application startup complete"
15:59:05 INFO: Application startup complete.   ← seulement [27]
```

**Cause racine :** Conséquence directe de l'Anomalie 1. Le worker [26] a hang pendant l'initialisation (attente d'un lock DB ou du SITL emitter), uvicorn a démarré [27] en remplacement.

**Correction :** Même fix que l'Anomalie 1 — `--workers 1` élimine la race condition.

### Anomalie 3 — HEAD / retourne 405 Method Not Allowed

**Log :**
```
15:59:05 INFO: 127.0.0.1:50470 - "HEAD / HTTP/1.1" 405 Method Not Allowed
```

**Cause racine :** La route `@app.get('/')` dans `web/app.py` n'acceptait que GET. Le health check de Render envoie HEAD en premier pour vérifier que le port répond. FastAPI refuse HEAD sur une route GET-only → 405.

Le déploiement a quand même réussi car Render a ensuite fait un GET qui a retourné 200, mais le 405 est une anomalie qui pollue les logs et peut faire échouer le health check sur d'autres plateformes.

**Correction :** `web/app.py` — 4 routes modifiées de `@app.get(...)` → `@app.api_route(..., methods=['GET', 'HEAD'])` :

| Route | Ligne | Avant | Après |
|---|---|---|---|
| `/` | 1413 | `@app.get('/', response_class=HTMLResponse)` | `@app.api_route('/', methods=['GET', 'HEAD'], response_class=HTMLResponse)` |
| `/api/health` | 352 | `@app.get('/api/health')` | `@app.api_route('/api/health', methods=['GET', 'HEAD'])` |
| `/api/ready` | 1432 | `@app.get('/api/ready')` | `@app.api_route('/api/ready', methods=['GET', 'HEAD'])` |
| `/{path:path}` | 2165 | `@app.get('/{path:path}', ...)` | `@app.api_route('/{path:path}', methods=['GET', 'HEAD'], ...)` |

FastAPI retourne automatiquement seulement les headers (pas de body) pour HEAD, conforme à la spec HTTP.

### Anomalie 4 — Incohérence de port dans le Dockerfile

**État initial :**
| Élément | Valeur | Ligne |
|---|---|---|
| `ENV PORT` | `3000` | 20 |
| `EXPOSE` | `10000` | 41 |
| HEALTHCHECK | `${PORT:-3000}` | 47 |
| CMD `--port` | `10000` (hardcodé) | 52 |

**Problème :** Le CMD hardcodait `--port 10000` au lieu d'utiliser `$PORT`. Conséquences :
- Sur Render : `PORT=10000` (injected par render.yaml), CMD utilise 10000 → fonctionne par coïncidence
- Sur preview Z.ai : `PORT=3000` (de .env), CMD utilise 10000 → serveur sur 10000 mais Caddy attend 3000 → **cassé**
- Le HEALTHCHECK vérifiait `${PORT:-3000}` (port 3000) mais le serveur était sur 10000 → healthcheck échouait en local Docker

**Correction :**
```dockerfile
# ENV PORT aligné sur le standard Render
ENV ... PORT=10000 ...

# CMD en shell form pour permettre l'expansion de $PORT au runtime
CMD ["sh", "-c", "exec uvicorn web.app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 ..."]

# HEALTHCHECK utilise os.environ.get('PORT', '10000') au lieu de ${PORT:-3000}
HEALTHCHECK ... CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','10000')+'/api/ready', timeout=3).status==200 else 1)"
```

Le CMD en shell form (`sh -c "exec ..."`) permet l'expansion de `$PORT` au runtime. `exec` remplace le shell par uvicorn pour que SIGTERM soit reçu directement (graceful shutdown).

---

## Anomalies non-bloquantes (warnings, documentées)

### Warning A — Chunk > 1536 kB

**Log :**
```
(!) Some chunks are larger than 1536 kB after minification.
../dist/assets/index-ql_Q0gVB.js  3,378.66 kB │ gzip: 916.46 kB
```

**Statut :** Warning performance, pas d'erreur. L'app fonctionne. Le bundle est gros car Home.tsx fait 14k lignes et importe Three.js + Recharts + Radix + tRPC + Streamdown + Shiki (highlighting de 200+ langages).

**Recommandation :** Code-splitting via `React.lazy()` pour les pages SuperAdmin et AuditJournal (déjà fait), et lazy-loader les dépendances Shiki/Streamdown. Non critique pour le déploiement.

### Warning B — `<script>` sans `type="module"`

**Log :**
```
<script src="/api/platform/config.js"> in "/index.html" can't be bundled without type="module" attribute
```

**Statut :** Warning informatif Vite. Le script `/api/platform/config.js` est servi par le backend FastAPI (configuration runtime), pas bundlé par Vite. Comportement attendu.

### Warning C — pnpm 10.18.0 → 12.16.1 disponible

**Log :**
```
│     Update available! 10.18.0 → 12.16.1.      │
```

**Statut :** Informationnel. pnpm 10.18.0 fonctionne correctement (lockfile compatible). Mise à jour optionnelle.

---

## Vérifications post-correction

```
=== tsc --noEmit ===
check exit: 0                    ✓ Aucune erreur TypeScript

=== vite build ===
build exit: 0                    ✓ Bundle reconstruit

=== Python app loads ===
app loaded OK, routes: 71        ✓ Backend charge

=== Routes HEAD ===
/              : methods=['GET', 'HEAD']  ✓
/api/health    : methods=['GET', 'HEAD']  ✓
/api/ready     : methods=['GET', 'HEAD']  ✓

=== HEAD / (curl -sI) ===
HTTP/1.1 200 OK                  ✓ Avant : 405 Method Not Allowed

=== HEAD /api/ready ===
HTTP/1.1 200 OK                  ✓

=== HEAD /api/health ===
HTTP/1.1 200 OK                  ✓
```

## Fichiers modifiés

| Fichier | Modifications |
|---|---|
| `Dockerfile` | `--workers 2` → `--workers 1` · CMD shell form avec `$PORT` · ENV PORT=10000 · HEALTHCHECK aligné |
| `web/app.py` | 4 routes : `@app.get` → `@app.api_route(methods=['GET', 'HEAD'])` |

**Total : 2 fichiers modifiés, 0 ligne fonctionnelle supprimée.**
