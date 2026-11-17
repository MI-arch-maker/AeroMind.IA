# syntax=docker/dockerfile:1.7
# AeroMind — Dockerfile full-stack (FastAPI + frontend Vite compilé).
# Compatible Render (runtime: docker, healthCheckPath: /api/ready).

FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
# pnpm via corepack pour garantir la version 10.18.0 déclarée dans package.json.
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate && pnpm install --frozen-lockfile
# Copier le code frontend et les scripts i18n partagés.
COPY frontend ./
COPY scripts ../scripts
# Type-check + build Vite -> /app/frontend/dist
RUN pnpm run check && pnpm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AEROMIND_ENV=production \
    AEROMIND_VIRTUAL_ONLY=false \
    HARDWARE_CONTROL=true \
    AEROMIND_SITL_AUTOSTART=true \
    AEROMIND_CAD_STORAGE_DIR=/app/data/cad \
    PORT=10000 \
    WEB_CONCURRENCY=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Utilisateur non-root pour Render.
RUN addgroup --system aeromind && adduser --system --ingroup aeromind aeromind
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav libgl1 libglu1-mesa libgomp1 libxrender1 libxext6 \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Code applicatif (backend + SITL emitter + frontend compilé).
COPY web ./web
COPY sitl_modules ./sitl_modules
COPY scripts ./scripts
COPY fixtures/cad ./fixtures/cad
COPY main.py ./
COPY .env.example ./.env.example
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Dossiers runtime + permissions.
RUN mkdir -p data/engineering_files data/cad logs && chown -R aeromind:aeromind /app
USER aeromind
EXPOSE 10000

# Render utilise /api/ready comme health check ; le port est défini par PORT.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT','10000') + '/api/ready', timeout=3).status == 200 else 1)"]

# CMD en forme exec avec 1 seul worker pour éviter la saturation RAM au démarrage.
ENV XDG_CACHE_HOME=/tmp/.cache MPLCONFIGDIR=/tmp/.matplotlib
CMD ["sh", "-c", "exec uvicorn web.app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --limit-concurrency 100 --timeout-keep-alive 30 --timeout-graceful-shutdown 5"]
