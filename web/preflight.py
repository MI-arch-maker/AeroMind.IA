"""Pre-flight checklist backend — templates + execution records.

A pre-flight checklist is a list of items the operator must verify before
each flight. The template can be customized per drone / per project. Each
execution is persisted with the result (passed/failed) + timestamp, so the
audit log records what was checked before each flight.

Default template (used if no items provided):
  - Batterie chargée ≥ 90%
  - Hélices inspectées (pas de fissure)
  - Moteurs libres (rotation à la main)
  - GPS lock acquis (≥ 7 satellites)
  - IMU calibration récente (< 30 jours)
  - Géofence configurée
  - E-stop testé
  - Météo OK (vent < 8 m/s, pas de pluie)
  - Zone de vol dégagée
  - Opérateur briefed
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import desc, select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import PreflightChecklist, AuditEvent


router = APIRouter(prefix="/api/preflight", tags=["preflight-checklist"])


DEFAULT_CHECKLIST_ITEMS = [
    {"id": "battery", "label": "Batterie chargée ≥ 90%", "required": True, "category": "energy", "auto_check": "mavlink_battery"},
    {"id": "props", "label": "Hélices inspectées (pas de fissure)", "required": True, "category": "propulsion"},
    {"id": "motors", "label": "Moteurs libres (rotation à la main)", "required": True, "category": "propulsion"},
    {"id": "gps", "label": "GPS lock acquis (≥ 7 satellites)", "required": True, "category": "avionics", "auto_check": "mavlink_gps"},
    {"id": "imu", "label": "IMU calibration récente (< 30 jours)", "required": True, "category": "avionics", "auto_check": "mavlink_imu"},
    {"id": "magnetometer", "label": "Magnétomètre calibré (compass)", "required": True, "category": "avionics"},
    {"id": "geofence", "label": "Géofence configurée et valide", "required": True, "category": "safety", "auto_check": "geofence_db"},
    {"id": "estop", "label": "E-stop testé", "required": True, "category": "safety"},
    {"id": "rc_link", "label": "Liaison RC / datalink vérifiée (range test)", "required": True, "category": "avionics"},
    {"id": "weather", "label": "Météo OK (vent < 8 m/s, pas de pluie)", "required": True, "category": "environment"},
    {"id": "airspace", "label": "Espace aérien autorisé (NOTAMs vérifiés)", "required": True, "category": "environment"},
    {"id": "zone", "label": "Zone de vol dégagée (obstacles, public)", "required": True, "category": "environment"},
    {"id": "payload_secured", "label": "Charge utile arrimée", "required": True, "category": "payload"},
    {"id": "non_weaponized", "label": "Aucun système d'arme installé (conformité non-armée)", "required": True, "category": "compliance"},
    {"id": "briefing", "label": "Opérateur briefed", "required": True, "category": "operator"},
]


def _run_auto_check(check_id: str, drone_id: str | None, project_id: str | None) -> dict:
    """P1-09 fix — run automated MAVLink/DB checks for verifiable items.

    Returns {"auto_checked": True, "passed": bool, "value": str, "source": str}.
    If the check cannot be performed (no observer, no telemetry), returns
    {"auto_checked": False} so the operator falls back to manual declaration.
    """
    result = {"auto_checked": False}
    if not drone_id:
        return result
    try:
        if check_id == "geofence_db":
            from . import geofence_validator as geo
            gf = geo.get_geofence(project_id or "", owner_id=None) if project_id else None
            if gf is not None:
                return {"auto_checked": True, "passed": True,
                        "value": f"polygone {len(gf.polygon)} pts, alt max {gf.max_altitude_m}m",
                        "source": "geofence_validator.get_geofence"}
            return {"auto_checked": True, "passed": False,
                    "value": "aucune géofence en DB", "source": "geofence_validator.get_geofence"}
        # MAVLink-based checks require an observer connected to the drone
        from . import mavlink_pool as pool_mod
        pool = pool_mod.get_pool()
        try:
            observer = pool.observer(drone_id)
        except Exception:
            return result  # no observer available
        snapshot = observer.poll() if hasattr(observer, "poll") else None
        if snapshot is None:
            return result
        if check_id == "mavlink_gps":
            sats = getattr(snapshot, "satellites_visible", None) or getattr(snapshot, "gps_satellites", None)
            if sats is not None:
                return {"auto_checked": True, "passed": sats >= 7,
                        "value": f"{sats} satellites", "source": "MAVLink GPS_RAW_INT"}
            return result
        if check_id == "mavlink_battery":
            batt = getattr(snapshot, "battery_remaining_pct", None) or getattr(snapshot, "battery_remaining", None)
            if batt is not None:
                return {"auto_checked": True, "passed": batt >= 90,
                        "value": f"{batt}%", "source": "MAVLink SYS_STATUS"}
            return result
        if check_id == "mavlink_imu":
            ekf_ok = getattr(snapshot, "ekf_ok", None)
            if ekf_ok is not None:
                return {"auto_checked": True, "passed": bool(ekf_ok),
                        "value": "EKF OK" if ekf_ok else "EKF alert", "source": "MAVLink EKF_STATUS"}
            return result
    except Exception:
        pass
    return result


@router.get("/default-template")
def default_template():
    """Return the default checklist template (10 items)."""
    return {"items": DEFAULT_CHECKLIST_ITEMS, "count": len(DEFAULT_CHECKLIST_ITEMS)}


@router.get("")
def list_checklists(
    request: Request,
    project_id: str | None = Query(None),
    drone_id: str | None = Query(None),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        stmt = select(PreflightChecklist).where(PreflightChecklist.user_id == user["id"])
        if project_id:
            stmt = stmt.where(PreflightChecklist.project_id == project_id)
        if drone_id:
            stmt = stmt.where(PreflightChecklist.drone_id == drone_id)
        stmt = stmt.order_by(desc(PreflightChecklist.created_at))
        rows = db.scalars(stmt).all()
        checklists = [
            {
                "id": r.id,
                "projectId": r.project_id,
                "droneId": r.drone_id,
                "name": r.name,
                "items": json.loads(r.items_json or "[]"),
                "executedAt": r.executed_at.astimezone(UTC).isoformat() if r.executed_at and r.executed_at.tzinfo else (r.executed_at.replace(tzinfo=UTC).isoformat() if r.executed_at else None),
                "passed": r.passed,
                "createdAt": r.created_at.astimezone(UTC).isoformat() if r.created_at.tzinfo else r.created_at.replace(tzinfo=UTC).isoformat(),
            }
            for r in rows
        ]
    return JSONResponse({"checklists": checklists}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.post("")
async def create_checklist(
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
    items = body.get("items") or DEFAULT_CHECKLIST_ITEMS
    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "items must be an array"}})
    checklist_id = str(uuid4())
    with SessionLocal() as db:
        c = PreflightChecklist(
            id=checklist_id,
            user_id=user["id"],
            project_id=str(body.get("projectId") or "").strip() or None,
            drone_id=str(body.get("droneId") or "").strip() or None,
            name=name,
            items_json=json.dumps(items, ensure_ascii=False),
            created_at=datetime.now(UTC),
        )
        db.add(c)
        db.commit()
    return JSONResponse({"id": checklist_id, "name": name, "itemsCount": len(items)}, status_code=201)


@router.post("/{checklist_id}/execute")
async def execute_checklist(
    checklist_id: str,
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Execute a checklist — body contains the items with `checked` flags."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    items_in = body.get("items") or []
    if not isinstance(items_in, list):
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "items must be an array"}})
    # Required items must all be checked
    passed = True
    failed_items = []
    for item in items_in:
        if not isinstance(item, dict):
            continue
        if item.get("required") is True and item.get("checked") is not True:
            passed = False
            failed_items.append(item.get("id") or item.get("label"))
    with SessionLocal() as db:
        c = db.get(PreflightChecklist, checklist_id)
        if c is None or c.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Checklist not found"}})
        c.items_json = json.dumps(items_in, ensure_ascii=False)
        c.executed_at = datetime.now(UTC)
        c.passed = passed
        db.add(AuditEvent(
            id=str(uuid4()),
            project_id=c.project_id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.preflight.executed",
            message=f"Pré-vol {'PASS' if passed else 'FAIL'}: {c.name}" + (f" — items échoués: {', '.join(failed_items)}" if failed_items else ""),
            payload_json=json.dumps({
                "scope": "preflight",
                "checklistId": checklist_id,
                "passed": passed,
                "failedItems": failed_items,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        ))
        db.commit()
    return JSONResponse({
        "checklistId": checklist_id,
        "passed": passed,
        "failedItems": failed_items,
        "executedAt": c.executed_at.astimezone(UTC).isoformat() if c.executed_at and c.executed_at.tzinfo else c.executed_at.replace(tzinfo=UTC).isoformat(),
    })


@router.delete("/{checklist_id}")
def delete_checklist(
    checklist_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        c = db.get(PreflightChecklist, checklist_id)
        if c is None or c.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Checklist not found"}})
        db.delete(c)
        db.commit()
    return JSONResponse({"deleted": checklist_id})
