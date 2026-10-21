"""Human authorization workflow for explicitly simulated command requests.

This module contains no hardware adapter and never opens a physical transport.
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .app_auth_helpers import current_user
from .database import get_db
from .models import CommandAuditEvent, CommandRequestRecord, User

router = APIRouter(prefix="/api/command-center", tags=["human-command-center"])
SIMULATED_DEVICE_ID = "SIM-AEROMIND-LOCAL"
SIMULATED_DEVICE_NAME = "Simulateur local AeroMind — aucun équipement connecté"
REQUEST_TTL_SECONDS = 600
COMMANDS = {
    "simulation-hold": {
        "label": "Maintien simulé",
        "effect": "Enregistre un maintien dans le scénario virtuel local.",
        "risk": "Aucun effet physique. Résultat synthétique uniquement.",
    },
    "simulation-return": {
        "label": "Retour simulé",
        "effect": "Enregistre une intention de retour dans le scénario virtuel local.",
        "risk": "Aucun effet physique. Résultat synthétique uniquement.",
    },
    "simulation-land": {
        "label": "Atterrissage simulé",
        "effect": "Enregistre un atterrissage dans le scénario virtuel local.",
        "risk": "Aucun effet physique. Résultat synthétique uniquement.",
    },
    "simulation-pause": {
        "label": "Pause simulée",
        "effect": "Met en pause le scénario virtuel local.",
        "risk": "Aucun effet physique. Résultat synthétique uniquement.",
    },
}
ACTIVE_STATES = {"prepared", "pending_approval", "pending_second_approval", "approved"}
REVIEWER_ROLES = {"surveillant", "admin", "super_admin"}


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    # SQLite may return naive datetimes even for timezone-aware columns.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _canonical(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(row: CommandRequestRecord) -> str:
    return hashlib.sha256(_canonical({
        "id": row.id,
        "user_id": row.user_id,
        "target_id": row.target_id,
        "target_name": row.target_name,
        "command": row.command,
        "objective": row.objective,
        "parameters": json.loads(row.parameters_json),
        "physical_output_enabled": False,
    }).encode("utf-8")).hexdigest()


class PrepareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command: str = Field(min_length=1, max_length=60)
    objective: str = Field(min_length=8, max_length=500)
    parameters: dict = Field(default_factory=dict)

    @field_validator("objective")
    @classmethod
    def objective_not_blank(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 8:
            raise ValueError("An explicit objective of at least 8 characters is required")
        return value

    @field_validator("parameters")
    @classmethod
    def no_command_parameters(cls, value: dict) -> dict:
        if value:
            raise ValueError("Simulation command parameters are not accepted in this version")
        return value


class DecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(default="", max_length=500)


def _user(cookie: str | None, db: Session) -> dict:
    identity = current_user(cookie)
    if not identity:
        raise HTTPException(401, "OIDC authentication required")
    if db.get(User, identity["id"]) is None:
        db.add(User(id=identity["id"], email=identity["email"]))
        db.commit()
    return identity


def _owned(db: Session, user_id: str, request_id: str) -> CommandRequestRecord:
    row = db.scalar(select(CommandRequestRecord).where(
        CommandRequestRecord.id == request_id,
        CommandRequestRecord.user_id == user_id,
    ))
    if row is None:
        raise HTTPException(404, "Command request not found")
    return row


def _event(db: Session, row: CommandRequestRecord, actor: dict, name: str, details: dict | None = None) -> None:
    db.add(CommandAuditEvent(
        id=str(uuid4()), request_id=row.id, actor_id=actor["id"], actor_role=actor.get("role", "user"),
        event_type=name, details_json=_canonical(details or {}), occurred_at=_now(),
    ))


def _expire_if_needed(db: Session, row: CommandRequestRecord, actor: dict) -> None:
    if row.status in ACTIVE_STATES and _utc(row.expires_at) <= _now():
        prior = row.status
        row.status = "expired"
        _event(db, row, actor, "expired", {"prior_status": prior})
        db.commit()
        db.refresh(row)


def _serialize(db: Session, row: CommandRequestRecord) -> dict:
    events = db.scalars(select(CommandAuditEvent).where(
        CommandAuditEvent.request_id == row.id
    ).order_by(CommandAuditEvent.occurred_at.asc(), CommandAuditEvent.id.asc())).all()
    definition = COMMANDS.get(row.command, {})
    return {
        "id": row.id,
        "device": {"id": row.target_id, "name": row.target_name, "connection": "not_connected", "kind": "simulator"},
        "command": row.command,
        "command_label": definition.get("label", row.command),
        "expected_effect": definition.get("effect", ""),
        "risk": definition.get("risk", ""),
        "objective": row.objective,
        "parameters": json.loads(row.parameters_json),
        "preconditions": {"authenticated_user": True, "known_simulated_target": True, "physical_output_disabled": True, "fresh_request": _utc(row.expires_at) > _now()},
        "checks": json.loads(row.checks_json),
        "request_sha256": row.request_sha256,
        "status": row.status,
        "approval_policy": {"required_human_approvals": 2, "distinct_verified_identities": True, "physical_output_enabled": False},
        "prepared_at": _utc(row.prepared_at).isoformat(),
        "presented_at": _utc(row.presented_at).isoformat() if row.presented_at else None,
        "expires_at": _utc(row.expires_at).isoformat(),
        "decided_by": row.decided_by,
        "decided_at": _utc(row.decided_at).isoformat() if row.decided_at else None,
        "result": json.loads(row.result_json) if row.result_json else None,
        "events": [{
            "type": event.event_type,
            "actor_id": event.actor_id,
            "actor_role": event.actor_role,
            "occurred_at": _utc(event.occurred_at).isoformat(),
            "details": json.loads(event.details_json),
        } for event in events],
    }


def _transition(db: Session, row: CommandRequestRecord, actor: dict, expected: str, target: str, event_type: str, details: dict | None = None) -> None:
    result = db.execute(update(CommandRequestRecord).where(
        CommandRequestRecord.id == row.id,
        CommandRequestRecord.user_id == actor["id"],
        CommandRequestRecord.status == expected,
    ).values(status=target))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, f"Transition {expected} → {target} is no longer available")
    row.status = target
    _event(db, row, actor, event_type, details)
    db.commit()
    db.refresh(row)


def _review_transition(db: Session, row: CommandRequestRecord, actor: dict, expected: str, target: str, event_type: str, details: dict | None = None) -> None:
    result = db.execute(update(CommandRequestRecord).where(
        CommandRequestRecord.id == row.id,
        CommandRequestRecord.status == expected,
    ).values(status=target))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, f"Transition {expected} → {target} is no longer available")
    row.status = target
    _event(db, row, actor, event_type, details)
    db.commit()
    db.refresh(row)


@router.get("/requests")
def list_requests(aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    rows = db.scalars(select(CommandRequestRecord).where(
        CommandRequestRecord.user_id == actor["id"]
    ).order_by(CommandRequestRecord.prepared_at.desc()).limit(100)).all()
    for row in rows:
        _expire_if_needed(db, row, actor)
    return {"mode": "simulation_only", "physical_output_enabled": False, "items": [_serialize(db, row) for row in rows]}


@router.get("/approvals")
def list_second_approval_requests(aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    if actor.get("role") not in REVIEWER_ROLES:
        raise HTTPException(403, "A verified AeroMind reviewer role is required for the second approval")
    rows = db.scalars(select(CommandRequestRecord).where(
        CommandRequestRecord.status == "pending_second_approval",
        CommandRequestRecord.user_id != actor["id"],
        CommandRequestRecord.target_id == SIMULATED_DEVICE_ID,
    ).order_by(CommandRequestRecord.presented_at.asc()).limit(100)).all()
    for row in rows:
        _expire_if_needed(db, row, actor)
    return {"mode": "simulation_only", "physical_output_enabled": False, "required_human_approvals": 2, "items": [_serialize(db, row) for row in rows if row.status == "pending_second_approval"]}


@router.post("/requests", status_code=201)
def prepare_request(body: PrepareRequest, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    if body.command not in COMMANDS:
        raise HTTPException(422, "Only declared simulation-only commands are accepted")
    request_id = str(uuid4())
    now = _now()
    row = CommandRequestRecord(
        id=request_id, user_id=actor["id"], target_id=SIMULATED_DEVICE_ID,
        target_name=SIMULATED_DEVICE_NAME, command=body.command, objective=body.objective,
        parameters_json=_canonical(body.parameters),
        checks_json=_canonical({
            "authenticated_session": "passed",
            "target_identity": "synthetic simulator; no connected device asserted",
            "permissions": "authenticated owner-scoped session",
            "data_freshness": "request created now; expires in 600 seconds",
            "physical_output": "hard-disabled",
            "hardware_preconditions": "not applicable; no hardware path exists",
        }),
        status="prepared", prepared_at=now, expires_at=now + timedelta(seconds=REQUEST_TTL_SECONDS),
    )
    row.request_sha256 = _digest(row)
    db.add(row)
    db.flush()
    _event(db, row, actor, "prepared", {"physical_output_enabled": False})
    db.commit()
    db.refresh(row)
    return _serialize(db, row)


@router.post("/requests/{request_id}/present")
def present_request(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    if row.status != "prepared":
        raise HTTPException(409, "Only a fresh prepared request can be presented")
    if row.request_sha256 != _digest(row):
        raise HTTPException(409, "Request integrity check failed")
    if row.target_id != SIMULATED_DEVICE_ID:
        raise HTTPException(409, "Unknown target; physical targets are not supported")
    row.presented_at = _now()
    _transition(db, row, actor, "prepared", "pending_approval", "presented", {"request_sha256": row.request_sha256})
    return _serialize(db, row)


@router.post("/requests/{request_id}/approve")
def approve_request(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    if row.status != "pending_approval":
        raise HTTPException(409, "Request is not awaiting human approval")
    if _utc(row.expires_at) <= _now() or row.request_sha256 != _digest(row):
        raise HTTPException(409, "Expired or modified request cannot be approved")
    if row.target_id != SIMULATED_DEVICE_ID:
        raise HTTPException(409, "Physical target approval is disabled")
    row.decided_by, row.decided_at = actor["id"], _now()
    email_digest = hashlib.sha256(actor["email"].strip().casefold().encode("utf-8")).hexdigest()
    _transition(db, row, actor, "pending_approval", "pending_second_approval", "approved_first", {"request_sha256": row.request_sha256, "approval_stage": 1, "human_button_confirmation": True, "verified_identity_email_sha256": email_digest})
    return _serialize(db, row)


@router.post("/requests/{request_id}/approve-second")
def approve_second_request(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    if actor.get("role") not in REVIEWER_ROLES:
        raise HTTPException(403, "A verified AeroMind reviewer role is required for the second approval")
    row = db.get(CommandRequestRecord, request_id)
    if row is None or row.target_id != SIMULATED_DEVICE_ID:
        raise HTTPException(404, "Simulation request not found")
    _expire_if_needed(db, row, actor)
    if row.status != "pending_second_approval":
        raise HTTPException(409, "Request is not awaiting its second human approval")
    if row.user_id == actor["id"]:
        raise HTTPException(403, "The request owner cannot provide both human approvals")
    if _utc(row.expires_at) <= _now() or row.request_sha256 != _digest(row):
        raise HTTPException(409, "Expired or modified request cannot be approved")
    first = db.scalar(select(CommandAuditEvent).where(
        CommandAuditEvent.request_id == row.id,
        CommandAuditEvent.event_type == "approved_first",
    ).order_by(CommandAuditEvent.occurred_at.asc()).limit(1))
    if first is None or first.actor_id == actor["id"]:
        raise HTTPException(409, "A separate first human approval is required")
    first_details = json.loads(first.details_json)
    email_digest = hashlib.sha256(actor["email"].strip().casefold().encode("utf-8")).hexdigest()
    if first_details.get("verified_identity_email_sha256") == email_digest:
        raise HTTPException(403, "The two approvals must use distinct verified OIDC identities")
    row.decided_by, row.decided_at = actor["id"], _now()
    _review_transition(db, row, actor, "pending_second_approval", "approved", "approved_second", {"request_sha256": row.request_sha256, "approval_stage": 2, "human_button_confirmation": True, "verified_identity_email_sha256": email_digest, "distinct_from_first_approver": True})
    return _serialize(db, row)


@router.post("/requests/{request_id}/reject-second")
def reject_second_request(request_id: str, body: DecisionInput, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    if actor.get("role") not in REVIEWER_ROLES:
        raise HTTPException(403, "A verified AeroMind reviewer role is required for the second decision")
    row = db.get(CommandRequestRecord, request_id)
    if row is None or row.target_id != SIMULATED_DEVICE_ID:
        raise HTTPException(404, "Simulation request not found")
    _expire_if_needed(db, row, actor)
    if row.status != "pending_second_approval":
        raise HTTPException(409, "Request is not awaiting its second human decision")
    if row.user_id == actor["id"]:
        raise HTTPException(403, "The request owner cannot provide the independent second decision")
    if _utc(row.expires_at) <= _now() or row.request_sha256 != _digest(row):
        raise HTTPException(409, "Expired or modified request cannot be rejected")
    _review_transition(db, row, actor, "pending_second_approval", "rejected", "rejected_second", {"reason": body.reason.strip(), "request_sha256": row.request_sha256, "approval_stage": 2})
    return _serialize(db, row)


@router.post("/requests/{request_id}/reject")
def reject_request(request_id: str, body: DecisionInput, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    if row.status != "pending_approval":
        raise HTTPException(409, "Request is not awaiting human approval")
    row.decided_by, row.decided_at = actor["id"], _now()
    _transition(db, row, actor, "pending_approval", "rejected", "rejected", {"reason": body.reason.strip()})
    return _serialize(db, row)


@router.post("/requests/{request_id}/cancel")
def cancel_request(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    if row.status not in {"prepared", "pending_approval", "pending_second_approval", "approved"}:
        raise HTTPException(409, "Request can no longer be cancelled")
    _transition(db, row, actor, row.status, "cancelled", "cancelled")
    return _serialize(db, row)


@router.post("/requests/{request_id}/execute-simulation")
def execute_simulation(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    if row.status != "approved":
        raise HTTPException(409, "Only an approved, unexpired request can be simulated")
    if _utc(row.expires_at) <= _now() or row.request_sha256 != _digest(row):
        raise HTTPException(409, "Expired or modified request cannot be executed")
    if row.target_id != SIMULATED_DEVICE_ID or json.loads(row.parameters_json):
        raise HTTPException(409, "Execution target or parameters violate the simulation-only contract")
    _transition(db, row, actor, "approved", "executing", "simulation_started", {"physical_output_enabled": False})
    # Intentionally deterministic demonstration result: this module has no
    # hardware adapter, network transport, subprocess, or actuator API.
    row.result_json = _canonical({
        "execution": "simulated",
        "device_response": "synthetic_acknowledgement",
        "physical_effect_verified": False,
        "sent_to_hardware": False,
        "evidence_level": "synthetic_demo",
        "note": "Aucun matériel connecté ni effet physique ; résultat de démonstration uniquement.",
    })
    row.completed_at = _now()
    _transition(db, row, actor, "executing", "completed_simulated", "simulation_completed", {"sent_to_hardware": False, "physical_effect_verified": False})
    return _serialize(db, row)


@router.get("/requests/{request_id}")
def read_request(request_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    actor = _user(aeromind_session, db)
    row = _owned(db, actor["id"], request_id)
    _expire_if_needed(db, row, actor)
    return _serialize(db, row)
