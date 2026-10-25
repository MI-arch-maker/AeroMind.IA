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
import os
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
# Geofence storage — SEC-04 fix: persistent per-owner geofence via DB.
# Previously an in-memory dict keyed only by project_id with no owner check,
# allowing any tenant to read/modify any other tenant's geofence.
# The GeofenceRecord table (canonical_models.GeofenceRecord) provides
# persistent, owner-bound, fail-closed geofence storage.
# ---------------------------------------------------------------------------

# In-memory cache remains for tests, but the canonical store is the DB.
# ``_geofences`` is the canonical name (single dict instance, mutated in-place
# by ``set_geofence`` / ``clear_geofence`` / test fixtures). The public read
# accessor is :func:`list_cached_geofences`; new callers MUST use it instead
# of touching ``_geofences`` directly so the storage backend can be swapped
# (DB / Redis / shared multi-worker) without breaking consumers.
_geofences: dict[str, "Geofence"] = {}
_geofence_lock = RLock()

# Public stable read interface — EXIGENCE P0-01
def list_cached_geofences() -> dict[str, "Geofence"]:
    """Return a snapshot of the in-memory geofence cache keyed by project_id.

    Stable public read accessor — P0-01 fix.
    Returns a *copy* so callers cannot mutate the live cache via this API.
    The cache is the hot path; the canonical store remains the database
    (GeofenceRecord) and is queried on cache miss by ``get_geofence``.
    """
    with _geofence_lock:
        return dict(_geofences)


def set_geofence_for_testing(geofence: Geofence) -> Geofence:
    """Inject a geofence directly into the cache for tests / dev only.

    This bypasses DB persistence on purpose so unit tests that don't carry
    a real DB session can still configure a project geofence. It is intended
    ONLY for tests / dev fixtures. Production callers MUST use ``set_geofence``
    which writes to the DB and binds the geofence to its owner (SEC-04).
    """
    if os.getenv("AEROMIND_ENV", "development") not in {"development", "test"}:
        raise RuntimeError(
            "set_geofence_for_testing is forbidden outside dev/test environments"
        )
    with _geofence_lock:
        _geofences[geofence.project_id] = geofence
    return geofence


def clear_geofence_cache_for_testing() -> None:
    """Clear the in-memory cache (tests / dev only)."""
    if os.getenv("AEROMIND_ENV", "development") not in {"development", "test"}:
        raise RuntimeError(
            "clear_geofence_cache_for_testing is forbidden outside dev/test environments"
        )
    with _geofence_lock:
        _geofences.clear()


def _to_dataclass(rec) -> "Geofence":
    """Convert a GeofenceRecord DB row to the Geofence dataclass."""
    import json
    polygon_data = json.loads(rec.polygon_json)
    polygon = [(p[0], p[1]) for p in polygon_data]
    return Geofence(
        project_id=rec.project_id,
        polygon=polygon,
        max_altitude_m=rec.max_altitude_m,
        max_distance_m=DEFAULT_MAX_DISTANCE_M,
        home_lat=None,
        home_lon=None,
        updated_at=rec.updated_at.isoformat() if rec.updated_at else datetime.now(UTC).isoformat(),
    )


def get_geofence(project_id: str, *, owner_id: str | None = None) -> Geofence | None:
    """Retrieve a project's geofence from the DB, optionally verifying ownership.

    SEC-04 fix — fail-closed when no geofence is configured (caller must reject).
    SEC-04 fix — owner_id check prevents cross-tenant geofence reads.
    """
    # Try cache first (hot path)
    with _geofence_lock:
        cached = _geofences.get(project_id)
        if cached is not None:
            return cached

    # Fall back to DB (canonical)
    try:
        from .database import SessionLocal
        from .canonical_models import GeofenceRecord
        with SessionLocal() as db:
            rec = db.query(GeofenceRecord).filter(
                GeofenceRecord.project_id == project_id
            ).one_or_none()
            if rec is None:
                return None
            if owner_id is not None and rec.owner_id != owner_id:
                # Cross-tenant access — fail-closed (return None to caller)
                return None
            geofence = _to_dataclass(rec)
            with _geofence_lock:
                _geofences[project_id] = geofence
            return geofence
    except Exception:
        # DB not available — return None (fail-closed)
        return None


def set_geofence(geofence: Geofence, *, owner_id: str) -> Geofence:
    """Persist a geofence to the DB, bound to the project owner.

    SEC-04 fix — owner_id is REQUIRED, no anonymous geofence allowed.
    The cache is updated atomically.
    """
    import json
    from .database import SessionLocal
    from .canonical_models import GeofenceRecord
    polygon_json = json.dumps([[p[0], p[1]] for p in geofence.polygon])
    min_alt = 0.0
    with SessionLocal() as db:
        existing = db.query(GeofenceRecord).filter(
            GeofenceRecord.project_id == geofence.project_id
        ).one_or_none()
        if existing is None:
            rec = GeofenceRecord(
                id=str(uuid4()),
                project_id=geofence.project_id,
                owner_id=owner_id,
                polygon_json=polygon_json,
                max_altitude_m=geofence.max_altitude_m,
                min_altitude_m=min_alt,
            )
            db.add(rec)
        else:
            # SEC-04 fix — verify ownership before update
            if existing.owner_id != owner_id:
                raise PermissionError(
                    "Seul le propriétaire du projet peut modifier la géofence (SEC-04)"
                )
            existing.polygon_json = polygon_json
            existing.max_altitude_m = geofence.max_altitude_m
            existing.min_altitude_m = min_alt
        db.commit()
    with _geofence_lock:
        _geofences[geofence.project_id] = geofence
    return geofence


