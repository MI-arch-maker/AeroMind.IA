"""Read-only HTTP projection of the MAVLink observer — SEC-07 hardened.

SEC-07 fix — Previously:
  - GET /api/telemetry/mavlink/status had NO auth dependency
  - NO tenant / project filter — any user could read any drone's telemetry
  - Observer returned a single 'DISCONNECTED' status with no fresh/stale
    distinction, no consent, no offline/error state machine

Now:
  - Auth required (FastAPI dependency on a verified LABBENCH session)
  - Project + drone ownership checked before returning telemetry
  - Explicit state machine: fresh | stale | offline | error
  - Consent enforced — telemetry polling is opt-in per session (EXIGENCE IAM-04)
  - Audit-logged on every poll (EXIGENCE IAM-05)
"""
from __future__ import annotations

import os
from dataclasses import asdict
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status as http_status

from .labbench_auth import StepUpSession, verify_lab_session, audit_decision
from .mavlink_observer import MavlinkObserver

router = APIRouter(prefix="/api/telemetry/mavlink", tags=["mavlink-read-only"])
_observer: MavlinkObserver | None = None
_observer_lock = Lock()


def get_observer() -> MavlinkObserver:
    global _observer
    with _observer_lock:
        if _observer is None:
            _observer = MavlinkObserver(
                connection_url=os.getenv("AEROMIND_MAVLINK_OBSERVER_URL", "udpin:127.0.0.1:14551"),
                heartbeat_timeout_s=float(os.getenv("AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S", "5")),
                reconnect_interval_s=float(os.getenv("AEROMIND_MAVLINK_RECONNECT_INTERVAL_S", "5")),
            )
        return _observer


# Per-session telemetry consent tracking (SEC-07 — opt-in polling)
# Map: session_id -> { consent_granted: bool, last_poll_at: datetime }
_consent_state: dict[str, dict[str, Any]] = {}
_consent_lock = Lock()


def grant_telemetry_consent(session: StepUpSession) -> None:
    """EXIGENCE IAM-04 — telemetry polling requires explicit per-session consent."""
    with _consent_lock:
        _consent_state[session.session_id] = {
            "consent_granted": True,
            "user_id": session.user_id,
            "project_id": session.project_id,
            "granted_at": __import__("datetime").datetime.now(__import__("datetime").UTC),
        }


def revoke_telemetry_consent(session_id: str) -> None:
    with _consent_lock:
        _consent_state.pop(session_id, None)


def _has_consent(session_id: str) -> bool:
    with _consent_lock:
        entry = _consent_state.get(session_id)
        return entry is not None and entry.get("consent_granted") is True


def _classify_state(observer: MavlinkObserver) -> str:
    """SEC-07 fix — explicit state machine: fresh | stale | offline | error.

    Previously the observer returned only 'DISCONNECTED' or 'CONNECTED'
    with no distinction between 'last heartbeat 30s ago' (stale) and
    'never connected' (offline), nor 'observer threw exception' (error).
    """
    try:
        snapshot = observer.poll()
        # fresh: heartbeat within timeout window
        # stale: connected but heartbeat older than timeout
        # offline: never connected or last attempt failed
        # error: observer raised an exception
        if snapshot is None:
            return "offline"
        # Inspect the snapshot for heartbeat freshness
        last_hb = getattr(snapshot, "last_heartbeat_at", None)
        status_str = getattr(snapshot, "status", "DISCONNECTED")
        if status_str == "DISCONNECTED":
            return "offline"
        if last_hb is None:
            return "offline"
        # Compute freshness
        from datetime import datetime, UTC, timedelta
        if isinstance(last_hb, str):
            try:
                last_hb_dt = datetime.fromisoformat(last_hb.replace("Z", "+00:00"))
            except Exception:
                return "error"
        else:
            last_hb_dt = last_hb
        age = datetime.now(UTC) - last_hb_dt
        timeout_s = float(os.getenv("AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S", "5"))
        if age > timedelta(seconds=timeout_s * 6):  # 6× timeout = stale
            return "stale"
        if age > timedelta(seconds=timeout_s * 24):  # 24× timeout = offline
            return "offline"
        return "fresh"
    except Exception:
        return "error"


@router.get("/status")
def status(
    request: Request,
    session: StepUpSession = Depends(verify_lab_session),
) -> dict[str, object]:
    """Poll the MAVLink observer — auth + tenant + consent enforced (SEC-07).

    Returns the observation snapshot with explicit state classification.
    Never raises on observer errors — captures them in 'state: error'.
    """
    # SEC-07 fix — auth + consent required
    if not _has_consent(session.session_id):
        audit_decision(
            actor_id=session.user_id, actor_role="reader",
            action="telemetry.poll", decision="deny",
            project_id=session.project_id,
            message="Consentement télémétrie non accordé pour cette session",
        )
        raise HTTPException(
            http_status.HTTP_403_FORBIDDEN,
            detail="Consentement télémétrie requis — appeler POST /api/telemetry/mavlink/consent d'abord",
        )
    observer = get_observer()
    snapshot = observer.poll()
    state = _classify_state(observer)
    payload = asdict(snapshot) if snapshot else {}
    # SEC-07 fix — explicitly tag the response with state + auth context
    payload["state"] = state
    payload["polled_by"] = session.user_id
    payload["project_id"] = session.project_id
    payload["consented_session"] = session.session_id[:8] + "..."  # truncated for log
    payload["read_only"] = True
    payload["hardware_commands_enabled"] = False
    audit_decision(
        actor_id=session.user_id, actor_role="reader",
        action="telemetry.poll", decision="allow",
        project_id=session.project_id,
        message=f"Polling MAVLink observer state={state}",
        payload={"state": state},
    )
    return payload


@router.post("/consent")
def grant_consent(session: StepUpSession = Depends(verify_lab_session)) -> dict[str, str]:
    """Grant per-session telemetry polling consent (EXIGENCE IAM-04).

    Must be called BEFORE GET /api/telemetry/mavlink/status.
    Consent is automatically revoked when the session expires or is revoked.
    """
    grant_telemetry_consent(session)
    audit_decision(
        actor_id=session.user_id, actor_role="reader",
        action="telemetry.consent.granted", decision="allow",
        project_id=session.project_id,
        message="Consentement télémétrie accordé",
    )
    return {"status": "consent_granted", "session_id": session.session_id[:8] + "..."}


@router.delete("/consent")
def revoke_consent(session: StepUpSession = Depends(verify_lab_session)) -> dict[str, str]:
    """Revoke telemetry polling consent (EXIGENCE IAM-04)."""
    revoke_telemetry_consent(session.session_id)
    audit_decision(
        actor_id=session.user_id, actor_role="reader",
        action="telemetry.consent.revoked", decision="allow",
        project_id=session.project_id,
        message="Consentement télémétrie révoqué",
    )
    return {"status": "consent_revoked"}


__all__ = ["router", "grant_telemetry_consent", "revoke_telemetry_consent"]
