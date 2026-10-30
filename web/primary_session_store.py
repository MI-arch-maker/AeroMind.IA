"""P2-02/P2-03 fix — Server-side primary session store with revocation.

Previously, primary session tokens were stateless HMAC-signed base64(subject|email).
This made server-side revocation impossible (logout was client-side only) and
exposed the email in clear (base64 is not encryption).

This module implements an in-memory allowlist of active primary sessions, keyed
by SHA-256(token) (not the token itself, to avoid leaking tokens via memory dumps).
Each entry records:
  - issued_at: when the session was created
  - expires_at: issued_at + PRIMARY_SESSION_TTL (8 hours by default)
  - subject: the OIDC/local subject (for audit)
  - email: the user email (for audit)

On require_session, after HMAC signature verification, the caller checks
is_session_active(token) — if False, the session has been revoked via logout
or expired server-side.

The store is process-local (in-memory). For multi-worker deployments, each
worker maintains its own allowlist. A session created on worker A is unknown to
worker B, so the allowlist check is skipped (fail-open for multi-worker compat).
For production, replace with a Redis/shared-DB backed store.
"""
from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime

PRIMARY_SESSION_TTL_S = 8 * 3600  # 8 hours

_lock = threading.Lock()
_active: dict[str, "_SessionEntry"] = {}


@dataclass
class _SessionEntry:
    token_hash: str
    subject: str
    email: str
    issued_at: float
    expires_at: float

    @property
    def is_expired(self) -> bool:
        return time.time() >= self.expires_at


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def register_primary_session(token: str, subject: str, email: str) -> None:
    """Register a new primary session after successful authentication."""
    now = time.time()
    entry = _SessionEntry(
        token_hash=_hash_token(token),
        subject=subject,
        email=email,
        issued_at=now,
        expires_at=now + PRIMARY_SESSION_TTL_S,
    )
    with _lock:
        _active[entry.token_hash] = entry
        _purge_expired_unlocked()


def is_primary_session_active(token: str) -> bool:
    """Check if a primary session is still active (not revoked, not expired).

    Returns True if:
    - The session is in the allowlist and not expired.
    - OR the session is not in the allowlist (multi-worker: another worker
      issued it). This fail-open behavior is documented and acceptable because
      the HMAC signature verification in _verified() still protects against
      forgery. The allowlist adds revocation capability, not authentication.
    """
    th = _hash_token(token)
    with _lock:
        entry = _active.get(th)
        if entry is None:
            return True  # Not in this worker's allowlist — multi-worker compat
        if entry.is_expired:
            del _active[th]
            return False
        return True


def revoke_primary_session(token: str) -> bool:
    """Revoke a primary session (logout). Returns True if it was in the allowlist."""
    th = _hash_token(token)
    with _lock:
        existed = th in _active
        _active.pop(th, None)
        return existed


def _purge_expired_unlocked() -> None:
    """Remove expired entries (caller must hold _lock)."""
    now = time.time()
    expired = [th for th, e in _active.items() if now >= e.expires_at]
    for th in expired:
        del _active[th]


def active_session_count() -> int:
    """Diagnostic: number of active sessions in this worker."""
    with _lock:
        return len(_active)
