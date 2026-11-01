"""Step-up session store with TTL + DB persistence (EXIGENCE IAM-01 / P0-06).

P0-06 fix — Previously this store was purely in-memory, so a multi-worker
deployment would lose sessions on worker restart and a session issued by
worker A would not be valid on worker B. This is unacceptable for the
LABBENCH step-up contract: every sensitive operation MUST be able to
verify the step-up session regardless of which worker served the request.

The fix is a two-tier store:
  1. **DB canonical** — the ``lab_sessions`` table (the legacy
     :class:`web.models.LabSession` class, aliased as
     :class:`web.canonical_models.LabSession`) is the source of truth.
     Every issued session is written there with a JSON payload
     (``data_json``) carrying the canonical step-up fields
     (``assurance_level``, ``state``, ``expires_at``, ``scope``, ...).
     Revocation marks the JSON ``state`` to ``revoked``.
  2. **In-memory cache** — the previous dict-based hot path remains, but
     it is now a *cache* on top of the DB. Lookups check the cache first
     and fall back to the DB on miss. This keeps the fast path fast for
     the common case (same worker, repeated operations) while ensuring
     cross-worker requests are answered correctly.

If the DB is unavailable (early-test scenarios where ``lab_sessions`` has
not been created yet, or a transient DB outage), the store degrades to
the previous in-memory behaviour. Production deployments MUST run the
``2026-10-25_canonical_labbench_schema.sql`` migration so the DB path is
usable; the degradation is a development convenience, not a production
mode.
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import UTC, datetime
from typing import Optional

from .labbench_auth import StepUpSession

log = logging.getLogger(__name__)

# In-memory cache (hot path): token -> (StepUpSession, expires_at, idempotency_key)
_store: dict[str, tuple[StepUpSession, datetime, Optional[str]]] = {}
_lock = threading.RLock()


def _row_payload(session: StepUpSession, expires_at: datetime,
                 idempotency_key: str | None, state: str = "active") -> dict:
    """Build the JSON payload stored in the LabSession.data_json column.

    The canonical step-up fields (assurance_level, state, expires_at,
    scope, idempotency_key) are serialised as JSON so the legacy table
    schema (id, user_id, project_id, data_json, created_at) can carry
    them without an ALTER TABLE migration in dev / test environments.
    Production deployments that run the canonical schema migration can
    switch to typed columns by extending this writer.
    """
    scope = getattr(session, "scope", {}) or {}
    # EXIGENCE IAM-02 — scope is a frozenset[str] in the StepUpSession
    # dataclass; JSON cannot serialise frozenset, so convert to a list
    # (sorted for deterministic output) before persisting.
    if isinstance(scope, (set, frozenset)):
        scope = sorted(scope)
    return {
        "state": state,
        "assurance_level": getattr(session, "assurance_level", "step-up"),
        "expires_at": expires_at.isoformat(),
        "scope": scope,
        "idempotency_key": idempotency_key,
        "session_id": session.session_id,
        "user_id": session.user_id,
        "project_id": session.project_id,
        "drone_id": getattr(session, "drone_id", None),
        "revision_id": getattr(session, "revision_id", None),
    }


def _session_from_payload(row, payload: dict) -> Optional[tuple[StepUpSession, datetime]]:
    """Reconstruct (StepUpSession, expires_at) from a LabSession row + payload."""
    try:
        expires_at_str = payload.get("expires_at")
        if not expires_at_str:
            return None
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if datetime.now(UTC) >= expires_at:
            return None
        if payload.get("state") != "active":
            return None
        # Reconstruct scope as frozenset (StepUpSession's expected type).
        # ``payload['scope']`` may be a list (after JSON round-trip), a set,
        # or a frozenset — coerce to frozenset for type stability.
        scope_raw = payload.get("scope", []) or []
        if isinstance(scope_raw, (list, tuple, set, frozenset)):
            scope = frozenset(scope_raw)
        else:
            scope = frozenset()
        sess = StepUpSession(
            session_id=row.id,
            user_id=row.user_id,
            project_id=row.project_id,
            drone_id=payload.get("drone_id"),
            revision_id=payload.get("revision_id"),
            assurance_level=payload.get("assurance_level", "step-up"),
            scope=scope,
            expires_at=expires_at,
        )
        return sess, expires_at
    except Exception as exc:  # noqa: BLE001
        log.debug("Failed to reconstruct StepUpSession from payload: %s", exc)
        return None


def _db_persist_session(token: str, session: StepUpSession, expires_at: datetime,
                        idempotency_key: str | None) -> None:
    """Persist (or refresh) a step-up session row in the DB canonical store."""
    try:
        from .database import SessionLocal
        from .canonical_models import LabSession
        from .models import LabSession as _LegacyLabSession  # noqa: F401 — same class
        from sqlalchemy import select
        payload = _row_payload(session, expires_at, idempotency_key, state="active")
        with SessionLocal() as db:
            existing = db.scalar(
                select(LabSession).where(LabSession.id == token)
            )
            if existing is None:
                row = LabSession(
                    id=token,
                    user_id=session.user_id,
                    project_id=session.project_id,
                    data_json=json.dumps(payload, ensure_ascii=False),
                )
                db.add(row)
            else:
                merged = json.loads(existing.data_json or "{}")
                merged.update(payload)
                existing.data_json = json.dumps(merged, ensure_ascii=False)
            db.commit()
    except Exception as exc:  # noqa: BLE001
        # DB unavailable — degrade to in-memory only (dev / test / migration)
        log.debug("DB persist failed for step-up session (degrading to in-memory): %s", exc)


def _db_fetch_session(token: str) -> Optional[tuple[StepUpSession, datetime]]:
    """Fetch a session from the DB canonical store.

    Returns (StepUpSession, expires_at) if found and active and not expired.
    """
    try:
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.scalar(select(LabSession).where(LabSession.id == token))
            if row is None:
                return None
            try:
                payload = json.loads(row.data_json or "{}")
            except Exception:  # noqa: BLE001
                payload = {}
            return _session_from_payload(row, payload)
    except Exception as exc:  # noqa: BLE001
        log.debug("DB fetch failed for step-up session (degrading to in-memory): %s", exc)
        return None


def _db_revoke_session(token: str) -> bool:
    """Mark a session revoked in the DB canonical store."""
    try:
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            row = db.scalar(select(LabSession).where(LabSession.id == token))
            if row is None:
                return False
            try:
                payload = json.loads(row.data_json or "{}")
            except Exception:  # noqa: BLE001
                payload = {}
            payload["state"] = "revoked"
            payload["revoked_at"] = datetime.now(UTC).isoformat()
            row.data_json = json.dumps(payload, ensure_ascii=False)
            db.commit()
            return True
    except Exception as exc:  # noqa: BLE001
        log.debug("DB revoke failed for step-up session (degrading to in-memory): %s", exc)
        return False


def store_session(token: str, session: StepUpSession, ttl, idempotency_key: str | None = None) -> None:
    expires = datetime.now(UTC) + ttl
    with _lock:
        # Idempotency: if the same idempotency_key is replayed with a different
        # token, return the existing token's session (see `lookup_by_idempotency`).
        if idempotency_key:
            for existing_token, (existing_sess, _, existing_key) in _store.items():
                if existing_key == idempotency_key:
                    # Idempotent replay — keep the original token
                    _store[existing_token] = (existing_sess, existing_sess.expires_at, existing_key)
                    _db_persist_session(existing_token, existing_sess, existing_sess.expires_at, existing_key)
                    return
        _store[token] = (session, expires, idempotency_key)
    # DB canonical write — happens outside the in-memory lock to keep the hot
    # path fast; the in-memory cache is already populated so concurrent reads
    # on this worker see the new session immediately.
    _db_persist_session(token, session, expires, idempotency_key)
    log.debug("session stored: user=%s project=%s ttl=%s", session.user_id, session.project_id, ttl)


def get_session(token: str) -> Optional[StepUpSession]:
    # Hot path: in-memory cache
    with _lock:
        entry = _store.get(token)
        if entry is not None:
            sess, expires, _key = entry
            if datetime.now(UTC) >= expires:
                # Lazy purge
                _store.pop(token, None)
            else:
                return sess
    # Cache miss — fall back to DB canonical (cross-worker or post-restart)
    fetched = _db_fetch_session(token)
    if fetched is None:
        return None
    sess, expires = fetched
    # Re-populate the cache so subsequent reads on this worker stay fast.
    with _lock:
        _store[token] = (sess, expires, None)
    return sess


def revoke_session(token: str) -> bool:
    """Revoke a session — both in-memory cache and DB canonical store."""
    with _lock:
        existed = token in _store
        _store.pop(token, None)
    db_existed = _db_revoke_session(token)
    if existed:
        log.info("session revoked: token=%s...", token[:8])
    return existed or db_existed


def lookup_by_idempotency(idempotency_key: str) -> Optional[StepUpSession]:
    """Retrieve a session by its idempotency_key (for retry-safe step-up requests)."""
    with _lock:
        for sess, _, key in _store.values():
            if key == idempotency_key:
                return sess
    # DB fallback — scan active sessions for a matching idempotency_key.
    try:
        from .database import SessionLocal
        from .canonical_models import LabSession
        from sqlalchemy import select
        with SessionLocal() as db:
            rows = db.scalars(
                select(LabSession).where(LabSession.data_json.like(f'%{idempotency_key}%'))
            ).all()
            for row in rows:
                try:
                    payload = json.loads(row.data_json or "{}")
                except Exception:  # noqa: BLE001
                    continue
                if payload.get("idempotency_key") != idempotency_key:
                    continue
                if payload.get("state") != "active":
                    continue
                fetched = _session_from_payload(row, payload)
                if fetched is not None:
                    sess, _ = fetched
                    return sess
    except Exception as exc:  # noqa: BLE001
        log.debug("DB lookup_by_idempotency failed: %s", exc)
    return None


def purge_expired() -> int:
    """Purge all expired sessions from the cache. DB rows are lazy-purged
    on next access. Returns count purged from the cache only (cheap)."""
    now = datetime.now(UTC)
    with _lock:
        expired = [t for t, (_, exp, _) in _store.items() if now >= exp]
        for t in expired:
            _store.pop(t, None)
    return len(expired)


def reset_store() -> None:
    """Test helper — clear all sessions. Use ONLY in test fixtures."""
    with _lock:
        _store.clear()


__all__ = [
    "store_session", "get_session", "revoke_session",
    "lookup_by_idempotency", "purge_expired", "reset_store",
]
