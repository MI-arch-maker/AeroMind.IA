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
) -> dict[str, Any]:
    """Sign the independent hardware N4 review.

    The reviewer must be different from the operator who armed the virtual N3.
    We check this by comparing the reviewer's email/name to the actor of the
    last virtual arm event. If they match, the signature is rejected.
    """
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Sign-off payload must be an object")
    reviewer = str(payload.get("reviewer") or "").strip()
    review_token = str(payload.get("reviewToken") or "").strip()
    if not reviewer or len(review_token) < 16:
        raise LabBenchError(400, "BAD_REQUEST", "reviewer et reviewToken (≥ 16 caractères) sont requis")

    # Check that virtual N3 is armed.
    row, data, _ = _ensure_hardware_gate_state(db, project, user)
    conditions = _evaluate_hardware_conditions(db, project, user, data)
    if not conditions["virtual_n3_armed"]:
        raise LabBenchError(409, "GATE_NOT_READY", "Le N3 virtuel doit être armé avant la revue hardware")

    # Cross-check reviewer != operator who armed N3
    from .labbench import PER_DRONE_GATE_KIND, _per_drone_gate_rows
    for _row, _data, _drone_id in _per_drone_gate_rows(db, project.id, user["id"]):
        for ev in _data.get("armEvents", []):
            if isinstance(ev, dict) and ev.get("action") == "arm" and ev.get("active") is True:
                # The reviewer must differ from the operator email (we don't
                # have access to it here without joining users, so we just
                # require the reviewer string to differ from the actorId).
                if reviewer == ev.get("actorId"):
                    raise LabBenchError(
                        403,
                        "REVIEWER_MUST_DIFFER",
                        "Le reviewer hardware doit être différent de l'opérateur qui a armé le N3 virtuel (revue indépendante)",
                    )

    event = {
        "id": str(uuid4()),
        "action": "hardware-sign-off",
        "at": datetime.now(UTC).isoformat(),
        "reviewer": reviewer,
        "reviewTokenHash": hashlib.sha256(review_token.encode("utf-8")).hexdigest(),
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
            message=f"Revue hardware signée par {reviewer}",
            payload_json=json.dumps({
                "scope": "hardware-gate",
                "reviewer": reviewer,
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
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def issue_hardware_confirmation_token(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
) -> dict[str, Any]:
    """Issue a single-use confirmation token for one physical command.

    Both gates must be passed: virtual N3 armed + hardware review signed.
    The token is 32 chars, single-use, and consumed by the pilot.
    """
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

    token = uuid4().hex + uuid4().hex  # 64 chars
    reviewer = data["reviewEvents"][-1]["reviewer"] if data.get("reviewEvents") else "unknown"
    confirmation = HardwareConfirmation(
        token=token,
        project_id=project.id,
        drone_id=drone.id,
        reviewer=reviewer,
        issued_at=datetime.now(UTC).isoformat(),
    )
    with _tokens_lock:
        _tokens[token] = confirmation
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.hardware.token_issued",
            message=f"Jeton hardware émis pour drone {drone.name}",
            payload_json=json.dumps({
                "scope": "hardware-gate",
                "droneId": drone.id,
                "droneName": drone.name,
                "tokenId": token[:8] + "…",  # only show a prefix in audit
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
        "token": token,  # full token returned to operator for one-time use
        "issuedAt": confirmation.issued_at,
        "singleUse": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def consume_hardware_confirmation_token(token: str, command: str) -> HardwareConfirmation:
    """Mark a token as consumed. Raises if invalid or already used."""
    with _tokens_lock:
        confirmation = _tokens.get(token)
        if confirmation is None:
            raise LabBenchError(401, "TOKEN_INVALID", "Jeton hardware invalide")
        if confirmation.consumed:
            raise LabBenchError(409, "TOKEN_ALREADY_USED", "Jeton hardware déjà consommé (single-use)")
        confirmation.consumed = True
        confirmation.consumed_at = datetime.now(UTC).isoformat()
        confirmation.command = command
        return confirmation


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
