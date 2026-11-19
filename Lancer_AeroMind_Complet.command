#!/bin/bash
cd "$(dirname "$0")"

# 1. Créer un environnement Python local autonome s'il n'existe pas encore sur le nouvel ordinateur
if [ ! -d ".venv_local" ]; then
  echo "[INIT] Première installation sur cet ordinateur..."
  python3 -m venv .venv_local
  .venv_local/bin/pip install --upgrade pip
  .venv_local/bin/pip install --only-binary=:all: pymavlink websockets pygame fastapi uvicorn sqlalchemy pydantic httpx python-multipart PyJWT "cryptography<45" numpy slowapi eval_type_backport
fi

# 2. Libérer les ports si déjà utilisés
lsof -ti:14550,8765,10000 | xargs kill -9 2>/dev/null

# 3. Démarrer Bridge + sim_flight (20 Hz) + Serveur AeroMind
.venv_local/bin/python bridge/aeromind_bridge.py &
sleep 1
.venv_local/bin/python bridge/sim_flight.py &
sleep 1
(sleep 2 && open http://localhost:10000) &

AEROMIND_AUTO_CREATE_SCHEMA=true \
AEROMIND_SESSION_SECRET="aeromind-bridge-local-secret-key-2026-prod" \
AEROMIND_MAVLINK_URL=udpin:127.0.0.1:14550 \
AEROMIND_MAVLINK_OBSERVER_URL=udpin:127.0.0.1:14550 \
AEROMIND_SITL_ACTIVE=true \
HARDWARE_CONTROL=true \
AEROMIND_VIRTUAL_ONLY=false \
.venv_local/bin/python -m uvicorn web.app:app --host 0.0.0.0 --port 10000
