"""Multi-project dashboard backend — aggregate stats across projects.

Returns: total projects, total drones, total flights (missions), active alerts,
maintenance due, battery cycles per project.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Cookie, Header
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import (
    Project,
    Drone,
    Mission,
    AlertEvent,
    MaintenanceRecord,
    BatteryCycle,
    LabSession,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard_overview(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Aggregate stats across all the user's projects."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})

    with SessionLocal() as db:
        # Total projects
        total_projects = db.scalar(
            select(func.count(Project.id)).where(Project.user_id == user["id"])
        ) or 0

        # Total drones (across all projects)
        total_drones = db.scalar(
            select(func.count(Drone.id)).where(Drone.user_id == user["id"])
        ) or 0

        # Total missions
        total_missions = db.scalar(
            select(func.count(Mission.id)).where(Mission.user_id == user["id"])
        ) or 0

        # Active alerts (unacknowledged, last 7 days)
        # P0-05 fix (INSPECT-BACKEND B-HIGH-02): scope by user's projects to
        # prevent cross-tenant data leakage (SEC-02).
        seven_days_ago = datetime.now(UTC) - timedelta(days=7)
        _user_project_ids = select(Project.id).where(Project.user_id == user["id"])
        active_alerts = db.scalar(
            select(func.count(AlertEvent.id))
            .where(AlertEvent.acknowledged.is_(False))
            .where(AlertEvent.created_at >= seven_days_ago)
            .where(AlertEvent.project_id.in_(_user_project_ids))
        ) or 0

        # Maintenance due (next_due_at in next 7 days)
        now = datetime.now(UTC)
        week_ahead = now + timedelta(days=7)
        maintenance_due = db.scalar(
            select(func.count(MaintenanceRecord.id))
            .where(MaintenanceRecord.user_id == user["id"])
            .where(MaintenanceRecord.next_due_at.is_not(None))
            .where(MaintenanceRecord.next_due_at <= week_ahead)
        ) or 0

        # Battery cycles (total discharge cycles)
        total_battery_cycles = db.scalar(
            select(func.count(BatteryCycle.id))
            .where(BatteryCycle.user_id == user["id"])
            .where(BatteryCycle.event_type == "discharge")
        ) or 0

        # Per-project breakdown
        projects = db.scalars(
            select(Project).where(Project.user_id == user["id"]).order_by(Project.created_at.desc())
        ).all()
        per_project = []
        for p in projects:
            drones_count = db.scalar(
                select(func.count(Drone.id)).where(Drone.project_id == p.id, Drone.user_id == user["id"])
            ) or 0
            missions_count = db.scalar(
                select(func.count(Mission.id)).where(Mission.project_id == p.id, Mission.user_id == user["id"])
            ) or 0
            alerts_count = db.scalar(
                select(func.count(AlertEvent.id)).where(AlertEvent.project_id == p.id, AlertEvent.acknowledged.is_(False))
            ) or 0
            maintenance_count = db.scalar(
                select(func.count(MaintenanceRecord.id)).where(MaintenanceRecord.project_id == p.id)
            ) or 0
            per_project.append({
                "id": p.id,
                "name": p.name,
                "createdAt": p.created_at.astimezone(UTC).isoformat() if p.created_at and p.created_at.tzinfo else (p.created_at.replace(tzinfo=UTC).isoformat() if p.created_at else None),
                "dronesCount": drones_count,
                "missionsCount": missions_count,
                "activeAlerts": alerts_count,
                "maintenanceRecords": maintenance_count,
            })

        # Recent alerts (last 5)
        # P0-05 fix (INSPECT-BACKEND B-HIGH-02): scope by user's projects.
        recent_alerts_rows = db.scalars(
            select(AlertEvent)
            .where(AlertEvent.project_id.in_(_user_project_ids))
            .order_by(AlertEvent.created_at.desc())
            .limit(5)
        ).all()
        recent_alerts = [
            {
                "id": a.id,
                "alertType": a.alert_type,
                "severity": a.severity,
                "message": a.message,
                "droneName": a.drone_name,
                "createdAt": a.created_at.astimezone(UTC).isoformat() if a.created_at and a.created_at.tzinfo else (a.created_at.replace(tzinfo=UTC).isoformat() if a.created_at else None),
            }
            for a in recent_alerts_rows
        ]

    return JSONResponse({
        "totals": {
            "projects": total_projects,
            "drones": total_drones,
            "missions": total_missions,
            "activeAlerts": active_alerts,
            "maintenanceDue": maintenance_due,
            "batteryCycles": total_battery_cycles,
        },
        "perProject": per_project,
        "recentAlerts": recent_alerts,
        "updatedAt": datetime.now(UTC).isoformat(),
    }, headers={"Cache-Control": "no-store", "Vary": "Cookie"})
