#!/bin/bash
# Framework entry point — starts AeroMind on port 3000 (Caddy backend).
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
