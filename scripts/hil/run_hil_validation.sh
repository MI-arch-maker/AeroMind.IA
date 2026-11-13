#!/usr/bin/env bash
# =============================================================================
# run_hil_validation.sh — Validation HIL automatisée AeroMind LabBench 01 v5
#
# Ce script démarre en une seule commande :
#   1. ArduPilot SITL (firmware réel simulé) sur UDP 14550
#   2. AeroMind FastAPI backend avec HARDWARE_CONTROL=true
#   3. Le validateur Python qui exécute les 8 tests de la checklist HIL
#   4. Affiche le rapport + nettoie les subprocess à la fin
#
# Prérequis :
#   - Python 3.11+ (déjà sur la machine de dev)
#   - pymavlink installé (déjà dans requirements.txt)
#   - ArduPilot SITL cloné (sera proposé si absent)
#   - Node 22 + pnpm 10 (pour le frontend build si pas déjà fait)
#
# Usage :
#   bash scripts/hil/run_hil_validation.sh
#
# Options d'environnement :
#   ARDUPILOT_ROOT=/path/to/ardupilot   # défaut: ~/ardupilot
#   SITL_VEHICLE=ArduCopter            # ou ArduPlane, ArduRover, ArduSub
#   SITL_PORT=14550                     # port UDP MAVLink
#   AEROMIND_PORT=10000                 # port backend FastAPI
#   HIL_KEEP_RUNNING=0                  # 1 = ne pas tuer les subprocess à la fin
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

# Couleurs
RED=$'\033[31m'
GREEN=$'\033[32m'
AMBER=$'\033[33m'
CYAN=$'\033[36m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

log()   { echo "${CYAN}[HIL]${RESET} $*" >&2; }
warn()  { echo "${AMBER}[HIL WARNING]${RESET} $*" >&2; }
err()   { echo "${RED}[HIL ERROR]${RESET} $*" >&2; }
ok()    { echo "${GREEN}[HIL OK]${RESET} $*" >&2; }

# === Variables d'environnement (avec defaults) ===
: "${ARDUPILOT_ROOT:=${HOME}/ardupilot}"
: "${SITL_VEHICLE:=ArduCopter}"
: "${SITL_PORT:=14550}"
: "${AEROMIND_PORT:=10000}"
: "${HIL_KEEP_RUNNING:=0}"
: "${SITL_HOME_LAT:=38.0}"
: "${SITL_HOME_LON:=-122.0}"

SIM_VEHICLE="${ARDUPILOT_ROOT}/Tools/autotest/sim_vehicle.py"

# === Vérification des prérequis ===

log "Vérification des prérequis..."

if ! command -v python3 >/dev/null; then
  err "Python 3 absent. Installer Python 3.11+."
  exit 1
fi

if ! python3 -c "import pymavlink" 2>/dev/null; then
  warn "pymavlink non disponible sur le Python courant — installation..."
  pip install pymavlink || {
    err "Échec installation pymavlink"
    exit 1
  }
fi

# Vérifier que les requirements Python sont installés
if ! python3 -c "from web.labbench import status" 2>/dev/null; then
  warn "Modules web/* non importables — installation requirements.txt..."
  pip install -r requirements.txt || {
    err "Échec installation requirements.txt"
    exit 1
  }
fi

# Vérifier ArduPilot SITL
if [[ ! -x "${SIM_VEHICLE}" ]]; then
  warn "ArduPilot SITL introuvable: ${SIM_VEHICLE}"
  read -r -p "${BOLD}Cloner ArduPilot maintenant dans ${ARDUPILOT_ROOT} ? [y/N]${RESET} " reply
  if [[ "${reply}" =~ ^[Yy]$ ]]; then
    git clone https://github.com/ArduPilot/ardupilot.git --recurse-submodules "${ARDUPILOT_ROOT}"
    # Installer les prereqs SITL (Ubuntu/Debian)
    if [[ -x "${ARDUPILOT_ROOT}/Tools/environment_install/install-prereqs-ubuntu.sh" ]]; then
      log "Installation des prérequis SITL (peut demander sudo)..."
      bash "${ARDUPILOT_ROOT}/Tools/environment_install/install-prereqs-ubuntu.sh" -y || warn "Préreqs SITL: voir la doc ArduPilot pour votre OS"
    fi
  else
    err "ArduPilot SITL requis pour la validation HIL. Voir https://ardupilot.org/dev/docs/sitl-simulator-software.html"
    exit 2
  fi
fi

# Vérifier le build frontend (AeroMind sert le bundle Vite)
if [[ ! -d frontend/dist ]]; then
  warn "frontend/dist absent — build Vite requis..."
  if command -v pnpm >/dev/null; then
    (cd frontend && pnpm install --frozen-lockfile && pnpm run build)
  else
    err "pnpm absent. Installer pnpm 10.18.0 : npm install -g pnpm@10.18.0"
    exit 1
  fi
fi

# === Préparer la DB de test HIL ===

HIL_DB="${PROJECT_ROOT}/data/hil-validation.db"
mkdir -p data
rm -f "${HIL_DB}"
log "Base SQLite HIL: ${HIL_DB}"

# === Démarrer SITL ===

SITL_LOG="${PROJECT_ROOT}/logs/sitl.log"
mkdir -p logs
: > "${SITL_LOG}"

