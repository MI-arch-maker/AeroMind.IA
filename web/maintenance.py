"""Maintenance + battery cycles backend — track service records and battery health.

Maintenance records are owner-scoped per drone + optional material item.
Battery cycles track charge/discharge events for cycle-life management.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import desc, func, select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import MaintenanceRecord, BatteryCycle, AuditEvent


router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


# ===========================================================================
# Maintenance records
# ===========================================================================

@router.get("/records")
def list_maintenance_records(
    request: Request,
    project_id: str | None = Query(None),
    drone_id: str | None = Query(None),
    upcoming_only: bool = Query(False),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        stmt = select(MaintenanceRecord).where(MaintenanceRecord.user_id == user["id"])
        if project_id:
            stmt = stmt.where(MaintenanceRecord.project_id == project_id)
        if drone_id:
            stmt = stmt.where(MaintenanceRecord.drone_id == drone_id)
        if upcoming_only:
            stmt = stmt.where(MaintenanceRecord.next_due_at.is_not(None)).where(MaintenanceRecord.next_due_at >= datetime.now(UTC))
        stmt = stmt.order_by(desc(MaintenanceRecord.performed_at))
        rows = db.scalars(stmt).all()
        records = [
            {
                "id": r.id,
                "projectId": r.project_id,
                "droneId": r.drone_id,
                "materialItemId": r.material_item_id,
                "maintenanceType": r.maintenance_type,
                "description": r.description,
                "performedAt": r.performed_at.astimezone(UTC).isoformat() if r.performed_at and r.performed_at.tzinfo else (r.performed_at.replace(tzinfo=UTC).isoformat() if r.performed_at else None),
                "nextDueAt": r.next_due_at.astimezone(UTC).isoformat() if r.next_due_at and r.next_due_at.tzinfo else (r.next_due_at.replace(tzinfo=UTC).isoformat() if r.next_due_at else None),
                "flightHoursAtMaintenance": r.flight_hours_at_maintenance,
                "notes": r.notes,
            }
            for r in rows
        ]
    return JSONResponse({"records": records}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.post("/records")
async def create_maintenance_record(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    maintenance_type = str(body.get("maintenanceType") or "").strip()
    if not maintenance_type:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "maintenanceType is required"}})
    record_id = str(uuid4())
    next_due_at = None
    if body.get("nextDueInDays"):
        try:
            next_due_at = datetime.now(UTC) + timedelta(days=int(body["nextDueInDays"]))
        except (TypeError, ValueError):
            pass
    elif body.get("nextDueAt"):
        try:
            next_due_at = datetime.fromisoformat(str(body["nextDueAt"]).replace("Z", "+00:00"))
        except ValueError:
            pass
    with SessionLocal() as db:
        r = MaintenanceRecord(
            id=record_id,
            user_id=user["id"],
            project_id=str(body.get("projectId") or "").strip() or None,
            drone_id=str(body.get("droneId") or "").strip() or None,
            material_item_id=str(body.get("materialItemId") or "").strip() or None,
            maintenance_type=maintenance_type,
            description=str(body.get("description") or ""),
            performed_at=datetime.now(UTC),
            next_due_at=next_due_at,
            flight_hours_at_maintenance=float(body.get("flightHoursAtMaintenance")) if body.get("flightHoursAtMaintenance") is not None else None,
            notes=str(body.get("notes") or ""),
            created_at=datetime.now(UTC),
        )
        db.add(r)
        db.add(AuditEvent(
            id=str(uuid4()),
            project_id=r.project_id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.maintenance.recorded",
            message=f"Maintenance '{maintenance_type}' enregistrée",
            payload_json=json.dumps({"scope": "maintenance", "recordId": record_id}, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        ))
        db.commit()
    return JSONResponse({"id": record_id, "maintenanceType": maintenance_type}, status_code=201)


@router.delete("/records/{record_id}")
def delete_maintenance_record(
    record_id: str,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        r = db.get(MaintenanceRecord, record_id)
        if r is None or r.user_id != user["id"]:
            return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": "Maintenance record not found"}})
        db.delete(r)
        db.commit()
    return JSONResponse({"deleted": record_id})


# ===========================================================================
# Battery cycles
# ===========================================================================

@router.get("/batteries")
def list_battery_cycles(
    request: Request,
    project_id: str | None = Query(None),
    drone_id: str | None = Query(None),
    battery_label: str | None = Query(None),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    with SessionLocal() as db:
        stmt = select(BatteryCycle).where(BatteryCycle.user_id == user["id"])
        if project_id:
            stmt = stmt.where(BatteryCycle.project_id == project_id)
        if drone_id:
            stmt = stmt.where(BatteryCycle.drone_id == drone_id)
        if battery_label:
            stmt = stmt.where(BatteryCycle.battery_label == battery_label)
        stmt = stmt.order_by(desc(BatteryCycle.occurred_at))
        rows = db.scalars(stmt).all()
        cycles = [
            {
                "id": r.id,
                "projectId": r.project_id,
                "droneId": r.drone_id,
                "batteryLabel": r.battery_label,
                "eventType": r.event_type,
                "voltageV": r.voltage_v,
                "capacityMahUsed": r.capacity_mah_used,
                "occurredAt": r.occurred_at.astimezone(UTC).isoformat() if r.occurred_at and r.occurred_at.tzinfo else (r.occurred_at.replace(tzinfo=UTC).isoformat() if r.occurred_at else None),
                "notes": r.notes,
            }
            for r in rows
        ]
        # Aggregate: count cycles per battery
        agg_stmt = (
            select(
                BatteryCycle.battery_label,
                func.count(BatteryCycle.id),
                func.max(BatteryCycle.occurred_at),
            )
            .where(BatteryCycle.user_id == user["id"])
            .where(BatteryCycle.event_type == "discharge")
            .group_by(BatteryCycle.battery_label)
        )
        if project_id:
            agg_stmt = agg_stmt.where(BatteryCycle.project_id == project_id)
        if drone_id:
            agg_stmt = agg_stmt.where(BatteryCycle.drone_id == drone_id)
        aggregates = [
            {"batteryLabel": label, "cycleCount": count, "lastDischargeAt": last.astimezone(UTC).isoformat() if last and last.tzinfo else (last.replace(tzinfo=UTC).isoformat() if last else None)}
            for label, count, last in db.execute(agg_stmt).all()
        ]
    return JSONResponse({"cycles": cycles, "aggregates": aggregates}, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.post("/batteries")
async def record_battery_cycle(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    battery_label = str(body.get("batteryLabel") or "").strip()
    if not battery_label:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "batteryLabel is required"}})
    event_type = str(body.get("eventType") or "discharge").strip()
    if event_type not in {"charge", "discharge", "storage"}:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "eventType must be charge / discharge / storage"}})
    with SessionLocal() as db:
        c = BatteryCycle(
            user_id=user["id"],
            project_id=str(body.get("projectId") or "").strip() or None,
            drone_id=str(body.get("droneId") or "").strip() or None,
            battery_label=battery_label,
            event_type=event_type,
            voltage_v=float(body.get("voltageV")) if body.get("voltageV") is not None else None,
            capacity_mah_used=float(body.get("capacityMahUsed")) if body.get("capacityMahUsed") is not None else None,
            occurred_at=datetime.now(UTC),
            notes=str(body.get("notes") or ""),
        )
        db.add(c)
        db.commit()
        db.refresh(c)
    return JSONResponse({"id": c.id, "batteryLabel": battery_label, "eventType": event_type}, status_code=201)
