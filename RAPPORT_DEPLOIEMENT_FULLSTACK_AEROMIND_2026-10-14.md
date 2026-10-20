# AeroMind — Remédiation full-stack et validation de déploiement

**Date :** 14 octobre 2026

## Changements livrés

- `requirements.txt` : dépendances Python verrouillées pour FastAPI, Uvicorn, SQLAlchemy, PostgreSQL, OIDC, cryptographie et validation.
- `Dockerfile` : build multi-stage Node 22 + runtime Python 3.12, frontend compilé puis servi par FastAPI.
- `docker-compose.yml` : PostgreSQL 16 + application AeroMind avec healthchecks.
- `render.yaml` : service Docker Render, base PostgreSQL et références de secrets.
- `.dockerignore` : exclusion des dépendances et données locales.
- `sitl_modules/` : interface SITL simulation-only sans sortie matérielle.
- `main.py` : moteur de compatibilité local déterministe utilisé par les contrôles de santé.
- `web/app.py` : création idempotente des tables SQLAlchemy au démarrage pour l’environnement local/Compose.
- `frontend/package.json` : scripts `start`, `dev`, `dev:api` et `dev:static` corrigés.
- `README.md` : procédure locale et Compose alignée sur les fichiers réellement livrés.

## Validation réalisée

| Contrôle | Résultat |
|---|---:|
| `python3 -m py_compile web/*.py sitl_modules/*.py main.py` | PASS |
| Import `web.app` avec dépendances installées | PASS |
| Routes FastAPI enregistrées | PASS |
| `pnpm run check` | PASS |
| Tests Vitest | PASS — 25 fichiers, 131 tests |
| `pnpm run build` | PASS |
| Parse `docker-compose.yml` | PASS |
| Parse `render.yaml` | PASS |
| `pnpm run start` corrigé | PASS — Uvicorn démarre |
| `/` FastAPI | HTTP 200 |
| `/api/health` | HTTP 200, DB connected |
| `/api/ready` | HTTP 200 |
| `/api/capabilities` | HTTP 200 |
| `/api/platform/config.js` | HTTP 200 |
| `/api/sitl/status` | HTTP 200, simulation-only |
| `/api/local/workspace` | HTTP 200 |
| workspace avec `physicalOutputEnabled=true` | HTTP 422 — correctement rejeté |
| commandes matérielles sans session | HTTP 401 — correctement rejetées |

## Limite d’environnement

Le binaire Docker n’est pas installé dans le sandbox d’audit :

```text
bash: docker: command not found
```

L’image n’a donc pas pu être construite ici. Le Dockerfile a été contrôlé statiquement, les fichiers YAML ont été parsés, et le même montage full-stack a été démarré directement avec Uvicorn et SQLite.

La validation Docker finale à exécuter sur une machine équipée de Docker est :

```bash
docker build --progress=plain -t aeromind:latest .
docker compose up --build -d
docker compose ps
curl http://localhost:10000/api/ready
```

## Verdict

La base livrée est désormais **démarrable localement en full-stack** et possède une configuration de déploiement Docker/Render cohérente. Le contrôle matériel reste volontairement désactivé et le système demeure une plateforme de simulation/documentation tant qu’une intégration matérielle séparée, autorisée et auditée n’est pas fournie.

Le déploiement Render réel, la configuration OIDC du tenant et la construction Docker ne peuvent pas être déclarés exécutés depuis ce sandbox sans accès aux secrets Render et à un moteur Docker.