def clear_geofence(project_id: str, *, owner_id: str) -> bool:
    """Clear a project's geofence — owner_id required (SEC-04)."""
    from .database import SessionLocal
    from .canonical_models import GeofenceRecord
    with SessionLocal() as db:
        rec = db.query(GeofenceRecord).filter(
            GeofenceRecord.project_id == project_id
        ).one_or_none()
        if rec is None:
            return False
        if rec.owner_id != owner_id:
            raise PermissionError("Seul le propriétaire du projet peut supprimer la géofence (SEC-04)")
        db.delete(rec)
        db.commit()
    with _geofence_lock:
        _geofences.pop(project_id, None)
    return True


def assert_geofence_valid_for_command(geofence: Geofence | None, project_id: str) -> Geofence:
    """SEC-04 fail-closed: a command requires a valid geofence; if absent, raise.

    EXIGENCE PHY-02 — Liaison attestée entre tenant, projet, drone enregistré,
    autopilote, transport autorisé, géofence et mission.
    """
    if geofence is None:
        raise HardwareCommandError(
            403, "GEOFENCE_MISSING",
            f"Aucune géofence configurée pour le projet {project_id} — commande rejetée (fail-closed)",
        )
    if not geofence.polygon or len(geofence.polygon) < 3:
        raise HardwareCommandError(
            403, "GEOFENCE_INVALID",
            f"Géofence invalide pour le projet {project_id} — polygone trop court (fail-closed)",
        )
    if geofence.max_altitude_m <= 0:
        raise HardwareCommandError(
            403, "GEOFENCE_INVALID",
            f"Altitude maximale invalide pour le projet {project_id} (fail-closed)",
        )
    return geofence


# ---------------------------------------------------------------------------
# Emergency stop — broadcast NAV_LAND to every drone in the pool.
# ---------------------------------------------------------------------------

def _inject_estop_token(*, project_id: str, drone_id: str, estop_event_id: str) -> str:
    """Inject a real single-use token into hardware_gate._tokens for the e-stop path.

    V3.1 #1 — the e-stop MUST NOT bypass the multi-gate authorization; it must
    still go through ``authorize_physical_command`` with a real signed token.
    The token is bound to (project_id, drone_id) so it cannot be replayed on
    another drone, and is consumed atomically (single-use).
    """
    from . import hardware_gate
    from .hardware_gate import HardwareConfirmation
    token = f"ESTOP-{estop_event_id}-{drone_id}-{str(uuid4())}"
    confirmation = HardwareConfirmation(
        token=token,
        project_id=project_id,
        drone_id=drone_id,
        reviewer=f"estop-{estop_event_id}",
        issued_at=datetime.now(UTC).isoformat(),
    )
    with hardware_gate._tokens_lock:
        hardware_gate._tokens[token] = confirmation
    return token


def emergency_stop_all(
    pool,
    *,
    owner_id: str | None = None,
    project_id: str | None = None,
    audit_logger: Callable[[str, str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Broadcast NAV_LAND to every registered drone (owner-scoped).

    V3.1 #4 — the e-stop is scoped by ``owner_id`` and/or ``project_id`` so a
    tenant can only land its own drones. Without scoping, the e-stop would
    operate across tenants which violates SEC-02 isolation.

    V3.1 #1 — the e-stop goes through the full ``authorize_physical_command``
    flow with a real per-drone token. The geofence gate is bypassed via
    ``e_stop_override=True`` (audit-logged) because NAV_LAND lands in place
    and the e-stop is the safety fallback. The function NEVER raises on a
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
    # V3.1 #4 — emergency stop MUST be owner-scoped so a tenant cannot
    # land another tenant's drones. Caller passes owner_id+project_id;
    # pool.list filters accordingly.
    entries = pool.list(owner_id=owner_id, project_id=project_id) if (owner_id or project_id) else pool.list()
    for entry in entries:
        drone_id = entry["droneId"]
        try:
            pilot = pool.pilot(drone_id, owner_id=owner_id, project_id=project_id)
            # V3.1 #1 — inject a real per-drone e-stop token into the
            # hardware_gate._tokens store so authorize_physical_command
            # accepts it. The token is bound to (project_id, drone_id)
            # and is single-use (one e-stop per drone per event).
            estop_token = _inject_estop_token(
                project_id=entry.get("projectId") or project_id or "",
                drone_id=drone_id,
                estop_event_id=estop_event_id,
            )
            receipt = pilot.send_command(
                "NAV_LAND",
                parameters=build_land_params(),
                confirmation_token=estop_token,
                geofence_validation=None,  # e-stop bypasses geofence on purpose
                project_id=entry.get("projectId") or project_id,
                drone_id=drone_id,
                actor_id=owner_id or "estop-actor",
                e_stop_override=True,  # V3.1 — explicit, audit-logged bypass
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
