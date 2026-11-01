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
# ``_geofences`` uses composite keys to prevent cross-tenant cache poisoning.
# The public read accessor is :func:`list_cached_geofences`; new callers MUST
# use it instead of touching ``_geofences`` directly so the storage backend
# can be swapped (DB / Redis / shared multi-worker) without breaking consumers.
_geofences: dict[tuple[str, str | None], "Geofence"] = {}
_geofence_lock = RLock()

# Public stable read interface — EXIGENCE P0-01
def list_cached_geofences(*, owner_id: str | None = None) -> dict[str, "Geofence"]:
    """Return cached geofences for exactly one owner scope.

    Stable public read accessor — P0-01 fix.
    Returns a *copy* so callers cannot mutate the live cache via this API.
    With ``owner_id=None``, only unowned development/test fixtures are visible.
    """
    with _geofence_lock:
        return {
            project_id: geofence
            for (project_id, cached_owner_id), geofence in _geofences.items()
            if cached_owner_id == owner_id
        }


def set_geofence_for_testing(
    geofence: Geofence, *, owner_id: str | None = None
) -> Geofence:
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
        _geofences[(geofence.project_id, owner_id)] = geofence
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
    P1-07 fix — cache key is now (project_id, owner_id) to prevent cross-tenant
    cache poisoning (was keyed by project_id only, leaking geofence polygons).
    """
    if not isinstance(project_id, str) or not project_id.strip():
        return None
    project_id = project_id.strip()
    if owner_id is not None:
        owner_id = owner_id.strip() or None

    # Try cache first (hot path) — P1-07: key includes owner_id
    cache_key = (project_id, owner_id)
    with _geofence_lock:
        cached = _geofences.get(cache_key)
        if cached is not None:
            return cached

    # Only explicit development/test fixtures may be read without an owner.
    # Owner-bound database records are never accessible through an unscoped call.
    if owner_id is None:
        return None

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
                _geofences[cache_key] = geofence  # P1-07: composite key
            return geofence
    except Exception:
        # DB not available — return None (fail-closed)
        return None


def set_geofence(geofence: Geofence, *, owner_id: str) -> Geofence:
    """Persist a geofence to the DB, bound to the project owner.

    SEC-04 fix — owner_id is REQUIRED, no anonymous geofence allowed.
    The cache is updated atomically.
    """
    if not geofence.project_id.strip() or not owner_id.strip():
        raise ValueError("project_id and authenticated owner_id are required")
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
            _geofences[(geofence.project_id, owner_id)] = geofence
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
        _geofences.pop((project_id, owner_id), None)
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
# Emergency landing — one authenticated NAV_LAND target, never a broadcast.
# ---------------------------------------------------------------------------
def emergency_stop_all(
    pool, *, owner_id: str | None = None, project_id: str | None = None,
    drone_id: str | None = None, actor_id: str | None = None,
    confirmation_token: str | None = None,
    audit_logger: Callable[[str, str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Request one owner/project-scoped emergency landing, not a motor cut-off.

    Missing target/auth/project/token is rejected before any pool method.
    """
    if (
        owner_id is None or not owner_id.strip()
        or project_id is None or not project_id.strip()
        or drone_id is None or not drone_id.strip()
        or actor_id is None or not actor_id.strip()
        or confirmation_token is None or not confirmation_token.strip()
        or actor_id != owner_id
    ):
        return {"landed": False, "reason": "Contexte ciblé/authentifié requis; aucune action effectuée.", "results": []}
    if not hardware_commands_enabled():
        return {"landed": False, "reason": "HARDWARE_CONTROL n'est pas 'true'; atterrissage refusé (fail-closed).", "results": []}
    event_id = str(uuid4())
    triggered_at = datetime.now(UTC).isoformat()
    try:
        pilot = pool.pilot(drone_id, owner_id=owner_id, project_id=project_id)
        receipt = pilot.send_emergency_land(
            confirmation_token=confirmation_token, project_id=project_id,
            drone_id=drone_id, actor_id=actor_id, parameters=build_land_params(),
        )
        result = {"droneId": drone_id, "sent": receipt.sent_to_hardware,
                  "reason": receipt.reason, "receiptId": receipt.receipt_id}
        if audit_logger is not None:
            audit_logger(drone_id, "labbench.hardware.emergency_landing", {
                "scope": "hardware-emergency-landing", "droneId": drone_id,
                "projectId": project_id, "actorId": actor_id,
                "physicalOutputEnabled": receipt.sent_to_hardware,
                "physicalCommandsEmitted": receipt.sent_to_hardware,
                "eventId": event_id, "triggeredAt": triggered_at,
                "command": "NAV_LAND", "reason": receipt.reason,
            })
        return {"landed": receipt.sent_to_hardware, "eventId": event_id,
                "triggeredAt": triggered_at, "command": "NAV_LAND",
                "meaning": "Atterrissage; pas une coupure moteurs.", "results": [result]}
    except Exception as exc:
        return {"landed": False, "eventId": event_id, "triggeredAt": triggered_at,
                "command": "NAV_LAND", "results": [{"droneId": drone_id,
                "sent": False, "reason": f"{getattr(exc, 'code', type(exc).__name__)}: {exc}"}]}
