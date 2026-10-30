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
    PORT=3000 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Utilisateur non-root pour Render.
RUN addgroup --system aeromind && adduser --system --ingroup aeromind aeromind
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Code applicatif (backend + SITL emitter + frontend compilé).
COPY web ./web
COPY sitl_modules ./sitl_modules
COPY scripts ./scripts
COPY main.py ./
COPY .env.example ./.env.example
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Dossiers runtime + permissions.
RUN mkdir -p data logs && chown -R aeromind:aeromind /app
USER aeromind
EXPOSE 10000

# Render utilise /api/ready comme health check ; le port est défini par PORT.
# HEALTHCHECK explicite pour les déploiements hors-Render (docker-compose, k8s,
# etc.) ; Render s'appuie sur healthCheckPath dans render.yaml.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:${PORT:-3000}/api/ready', timeout=3).status==200 else 1)"

# CMD en forme exec (pas shell form) : permet à uvicorn de recevoir SIGTERM
# directement pour un graceful shutdown. Workers/timings alignés avec les
# recommandations Render starter (2 vCPU).
CMD ["uvicorn", "web.app:app", "--host", "0.0.0.0", "--port", "10000", "--workers", "2", "--limit-concurrency", "100", "--timeout-keep-alive", "30", "--timeout-graceful-shutdown", "5"]
