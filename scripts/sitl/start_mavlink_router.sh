#!/usr/bin/env bash
set -euo pipefail
# One SITL input fan-outs to QGroundControl and AeroMind observer.
: "${MAVLINK_ROUTER_BIN:=mavlink-routerd}"
: "${ROUTER_INPUT:=127.0.0.1:14600}"
: "${QGC_ENDPOINT:=127.0.0.1:14550}"
: "${AEROMIND_ENDPOINT:=127.0.0.1:14551}"
command -v "${MAVLINK_ROUTER_BIN}" >/dev/null || { echo "mavlink-routerd introuvable" >&2; exit 2; }
exec "${MAVLINK_ROUTER_BIN}" -e "${QGC_ENDPOINT}" -e "${AEROMIND_ENDPOINT}" "${ROUTER_INPUT}"
