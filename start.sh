#!/bin/bash
# AeroMind local/demo entry point.
# This runner uses an isolated SQLite database and keeps the whole application
# in software-only mode: no SITL autostart and no physical hardware output.
set -e
cd "$(dirname "$0")"
if [[ -n "${AEROMIND_PYTHON:-}" ]]; then
  PYTHON_BIN="$AEROMIND_PYTHON"
elif [[ -x .venv/bin/python ]]; then
  PYTHON_BIN="$(pwd)/.venv/bin/python"
else
  PYTHON_BIN="python3"
fi
unset DATABASE_URL
export AEROMIND_ENV="${AEROMIND_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///./data/aeromind.db}"
export AEROMIND_SESSION_SECRET="${AEROMIND_SESSION_SECRET:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')}"
export AEROMIND_AUTO_CREATE_SCHEMA="${AEROMIND_AUTO_CREATE_SCHEMA:-true}"
export AEROMIND_SITL_AUTOSTART=false
export AEROMIND_VIRTUAL_ONLY=true
export HARDWARE_CONTROL=false
export AEROMIND_ALLOWED_HOSTS="${AEROMIND_ALLOWED_HOSTS:-*}"
export AEROMIND_ALLOWED_ORIGINS="${AEROMIND_ALLOWED_ORIGINS:-*}"
export PORT="${PORT:-3000}"
mkdir -p data logs
exec "$PYTHON_BIN" -m uvicorn web.app:app --host 0.0.0.0 --port "$PORT"
