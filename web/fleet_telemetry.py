"""Real-time fleet telemetry aggregator (SSE) + persistence + alerts.

Polls each drone's MavlinkObserver in the pool and emits an aggregated JSON
snapshot every ~500ms via Server-Sent Events. The frontend radar subscribes
to /api/hardware/fleet/telemetry/stream to render drones in real-time.

v7 additions:
  - Persisted telemetry samples (FleetTelemetrySample) — one row every 2 s per drone,
    capped at MAX_SAMPLES_PER_DRONE per drone (rolling window).
  - Multi-project geofence filter — the stream accepts ?projectId=... and uses
    the matching geofence (not the global last-set one).
  - Server-side alert evaluation — low battery, geofence breach, heartbeat lost
    are raised as AlertEvent rows + included in the SSE stream under `alerts`.
  - History endpoint to fetch persisted samples for the replay mode.

The stream is owner-scoped: only drones registered in the pool are included.
Telemetry is read-only — this module never sends a MAVLink command.
"""

from __future__ import annotations

import asyncio
import json
import math
from datetime import UTC, datetime, timedelta
from typing import Any, AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .app_auth_helpers import current_user
from .database import SessionLocal
from .mavlink_command_api import hardware_commands_enabled
from .mavlink_pool import get_pool
from .mavlink_observer import MavlinkObserver
from .models import AlertEvent, FleetTelemetrySample
from . import geofence_validator as geo
from . import alerts as alert_service


router = APIRouter(prefix="/api/hardware/fleet", tags=["fleet-telemetry"])

REFRESH_INTERVAL_S = 0.5  # 2 Hz stream
PERSIST_INTERVAL_S = 2.0  # 0.5 Hz persistence (1 row / 2 s / drone)
MAX_SAMPLES_PER_DRONE = 500  # ~17 min history at 0.5 Hz, ~33 min at 0.25 Hz

# In-memory "last persisted time per drone" so we don't write a row on every
# stream tick (which would be 4 rows/s per drone).
_last_persisted: dict[str, datetime] = {}
# In-memory "last heartbeat time per drone" for heartbeat-lost alerts.
_last_heartbeat: dict[str, datetime] = {}
# In-memory alert state to avoid raising the same alert twice in a row.
_alert_state: dict[str, dict[str, Any]] = {}


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
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


def _haversine_xy_m(lat: float, lon: float, home_lat: float, home_lon: float) -> tuple[float, float]:
    """Equirectangular approximation (fine for < 1 km distances)."""
    dlat = lat - home_lat
    dlon = (lon - home_lon) * math.cos(math.radians(home_lat))
    x_m = dlon * 111_000.0
    y_m = dlat * 111_000.0
    return x_m, y_m


def _geofence_for_project(project_id: str | None) -> Any:
    """v7: filter geofence by project_id, fall back to last-set.

    P0-01 fix — uses the stable public read accessor
    :func:`geofence_validator.list_cached_geofences` instead of poking at the
    private ``geo._geofences`` dict so the storage backend can be swapped
    (DB / Redis / shared multi-worker) without breaking fleet telemetry.
    """
    cache = geo.list_cached_geofences()
    if project_id and project_id in cache:
        return cache[project_id]
    # Fallback: last-set geofence (MVP behaviour — backwards compatible)
    if not cache:
        return None
    return list(cache.values())[-1]


def _drone_snapshot(drone_id: str, drone_name: str, observer: MavlinkObserver, geofence: Any) -> dict[str, Any]:
    try:
        snap = observer.poll(max_messages=50)
    except Exception as exc:
        return {
            "droneId": drone_id,
            "droneName": drone_name,
            "connected": False,
            "error": f"{type(exc).__name__}: {exc}",
        }

    pos = snap.position or {}
    lat = pos.get("latitude_deg")
    lon = pos.get("longitude_deg")
    alt = pos.get("altitude_m")
    rel_alt = pos.get("relative_altitude_m")

    hb = snap.heartbeat
    base_mode = hb.base_mode or 0
    armed = bool(base_mode & 128)

    battery = snap.battery or {}

    x_m = y_m = None
    if lat is not None and lon is not None and geofence and geofence.home_lat is not None:
        x_m, y_m = _haversine_xy_m(lat, lon, geofence.home_lat, geofence.home_lon)

    inside_geofence = True
    if geofence and lat is not None and lon is not None and geofence.polygon:
        inside_geofence = _point_in_polygon((lat, lon), geofence.polygon)
    altitude_ok = True
    if geofence and rel_alt is not None:
        altitude_ok = rel_alt <= geofence.max_altitude_m

    return {
        "droneId": drone_id,
        "droneName": drone_name,
        "connected": snap.connected,
        "armed": armed,
        "position": {
            "latitude_deg": lat,
            "longitude_deg": lon,
            "altitude_m": alt,
            "relative_altitude_m": rel_alt,
        },
        "x_m": x_m,
        "y_m": y_m,
        "battery_remaining_pct": battery.get("battery_remaining"),
        "voltage_v": battery.get("voltage_battery"),
        "current_a": battery.get("current_battery"),
        "flight": snap.flight or {},
        "gps": snap.gps or {},
        "inside_geofence": inside_geofence,
        "altitude_ok": altitude_ok,
        "last_heartbeat_at": hb.received_at,
        "messages_received": snap.messages_received,
    }


