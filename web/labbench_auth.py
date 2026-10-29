"""AeroMind LABBENCH-01 — Centralized identity, step-up auth, RBAC, audit.

Implements EXIGENCE IAM-01..05 from the Option C FAST-TRACK cahier des charges:

IAM-01 — AeroMind primary auth + LABBENCH step-up (MFA/passkey), no second password
IAM-02 — Server-side RBAC/ABAC: reader, designer, analyst, operator, approver, admin
IAM-03 — Operator and approver are distinct server-side identities
IAM-04 — Each sensitive action requires its own explicit authorization
IAM-05 — Tamper-evident audit log (append-only, restricted, retention)

This module is the SINGLE entry point for LABBENCH authorization checks.
Hardware gate, mission upload, telemetry, geofence, etc. MUST go through
`require_lab_session(...)`, `require_role(...)`, `audit_decision(...)`.
"""
from __future__ import annotations

import hmac
import hashlib
import secrets
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, Request, status

from .config import Settings

# Get a singleton settings instance lazily (avoid import-time pydantic validation)
_settings_instance = None

def _get_settings():
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance

# Alias for backward compatibility
class _SettingsProxy:
    def __getattr__(self, name):
        return getattr(_get_settings(), name)

settings = _SettingsProxy()

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Roles (EXIGENCE IAM-02)
# ─────────────────────────────────────────────────────────────────────────────
ROLES = frozenset({
    "reader",      # Read-only access to project data, telemetry, runs
    "designer",    # Edit drone configurations, sketches, materials
    "analyst",     # Run simulations/tests, view measurements
    "operator",    # Request hardware commands (must be approved)
    "approver",    # Approve hardware commands (must differ from operator)
    "admin",       # Manage project members, geofence, gates
})
ROLE_HIERARCHY = {
    "reader":   1,
    "designer": 2,
    "analyst":  3,
    "operator": 4,
    "approver": 4,    # same level as operator but distinct role
    "admin":    5,
}
# Per-role action permissions (RBAC matrix — EXIGENCE IAM-04)
PERMISSIONS = {
    "reader":   {"project.read", "drone.read", "run.read", "measurement.read", "telemetry.read"},
    "designer": {"project.read", "drone.read", "drone.write", "sketch.save", "configuration.version",
                 "run.read", "measurement.read"},
    "analyst":  {"project.read", "drone.read", "run.create", "run.read", "run.cancel",
                 "measurement.read", "telemetry.read"},
    "operator": {"project.read", "drone.read", "run.read", "telemetry.read",
                  "hardware.command.request", "mission.upload.request", "geofence.read"},
    "approver": {"project.read", "drone.read", "run.read", "telemetry.read",
                 "hardware.command.approve", "mission.upload.approve", "geofence.read"},
    "admin":    {"project.*", "drone.*", "run.*", "measurement.*", "telemetry.*",
                 "member.manage", "geofence.write", "gate.manage"},
}

# Step-up session lifetime — short by design (EXIGENCE IAM-01)
STEP_UP_DEFAULT_TTL = timedelta(minutes=15)
STEP_UP_MAX_TTL = timedelta(hours=1)


# ─────────────────────────────────────────────────────────────────────────────
# Step-up session representation
# ─────────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class StepUpSession:
    """In-flight step-up session info (DB row lives in LabSession table).

    Bound to user_id + project_id + drone_id (optional) + revision_id (optional).
    Carries assurance_level, scope, expires_at — verified on every sensitive call.
    """
    session_id: str
    user_id: str
    project_id: str
    drone_id: str | None
    revision_id: str | None
    assurance_level: str  # 'step-up' | 'mfa' | 'passkey'
    expires_at: datetime
    scope: frozenset[str]

    @property
    def is_expired(self) -> bool:
        return datetime.now(UTC) >= self.expires_at

    def has_scope(self, perm: str) -> bool:
        return perm in self.scope


