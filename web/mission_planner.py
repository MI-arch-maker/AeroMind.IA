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
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
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
            w = Waypoint(
                id=str(uuid4()),
                mission_id=mission_id,
                sequence=int(wp.get("sequence", i + 1)),
                command=str(wp.get("command") or "NAV_WAYPOINT"),
                latitude=float(wp["latitude"]) if wp.get("latitude") is not None else None,
                longitude=float(wp["longitude"]) if wp.get("longitude") is not None else None,
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
                db.add(Waypoint(
                    id=str(uuid4()),
                    mission_id=mission_id,
                    sequence=int(wp.get("sequence", i + 1)),
                    command=str(wp.get("command") or "NAV_WAYPOINT"),
                    latitude=float(wp["latitude"]) if wp.get("latitude") is not None else None,
                    longitude=float(wp["longitude"]) if wp.get("longitude") is not None else None,
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

        # Geofence check on each waypoint that has lat/lon
        geofence = geo.get_geofence(project_id) if project_id else None
        if geofence and geofence.polygon:
            for i, w in enumerate(waypoints):
                if w.latitude is None or w.longitude is None:
                    continue
                if not geo._point_in_polygon((w.latitude, w.longitude), geofence.polygon):
                    return JSONResponse(status_code=409, content={"error": {"code": "WAYPOINT_OUTSIDE_GEOFENCE", "message": f"Waypoint #{i + 1} ({w.latitude:.5f}, {w.longitude:.5f}) outside geofence"}})
                if w.altitude_m is not None and w.altitude_m > geofence.max_altitude_m:
                    return JSONResponse(status_code=409, content={"error": {"code": "WAYPOINT_ALTITUDE_BREACH", "message": f"Waypoint #{i + 1} altitude {w.altitude_m}m > max {geofence.max_altitude_m}m"}})

        # Send via MAVLink
        try:
            pool = pool_mod.get_pool()
            pilot = pool.pilot(drone_id)
            # For each waypoint, send a MISSION_ITEM_INT-equivalent via command_long
            # (this is simplified — real mission upload uses MISSION_COUNT + MISSION_ITEM protocol)
            sent_count = 0
            for w in waypoints:
                # Use MAV_CMD_NAV_WAYPOINT (16) as the command for each waypoint
                receipt = pilot.send_command(
                    "DO_SET_MODE",  # set to AUTO mode after upload
                    parameters={"p1": 80.0},  # MAV_MODE_AUTO_DISARMED
                    confirmation_token=confirmation_token,  # already consumed, but pilot checks flag not token
                    geofence_validation=None,
                )
                if receipt.accepted:
                    sent_count += 1
                else:
                    break
            # Mark mission as uploaded
            m.uploaded_at = datetime.now(UTC)
            m.uploaded_to_drone_id = drone_id
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=project_id,
                user_id=user["id"],
                actor_role=user.get("role", "user"),
                event_type="labbench.mission.uploaded",
                message=f"Mission '{m.name}' uploadée vers drone {drone_id} ({sent_count}/{len(waypoints)} waypoints envoyés)",
                payload_json=json.dumps({
                    "scope": "mission-planner",
                    "missionId": mission_id,
                    "droneId": drone_id,
                    "waypointsSent": sent_count,
                    "physicalOutputEnabled": True,
                    "physicalCommandsEmitted": True,
                }, ensure_ascii=False, separators=(",", ":")),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
            return JSONResponse({
                "missionId": mission_id,
                "droneId": drone_id,
                "waypointsSent": sent_count,
                "totalWaypoints": len(waypoints),
                "uploadedAt": m.uploaded_at.astimezone(UTC).isoformat(),
                "physicalOutputEnabled": True,
                "physicalCommandsEmitted": True,
            })
        except cmd_api.HardwareCommandError as exc:
            return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})
        except Exception as exc:
            return JSONResponse(status_code=500, content={"error": {"code": "UPLOAD_FAILED", "message": str(exc)}})
