"""Server-side alert management for the fleet telemetry streamer.

Alerts are persisted in the `alert_events` table (append-only, audit-trail
linked). The streamer calls raise_alert when it detects a battery/geofence/
heartbeat condition; the frontend reads them via /api/hardware/alerts.

Acknowledgement: an alert can be acknowledged (cleared from the live feed)
by an authenticated operator. Acknowledged alerts remain in the audit log.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from .models import AlertEvent


def raise_alert(
    db: Session,
    project_id: str | None,
    drone_id: str | None,
    drone_name: str,
    *,
    alert_type: str,
    severity: str,
    message: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Insert an AlertEvent row. Returns a flat dict (no DB row) for the streamer."""
    alert_id = str(uuid4())
    payload_json = json.dumps(payload or {}, ensure_ascii=False, separators=(",", ":"))
    alert = AlertEvent(
        id=alert_id,
        project_id=project_id,
        drone_id=drone_id,
        drone_name=drone_name,
        alert_type=alert_type,
        severity=severity,
        message=message,
        payload_json=payload_json,
        acknowledged=False,
        created_at=datetime.now(UTC),
    )
    db.add(alert)
    db.commit()
    return {
        "id": alert_id,
        "alertType": alert_type,
        "severity": severity,
        "message": message,
        "droneId": drone_id,
        "droneName": drone_name,
        "projectId": project_id,
        "acknowledged": False,
        "createdAt": alert.created_at.astimezone(UTC).isoformat() if alert.created_at.tzinfo else alert.created_at.replace(tzinfo=UTC).isoformat(),
    }


def list_recent_alerts(
    db: Session,
    project_id: str | None = None,
    drone_id: str | None = None,
    only_unacknowledged: bool = True,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return recent alerts (newest first) for the frontend alert feed."""
    stmt = select(AlertEvent)
    if project_id:
        stmt = stmt.where(AlertEvent.project_id == project_id)
    if drone_id:
        stmt = stmt.where(AlertEvent.drone_id == drone_id)
    if only_unacknowledged:
        stmt = stmt.where(AlertEvent.acknowledged.is_(False))
    stmt = stmt.order_by(desc(AlertEvent.created_at)).limit(limit)
    rows = db.scalars(stmt).all()
    return [
        {
            "id": r.id,
            "alertType": r.alert_type,
            "severity": r.severity,
            "message": r.message,
            "droneId": r.drone_id,
            "droneName": r.drone_name,
            "projectId": r.project_id,
            "acknowledged": r.acknowledged,
            "createdAt": r.created_at.astimezone(UTC).isoformat() if r.created_at.tzinfo else r.created_at.replace(tzinfo=UTC).isoformat(),
            "payload": json.loads(r.payload_json or "{}"),
        }
        for r in rows
    ]


def acknowledge_alert(db: Session, alert_id: str, user_id: str, user_email: str | None = None) -> dict[str, Any]:
    """Mark an alert as acknowledged. Returns the updated alert dict."""
    alert = db.get(AlertEvent, alert_id)
    if alert is None:
        return {"error": "not_found"}
    alert.acknowledged = True
    alert.acknowledged_by = user_id
    alert.acknowledged_at = datetime.now(UTC)
    db.commit()
    return {
        "id": alert.id,
        "acknowledged": True,
        "acknowledgedBy": user_id,
        "acknowledgedAt": alert.acknowledged_at.astimezone(UTC).isoformat() if alert.acknowledged_at and alert.acknowledged_at.tzinfo else (alert.acknowledged_at.replace(tzinfo=UTC).isoformat() if alert.acknowledged_at else None),
    }
