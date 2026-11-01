"""Institutional command chain for simulation-only AeroMind requests.

This module models the organisation's decision chain independently from the
hardware/MAVLink boundary.  It never imports a MAVLink pilot, a pool, a socket,
or a hardware token.  GATE 05 is an institutional decision by a Super-Admin;
it is intentionally not a flight-safety certification, a regulatory approval,
or a physical-output authorization.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Iterable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import InstitutionalCommandRequest, InstitutionalGateEvent


INSTITUTIONAL_GATES = ("GATE_01", "GATE_02", "GATE_03", "GATE_04")
GATE_ROLE: dict[str, str] = {
    "GATE_01": "gate_01_reviewer",
    "GATE_02": "gate_02_reviewer",
    "GATE_03": "gate_03_reviewer",
    "GATE_04": "gate_04_reviewer",
    "GATE_05": "super_admin",
}


@dataclass
class InstitutionalGateError(Exception):
    status_code: int
    code: str
    message: str

    def __str__(self) -> str:
        return self.message


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.replace(tzinfo=value.tzinfo or UTC).isoformat()


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def _intent_hash(virtual_command: str, parameters: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json({"command": virtual_command, "parameters": parameters}).encode("utf-8")).hexdigest()


def _transmission_secret() -> bytes:
    # Reuse the process signing secret. The service fails closed if the runtime
    # was misconfigured, rather than minting codes that cannot be authenticated.
    from .config import get_settings

    secret = get_settings().session_secret
    if not secret or len(secret.encode("utf-8")) < 32:
        raise InstitutionalGateError(503, "TRANSMISSION_SIGNING_UNAVAILABLE", "La clé de signature institutionnelle n’est pas disponible.")
    return secret.encode("utf-8")


def _transmission_signature(request_id: str, intent_hash: str, code: str) -> str:
    payload = f"{request_id}|{intent_hash}|{code}".encode("utf-8")
    return hmac.new(_transmission_secret(), payload, hashlib.sha256).hexdigest()


def _events(db: Session, request_id: str) -> list[InstitutionalGateEvent]:
    # Every transition reads the freshly appended event stream to determine the
    # next authorised gate; flush without committing so callers retain one
    # atomic request/decision transaction.
    db.flush()
    return list(db.scalars(
        select(InstitutionalGateEvent)
        .where(InstitutionalGateEvent.request_id == request_id)
        .order_by(InstitutionalGateEvent.occurred_at.asc(), InstitutionalGateEvent.id.asc())
    ))


def _event_view(event: InstitutionalGateEvent) -> dict[str, Any]:
    try:
        payload = json.loads(event.payload_json or "{}")
    except (TypeError, json.JSONDecodeError):
        payload = {}
    return {
        "id": event.id,
        "gate": event.gate,
        "eventType": event.event_type,
        "decision": event.decision,
        "actorId": event.actor_id,
        "actorRole": event.actor_role,
        "message": event.message,
        "payload": payload,
        "occurredAt": _iso(event.occurred_at),
        "correlationId": event.correlation_id,
    }


def request_view(db: Session, request: InstitutionalCommandRequest) -> dict[str, Any]:
    try:
        parameters = json.loads(request.parameters_json or "{}")
    except (TypeError, json.JSONDecodeError):
        parameters = {}
    return {
        "id": request.id,
        "projectId": request.project_id,
        "requesterId": request.requester_id,
        "virtualCommand": request.virtual_command,
        "parameters": parameters,
        "intentHash": request.intent_hash,
        "status": request.status,
        "simulationOnly": request.simulation_only is True,
        "physicalOutputEnabled": False,
        "physicalAuthorizationGranted": False,
        "createdAt": _iso(request.created_at),
        "updatedAt": _iso(request.updated_at),
        "simulationExecutedAt": _iso(request.simulation_executed_at),
        "transmissionIssuedAt": _iso(request.transmission_issued_at),
        "events": [_event_view(event) for event in _events(db, request.id)],
    }


def _append_event(
    db: Session,
    request: InstitutionalCommandRequest,
    *,
    gate: str,
    event_type: str,
    decision: str,
    actor_id: str,
    actor_role: str,
    message: str,
    payload: dict[str, Any] | None = None,
    correlation_id: str | None = None,
) -> InstitutionalGateEvent:
    event = InstitutionalGateEvent(
        id=str(uuid4()),
        request_id=request.id,
        project_id=request.project_id,
        gate=gate,
        event_type=event_type,
        decision=decision,
        actor_id=actor_id,
        actor_role=actor_role,
        message=message,
        payload_json=_canonical_json(payload or {}),
        correlation_id=correlation_id or str(uuid4()),
        occurred_at=_utc_now(),
    )
    db.add(event)
    return event


def _get_request(db: Session, request_id: str) -> InstitutionalCommandRequest:
    request = db.scalar(select(InstitutionalCommandRequest).where(InstitutionalCommandRequest.id == request_id))
    if request is None:
        raise InstitutionalGateError(404, "INSTITUTIONAL_REQUEST_NOT_FOUND", "Demande institutionnelle introuvable.")
    return request


def _validated_gates(db: Session, request_id: str) -> set[str]:
    return {
        event.gate
        for event in _events(db, request_id)
        if event.event_type == "institutional.gate.validated" and event.decision == "allow"
    }


def _next_gate(db: Session, request_id: str) -> str | None:
    validated = _validated_gates(db, request_id)
    return next((gate for gate in INSTITUTIONAL_GATES if gate not in validated), None)


def _require_role(actor_roles: Iterable[str], expected_role: str) -> None:
    roles = set(actor_roles)
    if expected_role not in roles:
        raise InstitutionalGateError(
            403,
            "INSTITUTIONAL_ROLE_REQUIRED",
            f"Le rôle explicite « {expected_role} » est requis pour cette étape; aucun approbateur générique ne peut le remplacer.",
        )


def create_request(
    db: Session,
    *,
    project_id: str,
    requester_id: str,
    requester_role: str,
    virtual_command: str,
    parameters: dict[str, Any],
) -> InstitutionalCommandRequest:
    command = virtual_command.strip()
    if not project_id or not requester_id or not command:
        raise InstitutionalGateError(422, "INSTITUTIONAL_REQUEST_INVALID", "Projet, auteur et commande virtuelle sont requis.")
    if len(command) > 80:
        raise InstitutionalGateError(422, "INSTITUTIONAL_REQUEST_INVALID", "La commande virtuelle dépasse 80 caractères.")
    request = InstitutionalCommandRequest(
        id=str(uuid4()),
        project_id=project_id,
        requester_id=requester_id,
        virtual_command=command,
        parameters_json=_canonical_json(parameters),
        intent_hash=_intent_hash(command, parameters),
        status="gate_01_pending",
        simulation_only=True,
        created_at=_utc_now(),
        updated_at=_utc_now(),
    )
    db.add(request)
    _append_event(
        db,
        request,
        gate="REQUEST",
        event_type="institutional.request.submitted",
        decision="allow",
        actor_id=requester_id,
        actor_role=requester_role,
        message="Demande virtuelle soumise au parcours institutionnel GATE 01–05.",
        payload={"simulationOnly": True, "physicalOutputEnabled": False, "intentHash": request.intent_hash},
    )
    return request


def decide_gate(
    db: Session,
    *,
    request_id: str,
    gate: str,
    decision: str,
    actor_id: str,
    actor_roles: Iterable[str],
    note: str = "",
) -> tuple[InstitutionalCommandRequest, str | None]:
    request = _get_request(db, request_id)
    normalized_gate = gate.upper().strip()
    normalized_decision = decision.lower().strip()
    if normalized_gate not in INSTITUTIONAL_GATES:
        raise InstitutionalGateError(422, "INSTITUTIONAL_GATE_UNKNOWN", "Seules les validations GATE 01 à GATE 04 sont acceptées par cette étape.")
    if normalized_decision not in {"approve", "refuse"}:
        raise InstitutionalGateError(422, "INSTITUTIONAL_DECISION_INVALID", "La décision doit être « approve » ou « refuse ».")
    if request.status.startswith("refused_") or request.status == "approved_gate_05":
        raise InstitutionalGateError(409, "INSTITUTIONAL_REQUEST_CLOSED", "La demande est clôturée et ne peut plus recevoir de validation.")
    expected_gate = _next_gate(db, request.id)
    if expected_gate != normalized_gate:
        raise InstitutionalGateError(
            409,
            "INSTITUTIONAL_SEQUENCE_REQUIRED",
            f"Étape attendue : {expected_gate or 'GATE_05'}; {normalized_gate} ne peut pas être validée maintenant.",
        )
    expected_role = GATE_ROLE[normalized_gate]
    _require_role(actor_roles, expected_role)
    actor_role = expected_role
    if normalized_decision == "refuse":
        request.status = f"refused_{normalized_gate.lower()}"
        request.updated_at = _utc_now()
        _append_event(
            db,
            request,
            gate=normalized_gate,
            event_type="institutional.gate.refused",
            decision="deny",
            actor_id=actor_id,
            actor_role=actor_role,
            message=f"{normalized_gate} refusée par son responsable habilité.",
            payload={"note": note, "simulationOnly": True, "physicalOutputEnabled": False},
        )
        return request, None

    _append_event(
        db,
        request,
        gate=normalized_gate,
        event_type="institutional.gate.validated",
        decision="allow",
        actor_id=actor_id,
        actor_role=actor_role,
        message=f"{normalized_gate} validée par son responsable habilité.",
        payload={"note": note, "simulationOnly": True, "physicalOutputEnabled": False},
    )
    transmission_code: str | None = None
    if normalized_gate == "GATE_04":
        transmission_code = f"AM-TR-{secrets.token_urlsafe(18)}"
        request.transmission_code_hash = hashlib.sha256(transmission_code.encode("utf-8")).hexdigest()
        request.transmission_signature = _transmission_signature(request.id, request.intent_hash, transmission_code)
        request.transmission_issued_at = _utc_now()
        request.status = "awaiting_gate_05"
        _append_event(
            db,
            request,
            gate="TRANSMISSION",
            event_type="institutional.transmission.issued",
            decision="allow",
            actor_id=actor_id,
            actor_role=actor_role,
            message="Code de transmission créé pour vérification personnelle par le Super-Administrateur.",
            payload={
                "codeFingerprint": request.transmission_code_hash[:16],
                "originAuthenticated": True,
                "authorizationGranted": False,
                "physicalOutputEnabled": False,
            },
        )
    else:
        next_gate = _next_gate(db, request.id)
        request.status = f"{next_gate.lower()}_pending" if next_gate else "awaiting_gate_05"
    request.updated_at = _utc_now()
    return request, transmission_code


def verify_transmission(
    db: Session,
    *,
    request_id: str,
    transmission_code: str,
    actor_id: str,
    actor_roles: Iterable[str],
) -> InstitutionalCommandRequest:
    request = _get_request(db, request_id)
    _require_role(actor_roles, "super_admin")
    if request.status != "awaiting_gate_05" or not request.transmission_code_hash or not request.transmission_signature:
        raise InstitutionalGateError(409, "TRANSMISSION_NOT_AVAILABLE", "La transmission n’est disponible qu’après GATE 04 validée.")
    candidate_hash = hashlib.sha256(transmission_code.encode("utf-8")).hexdigest()
    expected_signature = _transmission_signature(request.id, request.intent_hash, transmission_code)
    if not hmac.compare_digest(candidate_hash, request.transmission_code_hash) or not hmac.compare_digest(expected_signature, request.transmission_signature):
        _append_event(
            db,
            request,
            gate="TRANSMISSION",
            event_type="institutional.transmission.verification_failed",
            decision="deny",
            actor_id=actor_id,
            actor_role="super_admin",
            message="Le Super-Administrateur a refusé un code de transmission non authentique.",
            payload={"authorizationGranted": False, "physicalOutputEnabled": False},
        )
        request.updated_at = _utc_now()
        raise InstitutionalGateError(403, "TRANSMISSION_INVALID", "Code de transmission invalide ou intégrité non vérifiable.")
    _append_event(
        db,
        request,
        gate="TRANSMISSION",
        event_type="institutional.transmission.verified",
        decision="allow",
        actor_id=actor_id,
        actor_role="super_admin",
        message="Origine, authenticité et validations antérieures vérifiées personnellement par le Super-Administrateur.",
        payload={"authorizationGranted": False, "physicalOutputEnabled": False, "allPriorGatesValidated": True},
    )
    request.updated_at = _utc_now()
    return request


def decide_gate_05(
    db: Session,
    *,
    request_id: str,
    decision: str,
    transmission_code: str,
    actor_id: str,
    actor_roles: Iterable[str],
    note: str = "",
) -> InstitutionalCommandRequest:
    request = _get_request(db, request_id)
    normalized_decision = decision.lower().strip()
    if normalized_decision not in {"approve", "refuse"}:
        raise InstitutionalGateError(422, "INSTITUTIONAL_DECISION_INVALID", "La décision GATE 05 doit être « approve » ou « refuse ».")
    _require_role(actor_roles, "super_admin")
    if request.status != "awaiting_gate_05":
        raise InstitutionalGateError(409, "GATE_05_NOT_AVAILABLE", "GATE 05 n’est disponible qu’après GATE 01 à GATE 04 et transmission valide.")
    # This records a verification event; it never grants a physical authorization.
    verify_transmission(
        db,
        request_id=request.id,
        transmission_code=transmission_code,
        actor_id=actor_id,
        actor_roles=actor_roles,
    )
    request.status = "approved_gate_05" if normalized_decision == "approve" else "refused_gate_05"
    request.gate_05_decided_at = _utc_now()
    request.gate_05_decided_by = actor_id
    request.updated_at = _utc_now()
    _append_event(
        db,
        request,
        gate="GATE_05",
        event_type="institutional.gate_05.decided",
        decision="allow" if normalized_decision == "approve" else "deny",
        actor_id=actor_id,
        actor_role="super_admin",
        message=("GATE 05 approuvée personnellement par le Super-Administrateur." if normalized_decision == "approve" else "GATE 05 refusée personnellement par le Super-Administrateur."),
        payload={
            "note": note,
            "institutionalDecision": normalized_decision,
            "physicalOutputEnabled": False,
            "physicalAuthorizationGranted": False,
            "safetyCertificationGranted": False,
            "regulatoryAuthorizationGranted": False,
        },
    )
    return request


def execute_in_simulation(
    db: Session,
    *,
    request_id: str,
    actor_id: str,
    actor_role: str,
) -> InstitutionalCommandRequest:
    """Record a virtual execution without imposing GATE 05 as a hardware proxy.

    Simulation remains usable by an authorised operator/analyst throughout the
    institutional review; this merely records the event in the same audit trail.
    """
    request = _get_request(db, request_id)
    request.simulation_executed_at = _utc_now()
    request.updated_at = _utc_now()
    _append_event(
        db,
        request,
        gate="SIMULATION",
        event_type="institutional.simulation.executed",
        decision="allow",
        actor_id=actor_id,
        actor_role=actor_role,
        message="Commande exécutée dans le simulateur AeroMind; aucun transport MAVLink ni sortie physique n’a été invoqué.",
        payload={"simulationOnly": True, "physicalOutputEnabled": False, "physicalTransportInvoked": False},
    )
    return request


__all__ = [
    "INSTITUTIONAL_GATES", "GATE_ROLE", "InstitutionalGateError", "create_request",
    "decide_gate", "verify_transmission", "decide_gate_05", "execute_in_simulation", "request_view",
]
