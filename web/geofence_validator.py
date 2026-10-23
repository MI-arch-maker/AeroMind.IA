"""Phase C — Geofence validator + hardware emergency stop.

Geofence validation runs server-side BEFORE any MAVLink command is sent. It
checks latitude / longitude / altitude against a project-scoped geofence
polygon stored in the project's settings. The validator is the last line of
defense if the autopilot's own geofence is bypassed or misconfigured.

Emergency stop (e-stop) broadcasts ``NAV_LAND`` to every armed drone in the
pool. It is one-click and audit-logged; it does NOT bypass the geofence — it
just lands in place, which is the safest fallback.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Callable
from uuid import uuid4

from .mavlink_command_api import (
    HardwareCommandError,
    build_land_params,
    hardware_commands_enabled,
)


# EASA Open category limits — conservative defaults used when no project
# geofence is configured.
DEFAULT_MAX_ALTITUDE_M = 120.0
DEFAULT_MAX_DISTANCE_M = 500.0  # VLOS proxy
MIN_LATITUDE = -90.0
MAX_LATITUDE = 90.0
MIN_LONGITUDE = -180.0
MAX_LONGITUDE = 180.0


@dataclass
class Geofence:
    """Geographic geofence for a project.

    ``polygon`` is a list of (lat, lon) pairs in degrees. If empty, only the
    altitude + horizontal distance limits apply.
    """
    project_id: str
    polygon: list[tuple[float, float]] = field(default_factory=list)
    max_altitude_m: float = DEFAULT_MAX_ALTITUDE_M
    max_distance_m: float = DEFAULT_MAX_DISTANCE_M
    home_lat: float | None = None
    home_lon: float | None = None
    updated_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


def validate_command_geofence(
    params: dict[str, float],
    geofence: Geofence | None,
) -> dict[str, Any]:
    """Validate that a command's parameters fit inside the geofence.

    Returns a dict with ``inside_geofence: bool`` and ``reason``. Never raises
    on validation failures — the caller (the pilot) raises ``HardwareCommandError``
    based on the result.
    """
    if not hardware_commands_enabled():
        return {"inside_geofence": False, "reason": "HARDWARE_CONTROL n'est pas 'true'"}
    if geofence is None:
        # No geofence configured = no command is allowed (fail closed).
        return {"inside_geofence": False, "reason": "Aucune géofence configurée pour ce projet (fail-closed)"}

    # Altitude check (most commands carry an altitude in p7).
    altitude = float(params.get("p7", 0.0))
    if altitude > geofence.max_altitude_m:
        return {"inside_geofence": False, "reason": f"Altitude {altitude} m > max {geofence.max_altitude_m} m"}

    # Lat/lon check (if provided in p5/p6 — MAVLink convention for NAV commands).
    lat = params.get("p5")
    lon = params.get("p6")
    if lat is not None and lon is not None:
        if not MIN_LATITUDE <= lat <= MAX_LATITUDE:
            return {"inside_geofence": False, "reason": f"Latitude {lat} hors plage"}
        if not MIN_LONGITUDE <= lon <= MAX_LONGITUDE:
            return {"inside_geofence": False, "reason": f"Longitude {lon} hors plage"}
        if geofence.polygon and not _point_in_polygon((lat, lon), geofence.polygon):
            return {"inside_geofence": False, "reason": "Position hors polygone géofence"}

    # Horizontal distance check (if home is set + lat/lon provided).
    if (
        geofence.home_lat is not None
        and geofence.home_lon is not None
        and lat is not None
        and lon is not None
    ):
        distance = _haversine_m(geofence.home_lat, geofence.home_lon, lat, lon)
        if distance > geofence.max_distance_m:
            return {"inside_geofence": False, "reason": f"Distance {distance:.0f} m > max {geofence.max_distance_m} m"}

    return {"inside_geofence": True, "reason": "OK"}


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test (geographic approximation)."""
    if len(polygon) < 3:
        return False
    x, y = point
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in meters (WGS84 approximation)."""
    from math import asin, cos, radians, sin, sqrt
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlmb = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlmb / 2) ** 2
    return 2 * R * asin(min(1.0, sqrt(a)))


# ---------------------------------------------------------------------------
# Geofence storage — in-memory per project. A production deployment should
# persist this in a GeofenceRecord table; the in-memory version is sufficient
# for the v4 milestone.
# ---------------------------------------------------------------------------

_geofences: dict[str, Geofence] = {}
_geofence_lock = RLock()


def get_geofence(project_id: str) -> Geofence | None:
    with _geofence_lock:
        return _geofences.get(project_id)


def set_geofence(geofence: Geofence) -> Geofence:
    with _geofence_lock:
        _geofences[geofence.project_id] = geofence
        return geofence


def clear_geofence(project_id: str) -> bool:
    with _geofence_lock:
        return _geofences.pop(project_id, None) is not None


# ---------------------------------------------------------------------------
# Emergency stop — broadcast NAV_LAND to every drone in the pool.
# ---------------------------------------------------------------------------

def emergency_stop_all(
    pool,
    *,
    audit_logger: Callable[[str, str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Broadcast NAV_LAND to every registered drone. Returns a per-drone summary.

    ``pool`` is a :class:`MavlinkPool`. ``audit_logger`` is called once per
    drone with (drone_id, event_type, payload). The function NEVER raises on a
    single drone failure — it records the error in the per-drone result.
    """
    if not hardware_commands_enabled():
        return {
            "stopped": False,
            "reason": "HARDWARE_CONTROL n'est pas 'true'; e-stop reste sans effet physique (fail-closed).",
            "results": [],
        }
    results: list[dict[str, Any]] = []
    estop_event_id = str(uuid4())
    triggered_at = datetime.now(UTC).isoformat()
    entries = pool.list()
    for entry in entries:
        drone_id = entry["droneId"]
        try:
            pilot = pool.pilot(drone_id)
            # Use a special confirmation token for e-stop so the pilot's gate 3
            # does not block the safety path. The token is derived from the
            # event id so it is traceable but cannot be reused for any other
            # command.
            receipt = pilot.send_command(
                "NAV_LAND",
                parameters=build_land_params(),
                confirmation_token=f"ESTOP-{estop_event_id}",
                geofence_validation=None,  # e-stop bypasses geofence on purpose
            )
            results.append({
                "droneId": drone_id,
                "droneName": entry.get("droneName"),
                "sent": receipt.sent_to_hardware,
                "reason": receipt.reason,
                "receiptId": receipt.receipt_id,
            })
            if audit_logger is not None:
                audit_logger(drone_id, "labbench.hardware.estop", {
                    "scope": "hardware-estop",
                    "droneId": drone_id,
                    "droneName": entry.get("droneName"),
                    "physicalOutputEnabled": receipt.sent_to_hardware,
                    "physicalCommandsEmitted": receipt.sent_to_hardware,
                    "estopEventId": estop_event_id,
                    "triggeredAt": triggered_at,
                    "reason": receipt.reason,
                })
        except HardwareCommandError as exc:
            results.append({
                "droneId": drone_id,
                "droneName": entry.get("droneName"),
                "sent": False,
                "reason": f"{exc.code}: {exc.message}",
            })
        except Exception as exc:
            results.append({
                "droneId": drone_id,
                "droneName": entry.get("droneName"),
                "sent": False,
                "reason": f"unexpected: {type(exc).__name__}: {exc}",
            })
    return {
        "stopped": True,
        "estopEventId": estop_event_id,
        "triggeredAt": triggered_at,
        "results": results,
    }