def _persist_sample(db: Session, project_id: str | None, drone_id: str, drone_name: str, snap: dict[str, Any]) -> None:
    """Persist a telemetry sample every PERSIST_INTERVAL_S per drone."""
    now = datetime.now(UTC)
    last = _last_persisted.get(drone_id)
    if last is not None and (now - last).total_seconds() < PERSIST_INTERVAL_S:
        return
    _last_persisted[drone_id] = now
    pos = snap.get("position") or {}
    sample = FleetTelemetrySample(
        project_id=project_id,
        drone_id=drone_id,
        drone_name=drone_name,
        sample_time=now,
        latitude_deg=pos.get("latitude_deg"),
        longitude_deg=pos.get("longitude_deg"),
        altitude_m=pos.get("altitude_m"),
        relative_altitude_m=pos.get("relative_altitude_m"),
        x_m=snap.get("x_m"),
        y_m=snap.get("y_m"),
        heading_deg=(snap.get("flight") or {}).get("heading"),
        battery_remaining_pct=snap.get("battery_remaining_pct"),
        voltage_v=snap.get("voltage_v"),
        current_a=snap.get("current_a"),
        armed=bool(snap.get("armed")),
        connected=bool(snap.get("connected")),
        inside_geofence=bool(snap.get("inside_geofence")),
        altitude_ok=bool(snap.get("altitude_ok")),
        payload_json=json.dumps({"messages_received": snap.get("messages_received")}, ensure_ascii=False),
    )
    db.add(sample)
    # Trim history per drone.
    count = db.scalar(
        select(FleetTelemetrySample).where(FleetTelemetrySample.drone_id == drone_id)
    )
    # Light trim: only every 50 samples to avoid SQL on every tick.
    if int(_last_persisted.get(drone_id, now).timestamp()) % 50 == 0:
        # Delete oldest samples beyond MAX_SAMPLES_PER_DRONE
        old_rows = db.scalars(
            select(FleetTelemetrySample)
            .where(FleetTelemetrySample.drone_id == drone_id)
            .order_by(desc(FleetTelemetrySample.sample_time))
            .offset(MAX_SAMPLES_PER_DRONE)
        ).all()
        for row in old_rows:
            db.delete(row)
    db.commit()


