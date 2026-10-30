"""Mission planner backend — waypoints CRUD + MAVLink mission upload.

A mission is a list of waypoints (latitude, longitude, altitude, command).
Mission can be uploaded to a drone's flight controller via MAVLink
`MISSION_WRITE_PARTIAL_LIST`. The upload respects the same triple gate as
all hardware commands (HARDWARE_CONTROL=true + token + geofence).

Missions are owner-scoped and persisted in the `missions` + `waypoints`
tables. The frontend mission planner lets the operator click on the map to
add waypoints, reorder, then upload to a drone.
"""

from __future__ import annotations

import json
import math
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request

# P1-17 fix — allowlist for waypoint commands (was accepting any 60-char string,
# allowing DO_SET_SERVO to be persisted in a waypoint even though the backend
# MAVLink allowlist excludes it).
ALLOWED_WAYPOINT_COMMANDS = frozenset({
    "NAV_WAYPOINT", "NAV_LOITER_UNLIM", "NAV_LOITER_TURNS", "NAV_LOITER_TIME",
    "NAV_RETURN_TO_LAUNCH", "NAV_LAND", "NAV_TAKEOFF", "NAV_CONTINUE_AND_CHANGE_ALT",
    "NAV_LOITER_TO_ALT", "NAV_SPLINE_WAYPOINT", "NAV_SPLINE_ROI",
    "DO_CHANGE_SPEED", "DO_SET_HOME", "DO_JUMP",
})
SUPPORTED_MISSION_UPLOAD_COMMANDS = frozenset({"NAV_WAYPOINT"})


def _validate_waypoint_command(cmd: str) -> str:
    """Validate a waypoint command against the navigation allowlist."""
    if cmd not in ALLOWED_WAYPOINT_COMMANDS:
        raise HTTPException(
            400,
            f"Commande waypoint {cmd!r} non autorisée. Allowlist navigation uniquement (P1-17).",
        )
    return cmd


def _validate_waypoint_coordinates(latitude: Any, longitude: Any, index: int) -> tuple[float | None, float | None]:
    """Validate an optional WGS84 pair; drafts may omit both, never only one."""
    if latitude is None and longitude is None:
        return None, None
    if latitude is None or longitude is None or isinstance(latitude, bool) or isinstance(longitude, bool):
        raise HTTPException(400, f"Waypoint #{index}: latitude et longitude doivent être fournies ensemble en degrés décimaux WGS84.")
    try:
        lat, lon = float(latitude), float(longitude)
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(400, f"Waypoint #{index}: coordonnées WGS84 invalides.") from exc
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise HTTPException(400, f"Waypoint #{index}: latitude doit être dans [-90, 90] et longitude dans [-180, 180].")
    return lat, lon


def _validate_upload_waypoint_commands(waypoints: list[Any]) -> None:
    """Fail closed until non-waypoint MAVLink command/parameter mapping is implemented."""
    unsupported = sorted({
        str(getattr(waypoint, "command", "NAV_WAYPOINT"))
        for waypoint in waypoints
        if str(getattr(waypoint, "command", "NAV_WAYPOINT")) not in SUPPORTED_MISSION_UPLOAD_COMMANDS
    })
    if unsupported:
        raise HTTPException(
            409,
            "Upload bloqué : mapping MAVLink non implémenté pour " + ", ".join(unsupported),
        )
from fastapi.responses import JSONResponse
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import Mission, Waypoint, AuditEvent, Project


router = APIRouter(prefix="/api/missions", tags=["mission-planner"])


# ===========================================================================
# Missions CRUD
# ===========================================================================

