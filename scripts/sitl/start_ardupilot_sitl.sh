#!/usr/bin/env bash
set -euo pipefail
# ArduPilot emits MAVLink to the router input only. No AeroMind command path is opened.
: "${ARDUPILOT_ROOT:=${HOME}/ardupilot}"
: "${VEHICLE:=ArduCopter}"
: "${SITL_OUT:=127.0.0.1:14600}"
if [[ ! -x "${ARDUPILOT_ROOT}/Tools/autotest/sim_vehicle.py" ]]; then
  echo "ArduPilot SITL introuvable: ${ARDUPILOT_ROOT}/Tools/autotest/sim_vehicle.py" >&2
  echo "Installer ArduPilot depuis https://github.com/ArduPilot/ardupilot puis définir ARDUPILOT_ROOT." >&2
  exit 2
fi
exec "${ARDUPILOT_ROOT}/Tools/autotest/sim_vehicle.py" -v "${VEHICLE}" --console --map --out="${SITL_OUT}" "$@"
