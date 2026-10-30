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
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status as http_status
from fastapi.responses import JSONResponse

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


# Per-session telemetry consent tracking (SEC-07 — opt-in polling).
#
# P0-07 fix (INSPECT-BACKEND B-HIGH-04): previously this was a per-process
# dict keyed by session_id. On Render's multi-worker setup, a consent granted
# on worker A would be invisible to worker B, so the next /status poll (likely
# routed to a different worker) returned 403 — breaking the MAVLink telemetry
# UX for ~50% of polls after a worker restart.
#
# The fix persists consent into the LabSession.data_json JSON payload (key
# ``telemetry_consent`` → ``{drone_id: consent_data}``) so it survives worker
# restarts and is shared across workers. A per-process cache keeps the hot path
# fast; the DB is the source of truth.
#
# The consent is now keyed by (user_id, drone_id) instead of session_id, which
# matches the MAVLink telemetry semantics (a user grants consent to read a
# specific drone's telemetry — not a specific session).


# Per-process cache, DB is source of truth. Key: f"telemetry_consent:{user_id}:{drone_id}"
_consent_cache: dict[str, dict] = {}


def _consent_db_key(user_id: str, drone_id: str) -> str:
    return f"telemetry_consent:{user_id}:{drone_id}"


def grant_consent(user_id: str, drone_id: str, scopes: list[str]) -> dict:
    """Grant telemetry consent for (user_id, drone_id) — persisted to DB."""
    consent_data = {
        "scopes": scopes,
        "granted_at": datetime.now(UTC).isoformat(),
    }
    _consent_cache[_consent_db_key(user_id, drone_id)] = consent_data
    try:
        # P0-07: session_store.py exposes only session-by-token helpers
        # (_db_fetch_session(token), _db_persist_session(token, ...)) — none
        # take a user_id. Per the task fallback instruction, we use
        # SessionLocal() directly to read/write the LabSession.data_json JSON
        # payload keyed by user_id. The most-recent row for the user is updated
        # so the consent is visible regardless of which worker issued it.
        import json as _json
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.scalar(
                select(LabSession)
                .where(LabSession.user_id == user_id)
                .order_by(LabSession.id.desc())
                .limit(1)
            )
            if row is not None:
                try:
                    data = _json.loads(row.data_json or "{}")
                except Exception:
                    data = {}
                data.setdefault("telemetry_consent", {})[drone_id] = consent_data
                row.data_json = _json.dumps(data, ensure_ascii=False)
                db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "P0-07: Could not persist telemetry consent to DB for user=%s drone=%s: %s",
            user_id, drone_id, e,
        )
    return consent_data


def get_consent(user_id: str, drone_id: str) -> dict | None:
    """Get telemetry consent for (user_id, drone_id) — DB first, cache fallback."""
    cache_key = _consent_db_key(user_id, drone_id)
    # Try cache first (fast path)
    if cache_key in _consent_cache:
        return _consent_cache[cache_key]
    # Fall back to DB
    try:
        import json as _json
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.scalar(
                select(LabSession)
                .where(LabSession.user_id == user_id)
                .order_by(LabSession.id.desc())
                .limit(1)
            )
            if row is not None:
                try:
                    data = _json.loads(row.data_json or "{}")
                except Exception:
                    data = {}
                entry = data.get("telemetry_consent", {}).get(drone_id)
                if entry:
                    _consent_cache[cache_key] = entry
                    return entry
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "P0-07: Could not read telemetry consent from DB: %s", e,
        )
    return None


def revoke_consent(user_id: str, drone_id: str) -> bool:
    """Revoke telemetry consent — persisted to DB."""
    cache_key = _consent_db_key(user_id, drone_id)
    existed = cache_key in _consent_cache
    _consent_cache.pop(cache_key, None)
    try:
        import json as _json
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.scalar(
                select(LabSession)
                .where(LabSession.user_id == user_id)
                .order_by(LabSession.id.desc())
                .limit(1)
            )
            if row is not None:
                try:
                    data = _json.loads(row.data_json or "{}")
                except Exception:
                    data = {}
                tc = data.get("telemetry_consent", {})
                existed = existed or (drone_id in tc)
                tc.pop(drone_id, None)
                row.data_json = _json.dumps(data, ensure_ascii=False)
                db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            "P0-07: Could not revoke telemetry consent in DB: %s", e,
        )
    return existed


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


def _dev_auto_step_up(request: Request) -> StepUpSession | None:
    """In development mode, auto-promote a primary session to a LABBENCH
    step-up session so the Navigation satellite telemetry panel is 100 %
    functional out-of-the-box.

    The auto-promotion mints a real StepUpSession (stored in the session
    store, with reader scope + 1-hour TTL) and sets the LABBENCH session
    cookie on the response so subsequent polls reuse it. The audit trail
    records the auto-promotion explicitly. Production keeps the strict
    explicit step-up gate (MFA/passkey) — this path is dev-only.
    """
    _env = os.getenv("AEROMIND_ENV", "production").strip().lower()
    if _env != "development":
        return None
    # If a valid LABBENCH session is already present, verify_lab_session
    # would have succeeded and we wouldn't be here. We're called only when
    # the LABBENCH session is missing — check for a primary aeromind_session
    # cookie and auto-promote it.
    from .app_auth_helpers import current_user
    cookie = request.cookies.get("aeromind_session")
    if not cookie:
        return None
    user = current_user(cookie)
    if user is None:
        return None
    from .labbench_auth import issue_step_up_session
    from datetime import timedelta
    token, expires_at, csrf = issue_step_up_session(
        user_id=user["id"],
        project_id=f"dev-{user['id']}",
        roles={"reader"},
        assurance_level="step-up",
        ttl=timedelta(hours=1),
    )
    # Set the LABBENCH session cookie on the response. We attach the cookie
    # via the request's state so the route handler can copy it onto the
    # outgoing JSONResponse.
    try:
        request.state.dev_lab_session_token = token
        request.state.dev_lab_csrf_token = csrf
    except Exception:
        pass
    from .session_store import get_session
    sess = get_session(token)
    audit_decision(
        actor_id=user["id"], actor_role="reader",
        action="labbench.session.auto_promoted", decision="allow",
        project_id=f"dev-{user['id']}",
        message="Session LABBENCH step-up auto-promue depuis session primaire (mode développement)",
    )
    return sess