# ─────────────────────────────────────────────────────────────────────────────
# Session cookie/token handling
# ─────────────────────────────────────────────────────────────────────────────
SESSION_COOKIE_NAME = "aeromind_lab_session"
SESSION_HEADER_NAME = "X-Lab-Session"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_COOKIE_NAME = "aeromind_lab_csrf"


def _extract_session_token(request: Request) -> str | None:
    """Extract LABBENCH session token from header (preferred) or HttpOnly cookie.

    Header takes precedence to support API clients without cookies.
    """
    # 1. Header
    header = request.headers.get(SESSION_HEADER_NAME)
    if header and header.startswith("Lab "):
        return header[4:].strip()
    # 2. Cookie (HttpOnly — usable by browsers)
    cookie = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie:
        return cookie
    return None


def _extract_csrf_token(request: Request) -> str | None:
    """CSRF token from header (must match cookie for double-submit pattern)."""
    header = request.headers.get(CSRF_HEADER_NAME)
    if header:
        return header
    return None


def verify_csrf_double_submit(request: Request) -> None:
    """EXIGENCE IAM-01 — CSRF protection via double-submit cookie pattern.

    For state-changing methods (POST/PUT/PATCH/DELETE), the X-CSRF-Token header
    must equal the aeromind_lab_csrf cookie value (constant-time comparison).
    """
    if request.method.upper() not in {"POST", "PUT", "PATCH", "DELETE"}:
        return
    header_token = _extract_csrf_token(request)
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    if not header_token or not cookie_token:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="CSRF token manquant — header X-CSRF-Token et cookie aeromind_lab_csrf requis",
        )
    if not hmac.compare_digest(header_token, cookie_token):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="CSRF token invalide — header et cookie ne correspondent pas",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Session verification (EXIGENCE IAM-01)
# ─────────────────────────────────────────────────────────────────────────────
def verify_lab_session(request: Request):
    """Verify LABBENCH step-up session on every sensitive call.

    Returns StepUpSession if valid, raises 401/403 otherwise.
    This is the EXIGE IAM-01 'verification de fraîcheur de l'authentification
    à chaque appel sensible'.

    NOTE: Defined as a sync function so FastAPI's dependency injection works
    with both sync and async routes. For async routes, FastAPI handles the
    dispatch automatically.
    """
    token = _extract_session_token(request)
    if not token:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Session LABBENCH requise — étape d'authentification step-up absente",
        )
    # Look up the session (delegates to a session store; see session_store.py)
    from .session_store import get_session
    sess = get_session(token)
    if sess is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Session LABBENCH introuvable ou révoquée",
        )
    if sess.is_expired:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Session LABBENCH expirée — renouveler l'authentification step-up",
        )
    return sess


async def verify_lab_session_async(request: Request) -> StepUpSession:
    """Async version for use in async routes."""
    return verify_lab_session(request)


async def require_role(*roles: str) -> "callable":
    """Dependency factory — require the LABBENCH session to hold one of `roles`.

    Usage:
        @router.post("/drones/{drone_id}/command",
                     dependencies=[Depends(require_role("operator"))])
        async def command_drone(...): ...
    """
    required = set(roles)
    invalid = required - ROLES
    if invalid:
        raise ValueError(f"Unknown roles: {invalid}. Valid: {ROLES}")

    async def _checker(sess: StepUpSession = Depends(verify_lab_session)) -> StepUpSession:
        # Check that session scope intersects required roles
        if not (required & sess.scope):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Rôle insuffisant. Requis: {sorted(required)}. Session: {sorted(sess.scope)}",
            )
        return sess
    return _checker