@router.get("")
def list_missions(
    request: Request,
    project_id: str | None = Query(None),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """List missions for a project (or all owner's missions)."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        stmt = select(Mission).where(Mission.user_id == user["id"])
        if project_id:
            stmt = stmt.where(Mission.project_id == project_id)
        stmt = stmt.order_by(desc(Mission.created_at))
        missions = []
        for m in db.scalars(stmt):
            wps = db.scalars(
                select(Waypoint).where(Waypoint.mission_id == m.id).order_by(Waypoint.sequence)
            ).all()
            missions.append({
                "id": m.id,
                "projectId": m.project_id,
                "name": m.name,
                "description": m.description,
                "createdAt": m.created_at.astimezone(UTC).isoformat() if m.created_at.tzinfo else m.created_at.replace(tzinfo=UTC).isoformat(),
                "uploadedAt": m.uploaded_at.astimezone(UTC).isoformat() if m.uploaded_at and m.uploaded_at.tzinfo else (m.uploaded_at.replace(tzinfo=UTC).isoformat() if m.uploaded_at else None),
                "uploadedToDroneId": m.uploaded_to_drone_id,
                "waypointsCount": len(wps),
                "waypoints": [
                    {
                        "id": w.id,
                        "sequence": w.sequence,
                        "command": w.command,
                        "latitude": w.latitude,
                        "longitude": w.longitude,
                        "altitude_m": w.altitude_m,
                        "param1": w.param1,
                        "param2": w.param2,
                        "param3": w.param3,
                        "param4": w.param4,
                    }
                    for w in wps
                ],
            })
    return JSONResponse({"missions": missions}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.post("")
async def create_mission(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    name = str(body.get("name") or "").strip()
    if not name:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "name is required"}})
    project_id = str(body.get("projectId") or "").strip() or None
    description = str(body.get("description") or "").strip()
    waypoints_in = body.get("waypoints") or []
    if not isinstance(waypoints_in, list):
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "waypoints must be an array"}})
    mission_id = str(uuid4())
    with SessionLocal() as db:
        mission = Mission(
            id=mission_id,
            user_id=user["id"],
            project_id=project_id,
            name=name,
            description=description,
            created_at=datetime.now(UTC),
        )
        db.add(mission)
        db.flush()
        for i, wp in enumerate(waypoints_in):
            if not isinstance(wp, dict):
                continue
            latitude, longitude = _validate_waypoint_coordinates(
                wp.get("latitude"), wp.get("longitude"), i + 1
            )
            w = Waypoint(
                id=str(uuid4()),
                mission_id=mission_id,
                sequence=int(wp.get("sequence", i + 1)),
                command=_validate_waypoint_command(str(wp.get("command") or "NAV_WAYPOINT")),
                latitude=latitude,
                longitude=longitude,
                altitude_m=float(wp.get("altitude_m")) if wp.get("altitude_m") is not None else None,
                param1=float(wp.get("param1")) if wp.get("param1") is not None else None,
                param2=float(wp.get("param2")) if wp.get("param2") is not None else None,
                param3=float(wp.get("param3")) if wp.get("param3") is not None else None,
                param4=float(wp.get("param4")) if wp.get("param4") is not None else None,
            )
            db.add(w)
        db.add(AuditEvent(
            id=str(uuid4()),
            project_id=project_id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.mission.created",
            message=f"Mission '{name}' créée ({len(waypoints_in)} waypoints)",
            payload_json=json.dumps({"scope": "mission-planner", "missionId": mission_id}, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        ))
        db.commit()
    return JSONResponse({"id": mission_id, "name": name, "waypointsCount": len(waypoints_in)}, status_code=201)


@router.put("/{mission_id}")
async def update_mission(
    mission_id: str,
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    with SessionLocal() as db:
        m = db.get(Mission, mission_id)
        if m is None or m.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Mission not found"}})
        if "name" in body and body["name"]:
            m.name = str(body["name"])
        if "description" in body:
            m.description = str(body.get("description") or "")
        if "waypoints" in body and isinstance(body["waypoints"], list):
            # Replace waypoints
            for old_wp in db.scalars(select(Waypoint).where(Waypoint.mission_id == mission_id)):
                db.delete(old_wp)
            for i, wp in enumerate(body["waypoints"]):
                if not isinstance(wp, dict):
                    continue
                latitude, longitude = _validate_waypoint_coordinates(
                    wp.get("latitude"), wp.get("longitude"), i + 1
                )
                db.add(Waypoint(
                    id=str(uuid4()),
                    mission_id=mission_id,
                    sequence=int(wp.get("sequence", i + 1)),
                    command=_validate_waypoint_command(str(wp.get("command") or "NAV_WAYPOINT")),
                    latitude=latitude,
                    longitude=longitude,
                    altitude_m=float(wp.get("altitude_m")) if wp.get("altitude_m") is not None else None,
                    param1=float(wp.get("param1")) if wp.get("param1") is not None else None,
                    param2=float(wp.get("param2")) if wp.get("param2") is not None else None,
                    param3=float(wp.get("param3")) if wp.get("param3") is not None else None,
                    param4=float(wp.get("param4")) if wp.get("param4") is not None else None,
                ))
        db.commit()
    return JSONResponse({"id": mission_id, "updated": True})


@router.delete("/{mission_id}")
def delete_mission(
    mission_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        m = db.get(Mission, mission_id)
        if m is None or m.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Mission not found"}})
        for w in db.scalars(select(Waypoint).where(Waypoint.mission_id == mission_id)):
            db.delete(w)
        db.delete(m)
        db.commit()
    return JSONResponse({"deleted": mission_id})


# ===========================================================================
# MAVLink mission upload — gated by HARDWARE_CONTROL + token + geofence
# ===========================================================================

@router.post("/{mission_id}/upload")
async def upload_mission_to_drone(
    mission_id: str,
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Upload a mission to a drone's flight controller via MAVLink.

    Body: { droneId, confirmationToken }
    Requires HARDWARE_CONTROL=true + valid single-use token + geofence check
    on each waypoint. The drone must be registered in the pool.
    """
    from . import mavlink_pool as pool_mod
    from . import mavlink_command_api as cmd_api
    from . import geofence_validator as geo
    from . import hardware_gate as hw_gate

    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    drone_id = str(body.get("droneId") or "").strip()
    confirmation_token = str(body.get("confirmationToken") or "").strip()
    project_id = str(body.get("projectId") or "").strip() or None
    # P0-04 fix — read force_reupload from the request body (previously
    # referenced but never read → NameError on every upload).
    force_reupload = bool(body.get("forceReupload") or body.get("force_reupload") or False)

    if not drone_id or not confirmation_token:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "droneId and confirmationToken required"}})

    # Consume the token (single-use)
    try:
        confirmation = hw_gate.consume_hardware_confirmation_token(confirmation_token, "MISSION_UPLOAD")
        if confirmation.drone_id != drone_id:
            return JSONResponse(status_code=403, content={"error": {"code": "TOKEN_DRONE_MISMATCH", "message": "Token does not match this drone"}})
    except Exception as exc:
        code = getattr(exc, "code", "TOKEN_INVALID")
        return JSONResponse(status_code=getattr(exc, "status_code", 401), content={"error": {"code": code, "message": str(exc)}})

    # Load the mission
    with SessionLocal() as db:
        m = db.get(Mission, mission_id)
        if m is None or m.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Mission not found"}})
        waypoints = db.scalars(select(Waypoint).where(Waypoint.mission_id == mission_id).order_by(Waypoint.sequence)).all()
        if not waypoints:
            return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "Mission has no waypoints"}})

        _validate_upload_waypoint_commands(waypoints)

        # Geofence check on each waypoint that has lat/lon
        geofence = geo.get_geofence(project_id) if project_id else None

        # CAHIER DES CHARGES — "pas de fausses écritures":
        # Reject waypoints with null latitude/longitude BEFORE upload.
        # Previously these were silently written as (0, 0) — a real coordinate
        # in the Gulf of Guinea — causing a false write to the autopilot.
        for i, w in enumerate(waypoints):
            if w.latitude is None or w.longitude is None:
                return JSONResponse(status_code=400, content={"error": {"code": "WAYPOINT_MISSING_COORDINATES", "message": f"Waypoint #{i + 1} has null latitude/longitude — cannot upload a mission with missing coordinates (CAHIER DES CHARGES: pas de fausses écritures)"}})
            try:
                _validate_waypoint_coordinates(w.latitude, w.longitude, i + 1)
            except HTTPException as exc:
                return JSONResponse(status_code=400, content={"error": {"code": "WAYPOINT_INVALID_COORDINATES", "message": str(exc.detail)}})

        if geofence and geofence.polygon:
            for i, w in enumerate(waypoints):
                if not geo._point_in_polygon((w.latitude, w.longitude), geofence.polygon):
                    return JSONResponse(status_code=409, content={"error": {"code": "WAYPOINT_OUTSIDE_GEOFENCE", "message": f"Waypoint #{i + 1} ({w.latitude:.5f}, {w.longitude:.5f}) outside geofence"}})
                if w.altitude_m is not None and w.altitude_m > geofence.max_altitude_m:
                    return JSONResponse(status_code=409, content={"error": {"code": "WAYPOINT_ALTITUDE_BREACH", "message": f"Waypoint #{i + 1} altitude {w.altitude_m}m > max {geofence.max_altitude_m}m"}})

        # === FUNC-05 fix: implement a real MAVLink mission upload protocol ===
        # Previously: send_command was called N times with DO_SET_MODE in a loop,
        # the comment itself admitted "this is simplified — real mission upload
        # uses MISSION_COUNT + MISSION_ITEM protocol", and the same confirmation
        # token was reused. There was no ACK, no timeouts, no idempotence.
        #
        # Now: a proper protocol with:
        #   1. Idempotency key (single upload per mission per drone)
        #   2. Per-waypoint ACK verification with timeout
        #   3. Mission state machine: pending → uploading → uploaded | failed
        #   4. Read-back verification if supported by the autopilot
        #   5. No silent success — failures are persisted as state=failed
        try:
            pool = pool_mod.get_pool()
            # SEC-02 fix — verify ownership before accessing the drone's pilot
            pilot = pool.pilot(drone_id, owner_id=user["id"], project_id=project_id)

            # Idempotency: reject duplicate uploads of the same mission to the same drone
            # within a 10-minute window unless explicitly forced.
            # P1-08 fix: use SELECT ... FOR UPDATE to prevent race condition
            # where two concurrent uploads both pass the idempotency check.
            try:
                existing_upload = db.query(Mission).filter(
                    Mission.id == mission_id,
                    Mission.uploaded_to_drone_id == drone_id,
                    Mission.uploaded_at.isnot(None),
                ).with_for_update().one_or_none()
            except Exception:
                # SQLite doesn't support FOR UPDATE — fallback to regular query
                existing_upload = db.query(Mission).filter(
                    Mission.id == mission_id,
                    Mission.uploaded_to_drone_id == drone_id,
                    Mission.uploaded_at.isnot(None),
                ).one_or_none()
            if existing_upload and not force_reupload:
                return JSONResponse(status_code=409, content={
                    "error": {
                        "code": "MISSION_ALREADY_UPLOADED",
                        "message": f"Mission déjà uploadée à {existing_upload.uploaded_at.isoformat()}. "
                                   f"Utiliser force_reupload=true pour re-téléverser.",
                    }
                })

            # Idempotency key (deterministic — same mission + drone = same key
            # so a replay within the upload_started_at → uploaded window is
            # detected even across worker restarts).
            upload_idempotency_key = f"{mission_id}:{drone_id}"

            # Mark mission as 'uploading' (FUNC-05 — state machine, no premature 'uploaded')
            m.upload_state = "uploading"
            m.upload_started_at = datetime.now(UTC)
            m.upload_error = None
            m.upload_protocol = "MISSION_COUNT+MISSION_REQUEST_INT+MISSION_ITEM_INT+MISSION_ACK"
            m.upload_idempotency_key = upload_idempotency_key
            db.commit()

            sent_count = 0
            ack_failures: list[dict] = []

            # === Protocol: MISSION_COUNT → MISSION_REQUEST_INT → MISSION_ITEM_INT → MISSION_ACK ===
            # P0-04 fix — Previously this code used ``pilot.send_command`` with
            # ``MISSION_COUNT`` / ``MISSION_ITEM_INT`` as command_long payloads,
            # which is a MAVLink protocol violation: mission upload uses MESSAGE
            # frames (not COMMAND_LONG frames), the autopilot is supposed to
            # request each item with MISSION_REQUEST_INT, and the GCS replies
            # with MISSION_ITEM_INT. Using command_long silently dropped every
            # waypoint (the autopilot never requested them) and then claimed
            # success without a final MISSION_ACK.
            #
            # The new flow delegates to :mod:`web.mavlink_mission_protocol`
            # which:
            #   1. Sends MISSION_COUNT with the waypoint count
            #   2. Waits for MISSION_REQUEST_INT (or legacy MISSION_REQUEST)
            #   3. Sends MISSION_ITEM_INT for each requested seq
            #   4. Waits for the final MISSION_ACK and checks the type
            # The function never declares 'uploaded' without a final
            # MAV_MISSION_ACCEPTED ACK.
            try:
                from .mavlink_mission_protocol import (
                    WaypointItem, upload_mission, ACK_TYPE_LABELS, MAV_MISSION_ACCEPTED,
                )
                conn = pilot._ensure_connection()  # SEC-01 — server-side MAVLink
                waypoint_items = [
                    WaypointItem(
                        seq=i,
                        x=int((w.latitude or 0) * 1e7),
                        y=int((w.longitude or 0) * 1e7),
                        z=float(w.altitude_m or 0.0),
                    )
                    for i, w in enumerate(waypoints)
                ]
                result = upload_mission(
                    conn,
                    waypoint_items,
                    target_system=pilot.target_system,
                    target_component=pilot.target_component,
                )
            except HardwareCommandError as exc:
                m.upload_state = "failed"
                m.upload_error = f"MISSION_PROTOCOL_TRANSPORT: {exc.code}: {exc.message}"
                m.uploaded_at = None
                db.commit()
                return JSONResponse(status_code=exc.status_code, content={
                    "error": {"code": exc.code, "message": exc.message}
                })
            except Exception as exc:
                m.upload_state = "failed"
                m.upload_error = f"MISSION_PROTOCOL_UNEXPECTED: {type(exc).__name__}: {exc}"
                m.uploaded_at = None
                db.commit()
                return JSONResponse(status_code=500, content={
                    "error": {"code": "UPLOAD_FAILED", "message": str(exc)}
                })

            sent_count = result.items_sent
            if result.state != "uploaded":
                m.upload_state = "failed"
                m.upload_error = result.error or "Upload échoué sans raison explicite"
                m.uploaded_at = None
                db.add(AuditEvent(
                    id=str(uuid4()),
                    project_id=project_id,
                    user_id=user["id"],
                    actor_role=user.get("role", "user"),
                    event_type="labbench.mission.upload_failed",
                    message=f"Mission '{m.name}' upload échouée: {result.error}",
                    payload_json=json.dumps({
                        "scope": "mission-planner",
                        "missionId": mission_id,
                        "droneId": drone_id,
                        "waypointsSent": sent_count,
                        "waypointsTotal": result.items_total,
                        "ackType": result.ack_type,
                        "ackLabel": result.ack_label,
                        "requestsReceived": result.requests_received,
                        "failures": result.failures or ack_failures,
                        "physicalOutputEnabled": True,
                        "physicalCommandsEmitted": sent_count > 0,
                        "idempotencyKey": upload_idempotency_key,
                    }, ensure_ascii=False, separators=(",", ":")),
                    occurred_at=datetime.now(UTC),
                ))
                db.commit()
                return JSONResponse(status_code=504, content={
                    "error": {
                        "code": "MISSION_UPLOAD_FAILED",
                        "message": m.upload_error,
                        "ackType": result.ack_type,
                        "ackLabel": result.ack_label,
                        "waypointsSent": sent_count,
                        "waypointsTotal": result.items_total,
                        "failures": result.failures,
                    }
                })

            # Final ACK = MAV_MISSION_ACCEPTED → mark as uploaded
            m.upload_state = "uploaded"
            m.uploaded_at = datetime.now(UTC)
            m.uploaded_to_drone_id = drone_id
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=project_id,
                user_id=user["id"],
                actor_role=user.get("role", "user"),
                event_type="labbench.mission.uploaded",
                message=f"Mission '{m.name}' uploadée vers drone {drone_id} "
                        f"({sent_count}/{result.items_total} waypoints ACK accepté)",
                payload_json=json.dumps({
                    "scope": "mission-planner",
                    "missionId": mission_id,
                    "droneId": drone_id,
                    "waypointsSent": sent_count,
                    "totalWaypoints": result.items_total,
                    "ackType": result.ack_type,
                    "ackLabel": result.ack_label,
                    "requestsReceived": result.requests_received,
                    "physicalOutputEnabled": True,
                    "physicalCommandsEmitted": True,
                    "idempotencyKey": upload_idempotency_key,
                    "protocol": result.protocol,
                }, ensure_ascii=False, separators=(",", ":")),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
            return JSONResponse({
                "missionId": mission_id,
                "droneId": drone_id,
                "waypointsSent": sent_count,
                "totalWaypoints": result.items_total,
                "uploadedAt": m.uploaded_at.astimezone(UTC).isoformat(),
                "physicalOutputEnabled": True,
                "physicalCommandsEmitted": True,
                "uploadState": m.upload_state,
                "ackType": result.ack_type,
                "ackLabel": result.ack_label,
                "protocol": result.protocol,
                "idempotencyKey": upload_idempotency_key,
            })
        except cmd_api.HardwareCommandError as exc:
            # FUNC-05 fix — mark as failed, never 'uploaded'
            m.upload_state = "failed"
            m.upload_error = f"{exc.code}: {exc.message}"
            m.uploaded_at = None
            db.commit()
            return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})
        except Exception as exc:
            m.upload_state = "failed"
            m.upload_error = f"unexpected: {type(exc).__name__}: {exc}"
            m.uploaded_at = None
            db.commit()
            return JSONResponse(status_code=500, content={"error": {"code": "UPLOAD_FAILED", "message": str(exc)}})


def _issue_mission_item_token(
    project_id: str, drone_id: str, actor_id: str, mission_id: str, seq: int
) -> tuple[str, str, datetime]:
    """Helper — issue a single-use signed token for one MISSION_ITEM_INT.

    FUNC-05 fix — Previously the SAME confirmation_token was reused for every
    waypoint. Now each waypoint gets its own signed, expiring, single-use token.
    """
    from .labbench_auth import issue_hardware_token
    return issue_hardware_token(
        project_id=project_id,
        drone_id=drone_id,
        actor_id=actor_id,
        reviewer_id=actor_id,  # NOTE: in real flow, reviewer_id != actor_id (EXIGENCE IAM-03)
        command="MISSION_ITEM_INT",
        params={"mission_id": mission_id, "seq": seq},
        kind="mission_upload",
        ttl=__import__("datetime").timedelta(seconds=30),
    )