def _evaluate_alerts(db: Session, project_id: str | None, drone_id: str, drone_name: str, snap: dict[str, Any]) -> list[dict[str, Any]]:
    """Check battery, geofence, heartbeat. Returns new alerts raised this tick."""
    new_alerts: list[dict[str, Any]] = []
    state = _alert_state.setdefault(drone_id, {})

    # Low battery alert (warning at <30%, critical at <15%)
    battery = snap.get("battery_remaining_pct")
    if battery is not None and snap.get("connected"):
        if battery < 15 and not state.get("battery_critical"):
            alert = alert_service.raise_alert(db, project_id, drone_id, drone_name,
                alert_type="battery_critical", severity="critical",
                message=f"Batterie critique: {battery:.0f}%",
                payload={"battery_pct": battery})
            new_alerts.append({"alertId": alert["id"], "type": "battery_critical", "droneName": drone_name, "battery": battery})
            state["battery_critical"] = True
            state["battery_warning"] = True
        elif battery < 30 and not state.get("battery_warning"):
            alert = alert_service.raise_alert(db, project_id, drone_id, drone_name,
                alert_type="battery_low", severity="warning",
                message=f"Batterie faible: {battery:.0f}%",
                payload={"battery_pct": battery})
            new_alerts.append({"alertId": alert["id"], "type": "battery_low", "droneName": drone_name, "battery": battery})
            state["battery_warning"] = True
        elif battery > 35:
            state.pop("battery_warning", None)
            state.pop("battery_critical", None)

    # Geofence breach
    if snap.get("connected") and not snap.get("inside_geofence") and not state.get("geofence_breach"):
        alert = alert_service.raise_alert(db, project_id, drone_id, drone_name,
            alert_type="geofence_breach", severity="critical",
            message=f"{drone_name} hors géofence",
            payload={"position": snap.get("position")})
        new_alerts.append({"alertId": alert["id"], "type": "geofence_breach", "droneName": drone_name})
        state["geofence_breach"] = True
    elif snap.get("inside_geofence"):
        state.pop("geofence_breach", None)

    # Altitude breach
    if snap.get("connected") and not snap.get("altitude_ok") and not state.get("altitude_breach"):
        alert = alert_service.raise_alert(db, project_id, drone_id, drone_name,
            alert_type="altitude_breach", severity="critical",
            message=f"{drone_name} au-dessus de l'altitude max",
            payload={"relative_altitude_m": (snap.get("position") or {}).get("relative_altitude_m")})
        new_alerts.append({"alertId": alert["id"], "type": "altitude_breach", "droneName": drone_name})
        state["altitude_breach"] = True
    elif snap.get("altitude_ok"):
        state.pop("altitude_breach", None)

    # Heartbeat lost (was connected before, now disconnected)
    if snap.get("connected"):
        _last_heartbeat[drone_id] = datetime.now(UTC)
        state.pop("heartbeat_lost", None)
    elif drone_id in _last_heartbeat and not state.get("heartbeat_lost"):
        elapsed = (datetime.now(UTC) - _last_heartbeat[drone_id]).total_seconds()
        if elapsed > 10:
            alert = alert_service.raise_alert(db, project_id, drone_id, drone_name,
                alert_type="heartbeat_lost", severity="critical",
                message=f"Perte de heartbeat {drone_name} (depuis {elapsed:.0f}s)",
                payload={"elapsed_s": elapsed})
            new_alerts.append({"alertId": alert["id"], "type": "heartbeat_lost", "droneName": drone_name, "elapsed_s": elapsed})
            state["heartbeat_lost"] = True

    return new_alerts


def fleet_snapshot_sync(user_id: str | None, project_id: str | None = None) -> dict[str, Any]:
    """One-shot snapshot — used for the initial render + tests + REST endpoint."""
    pool = get_pool()
    geofence = _geofence_for_project(project_id)
    drones_out: list[dict[str, Any]] = []
    recent_alerts: list[dict[str, Any]] = []
    try:
        with SessionLocal() as db:
            for entry in pool.list():
                try:
                    observer = pool.observer(entry["droneId"])
                    snap = _drone_snapshot(entry["droneId"], entry["droneName"], observer, geofence)
                    # v7: persist sample + evaluate alerts (silent — only on real data)
                    if snap.get("connected") or snap.get("position", {}).get("latitude_deg") is not None:
                        try:
                            _persist_sample(db, project_id, entry["droneId"], entry["droneName"], snap)
                            _evaluate_alerts(db, project_id, entry["droneId"], entry["droneName"], snap)
                        except Exception:
                            pass  # don't fail the stream on DB error
                    drones_out.append(snap)
                except Exception as exc:
                    drones_out.append({
                        "droneId": entry["droneId"],
                        "droneName": entry["droneName"],
                        "connected": False,
                        "error": f"{type(exc).__name__}: {exc}",
                    })
            # v7: include recent unacknowledged alerts (silent if schema not yet created)
            try:
                recent_alerts = alert_service.list_recent_alerts(db, project_id=project_id, limit=20)
            except Exception:
                recent_alerts = []
    except Exception:
        # DB unavailable — return snapshot with empty alerts (tests/migration scenarios)
        recent_alerts = []
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "hardwareControlEnabled": hardware_commands_enabled(),
        "poolSize": len(drones_out),
        "geofenceConfigured": geofence is not None,
        "homeLat": geofence.home_lat if geofence else None,
        "homeLon": geofence.home_lon if geofence else None,
        "maxAltitudeM": geofence.max_altitude_m if geofence else None,
        "drones": drones_out,
        "alerts": recent_alerts,
    }