async def require_project_owner_or_role(
    sess: StepUpSession,
    project_owner_id: str,
    *roles: str,
) -> None:
    """Verify that the session user is either the project owner OR has one of `roles`.

    EXIGENCE IAM-02 — moindre privilège et cloisonnement tenant/projet/drone.
    """
    if sess.user_id == project_owner_id:
        return
    if set(roles) & sess.scope:
        return
    raise HTTPException(
        status.HTTP_403_FORBIDDEN,
        detail=f"Accès refusé — propriétaire du projet ou rôle {sorted(roles)} requis",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Step-up session issuance (after MFA/passkey verification)
# ─────────────────────────────────────────────────────────────────────────────
def issue_step_up_session(
    user_id: str,
    project_id: str,
    roles: set[str],
    assurance_level: str = "step-up",
    drone_id: str | None = None,
    revision_id: str | None = None,
    ttl: timedelta = STEP_UP_DEFAULT_TTL,
    idempotency_key: str | None = None,
) -> tuple[str, datetime, str]:
    """Issue a short-lived step-up LABBENCH session.

    Returns (session_token, expires_at, csrf_token).
    The session_token should be set as an HttpOnly cookie ; the csrf_token as
    a non-HttpOnly cookie so the client JS can include it in X-CSRF-Token header.

    EXIGENCE IAM-01 — durée de validité limitée, renouvellement lors des opérations sensibles.
    """
    if ttl > STEP_UP_MAX_TTL:
        ttl = STEP_UP_MAX_TTL
    if assurance_level not in {"step-up", "mfa", "passkey"}:
        raise ValueError(f"Invalid assurance_level: {assurance_level}")
    invalid_roles = set(roles) - ROLES
    if invalid_roles:
        raise ValueError(f"Invalid roles: {invalid_roles}")
    # V5 LOT D / R-04 — idempotent replay: if the same idempotency_key was
    # already used to issue a session, return the SAME token (so the caller
    # can safely retry after a network error). The session_store deduplicates
    # by idempotency_key in its in-memory cache; for cross-worker replay we
    # fall back to the DB canonical lookup.
    if idempotency_key:
        from .session_store import lookup_by_idempotency
        existing = lookup_by_idempotency(idempotency_key)
        if existing is not None and not existing.is_expired:
            # Return the existing session — its CSRF token was already
            # returned to the caller on first issuance. We re-mint a new
            # CSRF token here so the caller can use either; this is a
            # minor deviation from the strictest idempotency contract but
            # keeps the API ergonomic (the original CSRF token is lost
            # across retries).
            return existing.session_id, existing.expires_at, secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + ttl
    session_token = secrets.token_urlsafe(48)
    csrf_token = secrets.token_urlsafe(32)
    # Persist via session_store (lazy import to avoid circular)
    from .session_store import store_session
    store_session(
        token=session_token,
        session=StepUpSession(
            session_id=session_token,  # token == id for simplicity
            user_id=user_id,
            project_id=project_id,
            drone_id=drone_id,
            revision_id=revision_id,
            assurance_level=assurance_level,
            expires_at=expires_at,
            scope=frozenset(roles),
        ),
        ttl=ttl,
        idempotency_key=idempotency_key,
    )
    return session_token, expires_at, csrf_token


def revoke_step_up_session(token: str) -> bool:
    """Revoke a step-up session immediately (logout, role change, security event)."""
    from .session_store import revoke_session
    return revoke_session(token)


# ─────────────────────────────────────────────────────────────────────────────
# Audit decision logging (EXIGENCE IAM-05)
# ─────────────────────────────────────────────────────────────────────────────
def audit_decision(
    *,
    actor_id: str,
    actor_role: str,
    action: str,
    decision: str,            # 'allow' | 'deny' | 'error'
    project_id: str | None = None,
    drone_id: str | None = None,
    resource_id: str | None = None,
    correlation_id: str | None = None,
    message: str = "",
    payload: dict | None = None,
) -> None:
    """Append a tamper-evident audit decision record.

    EXIGENCE IAM-05 — Journaux d'audit inviolables (append-only, accès restreint, rétention).
    The record is written to audit_events_ext table (canonical_models.AuditEventExt).
    Never raises — audit logging failure should never block the operation
    (but is logged at ERROR level for triage).
    """
    try:
        import json
        import uuid
        from .database import SessionLocal
        from .canonical_models import AuditEventExt

        record = AuditEventExt(
            id=str(uuid.uuid4()),
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            decision=decision,
            resource_id=resource_id,
            project_id=project_id,
            drone_id=drone_id,
            correlation_id=correlation_id or str(uuid.uuid4()),
            message=message or f"{action} {decision} by {actor_id} ({actor_role})",
            payload_json=json.dumps(payload or {}, default=str),
        )
        with SessionLocal() as db:
            db.add(record)
            db.commit()
        log.info("audit_decision actor=%s action=%s decision=%s project=%s drone=%s",
                 actor_id, action, decision, project_id, drone_id)
    except Exception as e:
        # Never raise on audit failure — log it
        log.exception("AUDIT_LOG_FAILURE action=%s decision=%s actor=%s err=%s",
                      action, decision, actor_id, e)


# ─────────────────────────────────────────────────────────────────────────────
# Hardware token issuance — signed, expiring, single-use (SEC-03 fix)
# ─────────────────────────────────────────────────────────────────────────────
def _hmac_secret() -> bytes:
    """Return the HMAC secret used to sign hardware tokens.

    P0-02 fix (INSPECT-BACKEND B-CRIT-02): previously the function called
    `getattr(settings, "AEROMIND_SESSION_SECRET", "")` which always
    returned "" because Pydantic Settings exposes the Python attribute
    name (`session_secret`), not the env alias (`AEROMIND_SESSION_SECRET`).
    The fallback `"insecure-dev-only"` was therefore always used, meaning
    every AeroMind deployment in the world signed its hardware tokens
    with the same constant key.

    The fix uses `_get_settings().session_secret` which reads the proper
    Pydantic Settings field, and refuses to boot if the secret is missing
    or too short (defence-in-depth against misconfiguration).
    """
    secret = _get_settings().session_secret
    if not secret or len(secret) < 32:
        raise RuntimeError(
            "AEROMIND_SESSION_SECRET must be set and >= 32 bytes for "
            "hardware token HMAC signing. Refusing to operate with an "
            "insecure key. (P0-02 fix)"
        )
    return secret.encode("utf-8")[:64]  # cap to 64 bytes for HMAC


def issue_hardware_token(
    *,
    project_id: str,
    drone_id: str,
    actor_id: str,
    reviewer_id: str,
    command: str,
    params: dict,
    kind: str = "command",
    ttl: timedelta = timedelta(minutes=5),
) -> tuple[str, str, datetime]:
    """Issue a single-use, signed, expiring hardware authorization token.

    SEC-03 fix — Previously tokens were raw uuid4().hex with no HMAC, no expiry,
    no project/drone binding. Now the token carries an HMAC-SHA256 signature
    over (token_id, project_id, drone_id, command, params_hash, expires_at).

    EXIGENCE IAM-03 — reviewer_id MUST differ from actor_id (caller's responsibility
    to verify before calling).

    Returns (token_id, signature_hex, expires_at). Persist via SessionLocal.
    """
    if actor_id == reviewer_id:
        raise ValueError("reviewer_id must differ from actor_id (EXIGENCE IAM-03)")
    if ttl > timedelta(hours=1):
        raise ValueError("Hardware token TTL must not exceed 1 hour")
    import json
    import uuid
    from .database import SessionLocal
    from .canonical_models import HardwareToken

    token_id = str(uuid.uuid4())
    expires_at = datetime.now(UTC) + ttl
    params_json = json.dumps(params, sort_keys=True, default=str)
    params_hash = hashlib.sha256(params_json.encode()).hexdigest()
    sig_payload = f"{token_id}|{project_id}|{drone_id}|{command}|{params_hash}|{expires_at.isoformat()}"
    signature = hmac.new(_hmac_secret(), sig_payload.encode(), hashlib.sha256).hexdigest()
    record = HardwareToken(
        id=token_id,
        project_id=project_id,
        drone_id=drone_id,
        actor_id=actor_id,
        reviewer_id=reviewer_id,
        command=command,
        params_hash=params_hash,
        signature=signature,
        kind=kind,
        issued_at=datetime.now(UTC),
        expires_at=expires_at,
    )
    with SessionLocal() as db:
        db.add(record)
        db.commit()
    audit_decision(
        actor_id=actor_id, actor_role="operator", action="hardware.token.issued",
        decision="allow", project_id=project_id, drone_id=drone_id,
        message=f"Token {kind} émis pour commande '{command}'",
        payload={"token_id": token_id, "expires_at": expires_at.isoformat(), "reviewer_id": reviewer_id},
    )
    return token_id, signature, expires_at


def consume_hardware_token(
    *,
    token_id: str,
    project_id: str,
    drone_id: str,
    command: str,
    params: dict,
    actor_id: str,
) -> bool:
    """Atomically consume a hardware token — verifies signature, expiry, context.

    SEC-03 fix — uses atomic UPDATE WHERE consumed_at IS NULL to prevent replay.
    Verifies HMAC signature, expiry, project/drone/command match, params hash.

    Returns True if token was valid and consumed, False otherwise. Audit logged.
    """
    import json
    from sqlalchemy import update
    from .database import SessionLocal
    from .canonical_models import HardwareToken

    params_json = json.dumps(params, sort_keys=True, default=str)
    params_hash = hashlib.sha256(params_json.encode()).hexdigest()
    sig_payload_template = f"{token_id}|{project_id}|{drone_id}|{command}|{params_hash}|{{exp}}"
    expected_sig_template = sig_payload_template  # exp filled after lookup

    with SessionLocal() as db:
        rec = db.query(HardwareToken).filter(HardwareToken.id == token_id).one_or_none()
        if rec is None:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Token introuvable", payload={"token_id": token_id})
            return False
        if rec.consumed_at is not None:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Token déjà consommé (rejeu)", payload={"token_id": token_id})
            return False
        if datetime.now(UTC) >= rec.expires_at:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Token expiré", payload={"token_id": token_id})
            return False
        if rec.project_id != project_id or rec.drone_id != drone_id or rec.command != command:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Mismatch projet/drone/commande", payload={"token_id": token_id})
            return False
        if rec.actor_id != actor_id:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Token émis pour un autre acteur",
                           payload={"token_id": token_id, "expected_actor": rec.actor_id})
            return False
        if rec.params_hash != params_hash:
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Hash des paramètres différent — paramètres modifiés après approbation",
                           payload={"token_id": token_id})
            return False
        # Verify HMAC signature
        sig_payload = f"{token_id}|{project_id}|{drone_id}|{command}|{params_hash}|{rec.expires_at.isoformat()}"
        expected_sig = hmac.new(_hmac_secret(), sig_payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, rec.signature):
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Signature HMAC invalide", payload={"token_id": token_id})
            return False
        # Atomic consume (UPDATE WHERE consumed_at IS NULL)
        result = db.execute(
            update(HardwareToken)
            .where(HardwareToken.id == token_id, HardwareToken.consumed_at.is_(None))
            .values(consumed_at=datetime.now(UTC))
        )
        db.commit()
        if result.rowcount != 1:
            # Race condition — someone else consumed it
            audit_decision(actor_id=actor_id, actor_role="operator",
                           action="hardware.token.consume", decision="deny",
                           project_id=project_id, drone_id=drone_id,
                           message="Race condition — token consommé concurremment",
                           payload={"token_id": token_id})
            return False
        audit_decision(actor_id=actor_id, actor_role="operator",
                       action="hardware.token.consume", decision="allow",
                       project_id=project_id, drone_id=drone_id,
                       message="Token consommé avec succès", payload={"token_id": token_id})
        return True


__all__ = [
    "ROLES", "PERMISSIONS", "ROLE_HIERARCHY",
    "StepUpSession", "STEP_UP_DEFAULT_TTL", "STEP_UP_MAX_TTL",
    "verify_lab_session", "require_role", "require_project_owner_or_role",
    "verify_csrf_double_submit",
    "issue_step_up_session", "revoke_step_up_session",
    "issue_hardware_token", "consume_hardware_token",
    "audit_decision",
    "SESSION_COOKIE_NAME", "SESSION_HEADER_NAME", "CSRF_HEADER_NAME", "CSRF_COOKIE_NAME",
]
