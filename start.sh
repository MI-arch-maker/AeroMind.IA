#!/bin/bash
# AeroMind entry-point for the Z.ai preview framework.
# The framework's Caddy on port 81 reverse-proxies to port 5173 (Vite's default
# dev port), so AeroMind's FastAPI server MUST listen on port 5173 to be
# reachable via the preview URL https://preview-<bot-id>.space-z.ai/.
# This script bootstraps the env, ensures the SQLite database exists, and
# starts uvicorn on port 5173. The FastAPI app serves both /api/* routes and
# the compiled Vite frontend bundle (frontend/dist/index.html).
set -e
cd "$(dirname "$0")"
unset DATABASE_URL
export AEROMIND_ENV="${AEROMIND_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./data/aeromind.db}"
export AEROMIND_SESSION_SECRET="${AEROMIND_SESSION_SECRET:-dev-secret-aeromind-cahier-charges-execution-2026-10-30-strong}"
export AEROMIND_AUTO_CREATE_SCHEMA="${AEROMIND_AUTO_CREATE_SCHEMA:-true}"
export AEROMIND_ALLOWED_HOSTS="${AEROMIND_ALLOWED_HOSTS:-*}"
export AEROMIND_ALLOWED_ORIGINS="${AEROMIND_ALLOWED_ORIGINS:-*}"
export PORT="${PORT:-3000}"
mkdir -p data logs
exec python3 -m uvicorn web.app:app --host 0.0.0.0 --port "$PORT"