@router.get("/telemetry/snapshot")
def fleet_snapshot_endpoint(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    project_id = request.query_params.get("projectId")
    return JSONResponse(fleet_snapshot_sync(user["id"], project_id), headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.get("/telemetry/stream")
async def fleet_stream_endpoint(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """SSE stream of fleet telemetry. Emits a snapshot every REFRESH_INTERVAL_S.

    v7: accepts ?projectId=... to filter geofence by project (multi-project).
    """
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    project_id = request.query_params.get("projectId")

    async def event_stream() -> AsyncIterator[str]:
        snapshot = fleet_snapshot_sync(user["id"], project_id)
        yield f"data: {json.dumps(snapshot, ensure_ascii=False)}\n\n"
        while True:
            try:
                if await request.is_disconnected():
                    return
            except Exception:
                return
            await asyncio.sleep(REFRESH_INTERVAL_S)
            snapshot = fleet_snapshot_sync(user["id"], project_id)
            yield f"data: {json.dumps(snapshot, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Vary": "Cookie",
    })


# ===========================================================================
# v7 — History endpoint for replay mode
# ===========================================================================

@router.get("/telemetry/history")
def fleet_history_endpoint(
    request: Request,
    drone_id: str = Query(..., description="Drone ID to fetch history for"),
    limit: int = Query(500, ge=1, le=MAX_SAMPLES_PER_DRONE),
    since_iso: str | None = Query(None, description="ISO timestamp to fetch from"),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Fetch persisted telemetry samples for the radar replay mode."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        stmt = select(FleetTelemetrySample).where(FleetTelemetrySample.drone_id == drone_id)
        if since_iso:
            try:
                since_dt = datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
                stmt = stmt.where(FleetTelemetrySample.sample_time >= since_dt)
            except ValueError:
                pass
        stmt = stmt.order_by(FleetTelemetrySample.sample_time.asc()).limit(limit)
        rows = db.scalars(stmt).all()
        samples = [
            {
                "id": row.id,
                "droneId": row.drone_id,
                "droneName": row.drone_name,
                "sampleTime": row.sample_time.astimezone(UTC).isoformat() if row.sample_time.tzinfo else row.sample_time.replace(tzinfo=UTC).isoformat(),
                "latitude_deg": row.latitude_deg,
                "longitude_deg": row.longitude_deg,
                "altitude_m": row.altitude_m,
                "relative_altitude_m": row.relative_altitude_m,
                "x_m": row.x_m,
                "y_m": row.y_m,
                "heading_deg": row.heading_deg,
                "battery_remaining_pct": row.battery_remaining_pct,
                "voltage_v": row.voltage_v,
                "current_a": row.current_a,
                "armed": row.armed,
                "connected": row.connected,
                "inside_geofence": row.inside_geofence,
                "altitude_ok": row.altitude_ok,
            }
            for row in rows
        ]
    return JSONResponse({"droneId": drone_id, "samples": samples, "count": len(samples)}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.get("/telemetry/history/range")
def fleet_history_range_endpoint(
    request: Request,
    project_id: str | None = Query(None),
    drone_id: str | None = Query(None),
    minutes: int = Query(15, ge=1, le=120),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Fetch samples for a drone (or all drones in a project) in the last N minutes."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    since = datetime.now(UTC) - timedelta(minutes=minutes)
    with SessionLocal() as db:
        stmt = select(FleetTelemetrySample).where(FleetTelemetrySample.sample_time >= since)
        if drone_id:
            stmt = stmt.where(FleetTelemetrySample.drone_id == drone_id)
        elif project_id:
            stmt = stmt.where(FleetTelemetrySample.project_id == project_id)
        stmt = stmt.order_by(FleetTelemetrySample.sample_time.asc()).limit(2000)
        rows = db.scalars(stmt).all()
        # Group by drone_id
        by_drone: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            by_drone.setdefault(row.drone_id, []).append({
                "sampleTime": row.sample_time.astimezone(UTC).isoformat() if row.sample_time.tzinfo else row.sample_time.replace(tzinfo=UTC).isoformat(),
                "latitude_deg": row.latitude_deg,
                "longitude_deg": row.longitude_deg,
                "relative_altitude_m": row.relative_altitude_m,
                "x_m": row.x_m,
                "y_m": row.y_m,
                "heading_deg": row.heading_deg,
                "battery_remaining_pct": row.battery_remaining_pct,
                "armed": row.armed,
                "connected": row.connected,
            })
    return JSONResponse({"rangeMinutes": minutes, "drones": by_drone, "totalCount": len(rows)}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})