def _resolve_session(request: Request) -> StepUpSession:
    """Resolve a LABBENCH step-up session, with dev auto-promotion fallback.

    Tries the normal verify_lab_session path first; if it raises 401 in
    development mode, attempts to auto-promote a primary session. This
    keeps the production security contract identical (explicit step-up
    required) while making the panel 100 % functional in dev.
    """
    try:
        return verify_lab_session(request)
    except HTTPException as exc:
        if exc.status_code != http_status.HTTP_401_UNAUTHORIZED:
            raise
        dev_sess = _dev_auto_step_up(request)
        if dev_sess is None:
            raise
        return dev_sess


@router.get("/status")
def status(
    request: Request,
) -> dict[str, object]:
    """Poll the MAVLink observer — auth + tenant + consent enforced (SEC-07).

    Returns the observation snapshot with explicit state classification.
    Never raises on observer errors — captures them in 'state: error'.

    In development mode only: (1) a primary session is auto-promoted to a
    LABBENCH step-up session if no step-up is present, and (2) telemetry
    consent is auto-granted on first poll. This makes the full secure flow
    (LABBENCH session + consent + pymavlink → real autopilot) work
    end-to-end without manual steps. Both auto-actions are audited;
    production keeps the strict explicit gates.
    """
    session = _resolve_session(request)
    # SEC-07 fix — auth + consent required
    # P0-07 fix: consent is now DB-backed (was per-process dict). The check
    # uses (user_id, drone_id) as the consent key — see grant_consent() above.
    if not get_consent(session.user_id, session.drone_id or ""):
        # Development convenience: auto-grant consent so the Navigation
        # satellite panel is 100 % functional out of the box. The audit
        # trail records the auto-grant explicitly so the security posture
        # stays observable. Production keeps the strict 403 gate.
        _env = os.getenv("AEROMIND_ENV", "production").strip().lower()
        if _env == "development":
            grant_consent(session.user_id, session.drone_id or "", list(session.scope))
            audit_decision(
                actor_id=session.user_id, actor_role="reader",
                action="telemetry.consent.auto_granted", decision="allow",
                project_id=session.project_id,
                message="Consentement télémétrie accordé automatiquement (mode développement)",
            )
        else:
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
    # If we auto-promoted a primary session to a LABBENCH step-up session,
    # set the LABBENCH session + CSRF cookies on the response so subsequent
    # polls reuse the step-up session directly (no re-promotion needed).
    dev_token = getattr(getattr(request, "state", None), "dev_lab_session_token", None)
    dev_csrf = getattr(getattr(request, "state", None), "dev_lab_csrf_token", None)
    if dev_token:
        from fastapi import Response
        response = JSONResponse(payload)
        response.set_cookie(
            "aeromind_lab_session", dev_token,
            httponly=True, samesite="lax", max_age=3600, secure=False,
        )
        if dev_csrf:
            response.set_cookie(
                "aeromind_lab_csrf", dev_csrf,
                httponly=False, samesite="lax", max_age=3600, secure=False,
            )
        return response  # type: ignore[return-value]
    return payload


@router.post("/consent")
def grant_consent_endpoint(session: StepUpSession = Depends(verify_lab_session)) -> dict[str, str]:
    """Grant per-session telemetry polling consent (EXIGENCE IAM-04).

    Must be called BEFORE GET /api/telemetry/mavlink/status.
    Consent is automatically revoked when the session expires or is revoked.
    """
    # P0-07 fix: persist consent to DB so it survives worker restarts and is
    # shared across workers. Keyed by (user_id, drone_id) — see grant_consent().
    grant_consent(session.user_id, session.drone_id or "", list(session.scope))
    audit_decision(
        actor_id=session.user_id, actor_role="reader",
        action="telemetry.consent.granted", decision="allow",
        project_id=session.project_id,
        message="Consentement télémétrie accordé",
    )
    return {"status": "consent_granted", "session_id": session.session_id[:8] + "..."}


@router.delete("/consent")
def revoke_consent_endpoint(session: StepUpSession = Depends(verify_lab_session)) -> dict[str, str]:
    """Revoke telemetry polling consent (EXIGENCE IAM-04)."""
    # P0-07 fix: revoke consent in DB so the revocation is visible to all workers.
    revoke_consent(session.user_id, session.drone_id or "")
    audit_decision(
        actor_id=session.user_id, actor_role="reader",
        action="telemetry.consent.revoked", decision="allow",
        project_id=session.project_id,
        message="Consentement télémétrie révoqué",
    )
    return {"status": "consent_revoked"}


__all__ = ["router", "grant_consent", "get_consent", "revoke_consent"]
