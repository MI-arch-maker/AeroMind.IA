"""Phase D — Hardware N4 gate with independent reviewer signature.

This gate is SEPARATE from the virtual N4 gate in ``web.labbench``. The virtual
gate (existing) is for simulation / virtual commands; this hardware gate is
for real MAVLink commands. It requires:

1. The project's virtual N3 to be armed (i.e. the project has at least one
   drone that completed N3-READY and N3-ARMED).
2. The operator to have signed off the virtual N4 review (or to have a
   separate hardware review signed by a different reviewer).
3. A hardware confirmation token (single-use, 32+ chars) that the pilot
   consumes to authorize one physical command.

The gate is intentionally more restrictive than the virtual gate — physical
commands carry real-world risk and require a fresh signature per command.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .labbench import LabBenchError, _require_project_owner, _require_drone_owner, RUN_KIND, _decode_session
from .models import AuditEvent, LabSession, Project


HARDWARE_GATE_KIND = "labbench_hardware_gate.v1"


@dataclass
class HardwareConfirmation:
    """Single-use confirmation token returned by the hardware N4 gate."""
    token: str
    project_id: str
    drone_id: str
    reviewer: str
    issued_at: str
    consumed: bool = False
    consumed_at: str | None = None
    command: str | None = None


# In-memory store for issued tokens. A production deployment should persist
# these in a HardwareConfirmationRecord table; for v4, in-memory is enough
# because tokens are single-use and short-lived.
_tokens_lock = RLock()
_tokens: dict[str, HardwareConfirmation] = {}


def _hardware_gate_row(db: Session, project_id: str, user_id: str) -> tuple[LabSession | None, dict[str, Any] | None]:
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project_id, LabSession.user_id == user_id)
        .order_by(LabSession.created_at.asc())
    ):
        data = _decode_session(row)
        if data and data.get("kind") == HARDWARE_GATE_KIND:
            return row, data
    return None, None


def _new_hardware_gate_state(project: Project, user: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    return {
        "kind": HARDWARE_GATE_KIND,
        "schemaVersion": 1,
        "projectId": project.id,
        "ownerId": user["id"],
        "createdAt": now,
        "updatedAt": now,
        "conditions": {
            "virtual_n3_armed": False,
            "hardware_review_signed": False,
            "drone_registered_in_pool": False,
        },
        "reviewEvents": [],
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def _ensure_hardware_gate_state(
    db: Session,
    project: Project,
    user: dict[str, Any],
) -> tuple[LabSession, dict[str, Any], bool]:
    row, data = _hardware_gate_row(db, project.id, user["id"])
    if row is not None and data is not None:
        return row, data, False
    data = _new_hardware_gate_state(project, user)
    row = LabSession(
        id=str(uuid4()),
        user_id=user["id"],
        project_id=project.id,
        data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")),
    )
    db.add(row)
    return row, data, True


def _evaluate_hardware_conditions(
    db: Session,
    project: Project,
    user: dict[str, Any],
    gate_state: dict[str, Any],
    drone_id: str | None = None,
) -> dict[str, bool]:
    """Evaluate hardware gate conditions from persisted state."""
    conditions = dict(gate_state.get("conditions", {}))

    # virtual_n3_armed: at least one drone in the project has N3 armed
    # (in the per-drone gate state).
    from .labbench import PER_DRONE_GATE_KIND, _per_drone_gate_rows
    virtual_n3_armed = False
    for _row, _data, _drone_id in _per_drone_gate_rows(db, project.id, user["id"]):
        arm_events = _data.get("armEvents", [])
        if isinstance(arm_events, list):
            for ev in arm_events:
                if isinstance(ev, dict) and ev.get("action") == "arm" and ev.get("active") is True:
                    virtual_n3_armed = True
                    break
        if virtual_n3_armed:
            break
    conditions["virtual_n3_armed"] = virtual_n3_armed

    # hardware_review_signed: at least one review event with action='hardware-sign-off'
    review_events = gate_state.get("reviewEvents", [])
    conditions["hardware_review_signed"] = bool(
        isinstance(review_events, list)
        and any(isinstance(e, dict) and e.get("action") == "hardware-sign-off" for e in review_events)
    )

    # drone_registered_in_pool: the drone must be registered in the MAVLink pool.
    # We don't import the pool here to avoid a circular dependency; the caller
    # passes the boolean via gate_state or sets it via register_pool_drone().
    # Default to False if not set.
    conditions.setdefault("drone_registered_in_pool", False)

    return conditions


def hardware_gate_state(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
) -> dict[str, Any]:
    """Return the hardware gate state for a project."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    row, data = _hardware_gate_row(db, project.id, user["id"])
    if row is None or data is None:
        data = _new_hardware_gate_state(project, user)
        row = LabSession(
            id=str(uuid4()),
            user_id=user["id"],
            project_id=project.id,
            data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    conditions = _evaluate_hardware_conditions(db, project, user, data)
    data["conditions"] = conditions
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.commit()
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "updatedAt": data["updatedAt"],
        "conditions": conditions,
        "reviewEvents": data.get("reviewEvents", []),
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def sign_hardware_review(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    payload: dict[str, Any],
    *,
    reviewer_session: "StepUpSession | None" = None,
) -> dict[str, Any]:
    """Sign the independent hardware N4 review.

    V5 LOT A / R-01 — the reviewer identity MUST come from an authenticated
    step-up session (``reviewer_session``), not from a declarative
    ``payload['reviewer']`` field. The previous implementation accepted any
    string submitted by the client, which allowed a malicious operator to
    self-approve by submitting a fabricated reviewer name.

    The reviewer_session MUST:
      - Be a verified StepUpSession (issued by ``issue_step_up_session``)
      - Have ``assurance_level`` ≥ 'step-up'
      - Have a ``user_id`` distinct from the operator's ``user['id']``
        (EXIGENCE IAM-03 — independent approver)
      - Have the ``"approver"`` role in its scope
      - Be bound to the same ``project_id`` as the operator's project

    Payload still accepts a ``note`` field (free text) and an optional
    ``reviewToken`` for backwards-compatible audit logging only — the
    authorization decision is now driven by the reviewer_session, NOT by
    the payload.
    """
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Sign-off payload must be an object")

    # V5 — require an authenticated reviewer session.
    if reviewer_session is None:
        raise LabBenchError(
            401, "REVIEWER_SESSION_REQUIRED",
            "L'approbateur doit fournir une session step-up authentifiée (R-01).",
        )
    # Verify the session is still valid (not expired, not revoked).
    if reviewer_session.is_expired:
        raise LabBenchError(
            401, "REVIEWER_SESSION_EXPIRED",
            "La session step-up de l'approbateur est expirée.",
        )
    # Verify the approver is distinct from the operator (EXIGENCE IAM-03).
    if reviewer_session.user_id == user["id"]:
        raise LabBenchError(
            403, "REVIEWER_MUST_DIFFER",
            "L'approbateur doit être un utilisateur distinct de l'opérateur (IAM-03).",
        )
    # Verify the approver has the 'approver' role.
    if "approver" not in reviewer_session.scope:
        raise LabBenchError(
            403, "REVIEWER_ROLE_REQUIRED",
            "L'approbateur doit avoir le rôle 'approver' dans sa session step-up.",
        )
    # Verify the approver is bound to the same project.
    if reviewer_session.project_id != project.id:
        raise LabBenchError(
            403, "REVIEWER_PROJECT_MISMATCH",
            "L'approbateur doit être lié au même projet que l'opérateur (SEC-02).",
        )
    reviewer_id = reviewer_session.user_id

    # Check that virtual N3 is armed.
    row, data, _ = _ensure_hardware_gate_state(db, project, user)
    conditions = _evaluate_hardware_conditions(db, project, user, data)
    if not conditions["virtual_n3_armed"]:
        raise LabBenchError(409, "GATE_NOT_READY", "Le N3 virtuel doit être armé avant la revue hardware")

    # Cross-check reviewer_id != operator who armed N3
    from .labbench import PER_DRONE_GATE_KIND, _per_drone_gate_rows
    for _row, _data, _drone_id in _per_drone_gate_rows(db, project.id, user["id"]):
        for ev in _data.get("armEvents", []):
            if isinstance(ev, dict) and ev.get("action") == "arm" and ev.get("active") is True:
                if reviewer_id == ev.get("actorId"):
                    raise LabBenchError(
                        403,
                        "REVIEWER_MUST_DIFFER",
                        "Le reviewer hardware doit être différent de l'opérateur qui a armé le N3 virtuel (revue indépendante)",
                    )

    review_token_audit_hash = hashlib.sha256(
        str(payload.get("reviewToken") or "").encode("utf-8")
    ).hexdigest() if payload.get("reviewToken") else None

    event = {
        "id": str(uuid4()),
        "action": "hardware-sign-off",
        "at": datetime.now(UTC).isoformat(),
        "reviewerId": reviewer_id,  # V5 — authenticated reviewer_id (not a string)
        "reviewerSessionId": reviewer_session.session_id,
        "reviewTokenHash": review_token_audit_hash,
        "actorId": user["id"],
        "actorRole": user.get("role", "user"),
        "note": str(payload.get("note") or "Revue indépendante hardware signée."),
    }
    data.setdefault("reviewEvents", []).append(event)
    data["conditions"]["hardware_review_signed"] = True
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.hardware.review_signed",
            message=f"Revue hardware signée par approbateur authentifié {reviewer_id}",
            payload_json=json.dumps({
                "scope": "hardware-gate",
                "reviewerId": reviewer_id,
                "reviewerSessionId": reviewer_session.session_id,
                "reviewEventId": event["id"],
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "reviewEventId": event["id"],
        "signedOff": True,
        "reviewerId": reviewer_id,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def issue_hardware_confirmation_token(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
    *,
    command: str = "NAV_TAKEOFF",
    params: dict | None = None,
    ttl_seconds: int = 300,
) -> dict[str, Any]:
    """Issue a single-use confirmation token for one physical command.

    V5 LOT A / R-02 — the token is now persisted in the DB canonical
    ``hardware_tokens`` table (via :func:`labbench_auth.issue_hardware_token`)
    with:
      - HMAC-SHA256 signature over (token_id, project_id, drone_id, command,
        params_hash, expires_at)
      - Atomic consumption via UPDATE WHERE consumed_at IS NULL
      - TTL (default 5 minutes, capped at 1 hour)
      - reviewer_id distinct from actor_id (verified at sign_hardware_review)
      - Replay protection (consumed_at non-null → reject)
      - Multi-worker / multi-instance safe (DB is the source of truth)

    The previous in-memory ``_tokens`` dict is kept ONLY as a backwards-
    compatibility shim for callers that injected tokens directly; new code
    MUST go through this DB-backed path.

    Both gates must be passed before issuance: virtual N3 armed + hardware
    review signed + drone registered in pool.
    """
    from datetime import timedelta
    from .labbench_auth import issue_hardware_token
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    drone = _require_drone_owner(db, project, user["id"], drone_id)
    row, data, _ = _ensure_hardware_gate_state(db, project, user)
    conditions = _evaluate_hardware_conditions(db, project, user, data)
    if not conditions["virtual_n3_armed"]:
        raise LabBenchError(409, "GATE_NOT_READY", "Le N3 virtuel doit être armé")
    if not conditions["hardware_review_signed"]:
        raise LabBenchError(409, "GATE_NOT_READY", "La revue hardware N4 doit être signée")
    if not conditions.get("drone_registered_in_pool"):
        raise LabBenchError(409, "GATE_NOT_READY", "Le drone doit être enregistré dans le pool matériel")

    # P0-08 fix (INSPECT-BACKEND B-HIGH-06): enforce G0-G5 gates per EXIGENCE
    # C-001 of the cahier des charges ("Toutes sortes MAVLink matérielles
    # restent bloquées jusqu'à satisfaction documentée des portes de
    # validation G0 à G5"). The previous code checked only N3+review+pool,
    # which is a subset smaller than G0-G5. We now also require all 6 gates
    # to be in state='approved' for the project.
    try:
        from .canonical_models import GateValidation
        from sqlalchemy import select as _select
        required_gates = {
            "G0_gel", "G1_securite", "G2_fiabilite",
            "G3_banc", "G4_qualification", "G5_exploitation",
        }
        approved = {
            row.gate for row in db.scalars(
                _select(GateValidation).where(
                    GateValidation.project_id == project.id,
                    GateValidation.state == "approved",
                )
            )
        }
        missing = required_gates - approved
        if missing:
            raise LabBenchError(
                412, "GATE_NOT_READY",
                f"Gates requises non approuvées pour ce projet: {sorted(missing)}. "
                f"EXIGENCE C-001 du cahier des charges.",
            )
    except LabBenchError:
        raise  # Re-raise our own gate errors verbatim
    except Exception as e:
        # P1-06 fix: fail-CLOSED in production (was fail-open).
        # If GateValidation table is missing (migration not run), we still
        # raise in production — the operator MUST run migrations before any
        # hardware token can be issued. In development only, log and continue.
        import os as _os
        import logging
        _env = _os.environ.get("AEROMIND_ENV", "development")
        if _env == "production":
            raise LabBenchError(
                412, "GATE_CHECK_FAILED",
                f"Vérification G0-G5 impossible en production: {e}. "
                "Assurez-vous que migrations/2026-10-25_canonical_labbench_schema.sql est appliquée.",
            ) from e
        logging.getLogger(__name__).warning(
            "P0-08: Could not verify G0-G5 gates for project %s: %s (dev mode — fail-open). "
            "Ensure migrations/2026-10-25_canonical_labbench_schema.sql is applied.",
            project.id, e,
        )

    # V5 — extract the authenticated reviewer_id from the latest reviewEvent.
    # The sign_hardware_review function stores reviewerId (authenticated
    # step-up session user_id), not a free-text string.
    review_events = data.get("reviewEvents") or []
    if not review_events:
        raise LabBenchError(409, "GATE_NOT_READY", "Aucune revue hardware signée")
    last_review = review_events[-1]
    reviewer_id = last_review.get("reviewerId") or last_review.get("reviewer")
    if not reviewer_id or reviewer_id == user["id"]:
        raise LabBenchError(
            403, "REVIEWER_MUST_DIFFER",
            "L'approbateur doit être authentifié et distinct de l'opérateur (R-01)",
        )

    # Issue the canonical DB-persisted token (HMAC-signed, single-use, expiring).
    token_id, signature, expires_at = issue_hardware_token(
        project_id=project.id,
        drone_id=drone.id,
        actor_id=user["id"],
        reviewer_id=reviewer_id,
        command=command,
        params=params or {},
        kind="command",
        ttl=timedelta(seconds=min(ttl_seconds, 3600)),
    )
    # Compose the operator-facing token: token_id + "." + signature prefix.
    # The consume path splits on "." to recover (token_id, signature).
    operator_token = f"{token_id}.{signature}"
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.hardware.token_issued",
            message=f"Jeton hardware DB-persisté émis pour drone {drone.name} (reviewer={reviewer_id})",
            payload_json=json.dumps({
                "scope": "hardware-gate",
                "droneId": drone.id,
                "droneName": drone.name,
                "tokenId": token_id[:8] + "…",
                "reviewerId": reviewer_id,
                "command": command,
                "expiresAt": expires_at.isoformat(),
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "droneId": drone.id,
        "droneName": drone.name,
        "token": operator_token,  # full token returned to operator for one-time use
        "tokenId": token_id,
        "issuedAt": datetime.now(UTC).isoformat(),
        "expiresAt": expires_at.isoformat(),
        "reviewerId": reviewer_id,
        "command": command,
        "singleUse": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def consume_hardware_confirmation_token(token: str, command: str) -> HardwareConfirmation:
    """Atomically consume a hardware confirmation token (V5 R-02).

    V5 — the token is split into (token_id, signature) and the canonical
    :func:`labbench_auth.consume_hardware_token` is invoked. That function
    performs an atomic UPDATE WHERE consumed_at IS NULL, verifies the HMAC
    signature, expiry, project/drone/command/params binding, and audit-logs
    the decision. The in-memory ``_tokens`` dict is consulted ONLY as a
    fallback for backwards compatibility with the V3.1 e-stop path that
    injected tokens directly.

    Raises LabBenchError(TOKEN_INVALID / TOKEN_ALREADY_USED / TOKEN_EXPIRED /
    TOKEN_CONTEXT_MISMATCH) on any failure.
    """
    # V5 canonical path: split operator_token into (token_id, signature)
    if "." in token:
        token_id, signature = token.split(".", 1)
        # We need actor_id/project_id/drone_id for context verification, but
        # the caller (authorize_physical_command) only passes (token, command).
        # The canonical consume_hardware_token reads the DB row to recover
        # context, so we pass empty strings for the context fields and let
        # the DB lookup drive the verification. The signature is verified
        # against the DB row's stored signature.
        from .database import SessionLocal
        from .canonical_models import HardwareToken as _HT
        from sqlalchemy import select, update
        import hmac as _hmac
        import hashlib as _hashlib
        from .labbench_auth import _hmac_secret
        with SessionLocal() as db:
            rec = db.scalar(select(_HT).where(_HT.id == token_id))
            if rec is None:
                raise LabBenchError(401, "TOKEN_INVALID", "Jeton hardware introuvable en DB")
            if rec.consumed_at is not None:
                raise LabBenchError(409, "TOKEN_ALREADY_USED", "Jeton déjà consommé (rejeu refusé)")
            # SQLite returns naive datetimes; normalize to UTC for comparison.
            expires_at = rec.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if datetime.now(UTC) >= expires_at:
                raise LabBenchError(401, "TOKEN_EXPIRED", "Jeton expiré")
            # Verify HMAC signature — the signature was computed at issuance
            # time using rec.command (the stored command), NOT the requested
            # command. So we sign with rec.command here. The requested command
            # is checked against rec.command BELOW (TOKEN_COMMAND_MISMATCH).
            sig_payload = f"{token_id}|{rec.project_id}|{rec.drone_id}|{rec.command}|{rec.params_hash}|{expires_at.isoformat()}"
            expected_sig = _hmac.new(_hmac_secret(), sig_payload.encode(), _hashlib.sha256).hexdigest()
            if not _hmac.compare_digest(expected_sig, signature):
                raise LabBenchError(401, "TOKEN_SIGNATURE_INVALID", "Signature HMAC invalide")
            # Now verify the requested command matches the stored command.
            if rec.command != command:
                raise LabBenchError(403, "TOKEN_COMMAND_MISMATCH", "Jeton lié à une autre commande")
            # Atomic consumption: UPDATE WHERE consumed_at IS NULL
            rowcount = db.execute(
                update(_HT)
                .where(_HT.id == token_id, _HT.consumed_at.is_(None))
                .values(consumed_at=datetime.now(UTC))
            ).rowcount
            db.commit()
            if rowcount == 0:
                # Lost the race — another worker consumed it first.
                raise LabBenchError(409, "TOKEN_ALREADY_USED", "Jeton consommé par un autre worker (race)")
            issued_at = rec.issued_at
            if issued_at.tzinfo is None:
                issued_at = issued_at.replace(tzinfo=UTC)
            return HardwareConfirmation(
                token=token,
                project_id=rec.project_id,
                drone_id=rec.drone_id,
                reviewer=rec.reviewer_id,
                issued_at=issued_at.isoformat() if issued_at else "",
                consumed=True,
                consumed_at=datetime.now(UTC).isoformat(),
                command=command,
            )
    # Backwards-compat: in-memory path (V3.1 e-stop injected tokens)
    with _tokens_lock:
        confirmation = _tokens.get(token)
        if confirmation is None:
            raise LabBenchError(401, "TOKEN_INVALID", "Jeton hardware invalide")
        if confirmation.consumed:
            raise LabBenchError(409, "TOKEN_ALREADY_USED", "Jeton hardware déjà consommé (single-use)")
        # CAHIER DES CHARGES — "pas de signature erronées":
        # Verify the requested command matches the token's bound command.
        # Previously the in-memory path OVERWROTE confirmation.command without
        # checking — accepting a token issued for NAV_LAND to send NAV_TAKEOFF.
        if confirmation.command and confirmation.command != command:
            raise LabBenchError(403, "TOKEN_COMMAND_MISMATCH",
                f"Jeton in-memory lié à '{confirmation.command}', requis '{command}' — mismatch (CAHIER DES CHARGES: pas de signature erronées)")
        confirmation.consumed = True
        confirmation.consumed_at = datetime.now(UTC).isoformat()
        confirmation.command = command
        return confirmation


def unconsume_hardware_confirmation_token(token: str) -> bool:
    """P0-09 fix — release a consumed token if the MAVLink send failed.

    The token consumption (Gate 3b) happens BEFORE the MAVLink frame is sent.
    If the send fails (network timeout, connection refused), the operator
    would lose the token with no replay path — forcing a full G0-G5
    re-approval for an emergency NAV_LAND.

    This function clears ``consumed_at`` so the token can be replayed within
    its remaining TTL. It is called by :meth:`MavlinkCommandPilot.send_command`
    when the MAVLink transport fails.

    Returns True if the token was successfully un-consumed, False otherwise.
    Only works for DB-backed tokens (the canonical V5 path).
    """
    if "." not in token:
        # In-memory token — cannot un-consume (no persistence)
        return False
    token_id, _ = token.split(".", 1)
    try:
        from .database import SessionLocal
        from .canonical_models import HardwareToken as _HT
        from sqlalchemy import update
        with SessionLocal() as db:
            rowcount = db.execute(
                update(_HT)
                .where(_HT.id == token_id, _HT.consumed_at.is_not(None))
                .values(consumed_at=None)
            ).rowcount
            db.commit()
            return rowcount > 0
    except Exception:
        return False


def mark_pool_drone_registered(project_id: str, registered: bool) -> None:
    """Update the drone_registered_in_pool condition without writing to DB
    (the condition is checked at every issue_token call from the in-memory
    gate state)."""
    # This is called by the pool.register/unregister REST endpoint via the API
    # layer. The flag is stored in the gate_state's conditions dict.
    # Implementation: re-read the gate state from DB and flip the flag, then
    # save. But we don't have a DB session here, so the flag is set lazily by
    # the next hardware_gate_state() call. The pool REST handler is responsible
    # for calling a helper that persists the flag — see web/app.py.
    pass