log "Démarrage SITL ${SITL_VEHICLE} sur UDP ${SITL_PORT} (log: logs/sitl.log)..."
# On lance SITL en mode "headless" (pas de console/map) pour pouvoir tourner en CI.
# --out=udpout:127.0.0.1:${SITL_PORT} == SITL envoie MAVLink à ce port.
# -L platform == position de départ (lat 38.0, lon -122.0 par défaut).
SITL_HOME="\
  SIM_HOME_LAT=${SITL_HOME_LAT} \
  SIM_HOME_LON=${SITL_HOME_LON} \
  ${SIM_VEHICLE} \
  -v ${SITL_VEHICLE} \
  -L platform \
  --no-console \
  --no-map \
  --instance 0"

SITL_PID=""
cleanup() {
  if [[ "${HIL_KEEP_RUNNING}" == "1" ]]; then
    warn "HIL_KEEP_RUNNING=1 : SITL et uvicorn laissés en vie (PIDs dans logs/)."
    return
  fi
  log "Nettoyage des subprocess..."
  [[ -n "${SITL_PID}" ]] && kill "${SITL_PID}" 2>/dev/null || true
  [[ -n "${UVICORN_PID}" ]] && kill "${UVICORN_PID}" 2>/dev/null || true
  sleep 1
  # kill -9 en fallback
  [[ -n "${SITL_PID}" ]] && kill -9 "${SITL_PID}" 2>/dev/null || true
  [[ -n "${UVICORN_PID}" ]] && kill -9 "${UVICORN_PID}" 2>/dev/null || true
  pkill -f "sim_vehicle.py.*${SITL_PORT}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

env SIM_HOME_LAT=${SITL_HOME_LAT} SIM_HOME_LON=${SITL_HOME_LON} \
  "${SIM_VEHICLE}" \
  -v "${SITL_VEHICLE}" \
  -L platform \
  --no-console --no-map --instance 0 \
  >"${SITL_LOG}" 2>&1 &
SITL_PID=$!

# Attendre que SITL soit prêt (poll heartbeat MAVLink sur le port de contrôle interne)
log "Attente du heartbeat SITL (jusqu'à 60 s)..."
for i in $(seq 1 60); do
  if grep -q "Ready to FLY\|Ready to boot\|Waiting for connection" "${SITL_LOG}" 2>/dev/null; then
    ok "SITL prêt après ${i}s"
    break
  fi
  sleep 1
  [[ $i -eq 60 ]] && {
    err "SITL n'a pas démarré. Voir logs/sitl.log"
    tail -30 "${SITL_LOG}" >&2 || true
    exit 3
  }
done
sleep 2  # stabilisation

# === Démarrer AeroMind backend ===

UVICORN_LOG="${PROJECT_ROOT}/logs/uvicorn-hil.log"
: > "${UVICORN_LOG}"

log "Démarrage AeroMind backend (HARDWARE_CONTROL=true) sur port ${AEROMIND_PORT}..."
# Le validateur lit SITL sur 14550, donc on enregistre le drone dans le pool avec
# udpout:127.0.0.1:14550 — ce qui est aussi le port par défaut où sim_vehicle.py
# expose le contrôle MAVLink quand on lance sans --out.
export HARDWARE_CONTROL=true
export AEROMIND_ENV=development
export DATABASE_URL="sqlite:///${HIL_DB}"
export AEROMIND_SESSION_SECRET="hil-validation-session-secret-32bytes"
export AEROMIND_AUTO_CREATE_SCHEMA=true
export AEROMIND_ALLOWED_HOSTS="localhost,127.0.0.1"
export AEROMIND_ALLOWED_ORIGINS="http://localhost:${AEROMIND_PORT}"

python3 -m uvicorn web.app:app --host 0.0.0.0 --port "${AEROMIND_PORT}" \
  >"${UVICORN_LOG}" 2>&1 &
UVICORN_PID=$!

# Attendre que le backend soit prêt
log "Attente backend AeroMind (jusqu'à 30 s)..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${AEROMIND_PORT}/api/ready" >/dev/null 2>&1; then
    ok "Backend prêt après ${i}s"
    break
  fi
  sleep 1
  [[ $i -eq 30 ]] && {
    err "Backend n'a pas démarré. Voir logs/uvicorn-hil.log"
    tail -30 "${UVICORN_LOG}" >&2 || true
    exit 4
  }
done

# === Lancer le validateur ===

log "Lancement du validateur HIL..."
HIL_REPORT=$(python3 "${SCRIPT_DIR}/hil_validation.py" \
  --aeromind-url "http://127.0.0.1:${AEROMIND_PORT}" \
  --mavlink-url "udpout:127.0.0.1:${SITL_PORT}" \
  --home-lat "${SITL_HOME_LAT}" \
  --home-lon "${SITL_HOME_LON}" 2>&1)
EXIT_CODE=$?

echo "${HIL_REPORT}"

if [[ ${EXIT_CODE} -eq 0 ]]; then
  ok "${BOLD}Validation HIL réussie — les 8 tests passent.${RESET}"
  ok "AeroMind peut activer HARDWARE_CONTROL=true en confiance post-HIL."
else
  err "${BOLD}Validation HIL échouée.${RESET}"
  err "Voir le rapport ci-dessus + logs/sitl.log + logs/uvicorn-hil.log."
fi

if [[ "${HIL_KEEP_RUNNING}" == "1" ]]; then
  warn "HIL_KEEP_RUNNING=1 — SITL (PID ${SITL_PID}) et backend (PID ${UVICORN_PID}) restent actifs."
  warn "UI disponible sur http://localhost:${AEROMIND_PORT}/labbench → zone 04 → Hardware"
  warn "Tuez-les avec : kill ${SITL_PID} ${UVICORN_PID}"
  trap - EXIT INT TERM
fi

exit ${EXIT_CODE}
