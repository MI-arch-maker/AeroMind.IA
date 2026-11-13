"""HTTP API for the institutional GATE 01–05 simulation-only workflow."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import SessionLocal
from .institutional_gates import (
    InstitutionalGateError,
    create_request,
    decide_gate,
    decide_gate_05,
    execute_in_simulation,
    request_view,
    verify_transmission,
)
from .labbench_auth import StepUpSession, verify_lab_session

router = APIRouter(prefix="/api/institutional", tags=["institutional-gates"])


class InstitutionalRequestInput(BaseModel):
    project_id: str = Field(min_length=1, max_length=36)
    virtual_command: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any] = Field(default_factory=dict)


class GateDecisionInput(BaseModel):
    decision: Literal["approve", "refuse"]
    note: str = Field(default="", max_length=1000)


class Gate05DecisionInput(GateDecisionInput):
    transmission_code: str = Field(min_length=12, max_length=160)


class TransmissionVerificationInput(BaseModel):
    request_id: str = Field(min_length=1, max_length=36)
    transmission_code: str = Field(min_length=12, max_length=160)


def _db_session():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _error(error: InstitutionalGateError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


def _same_project(session: StepUpSession, project_id: str) -> None:
    if session.project_id != project_id:
        raise HTTPException(status_code=403, detail={"code": "PROJECT_SCOPE_REQUIRED", "message": "La session step-up doit être liée au projet de la demande."})


def _requester_role(session: StepUpSession) -> str:
    # The original operator/analyst roles remain explicit request and simulation
    # roles; gate review roles are intentionally not inferred from them.
    if "operator" in session.scope:
        return "operator"
    if "analyst" in session.scope:
        return "analyst"
    raise HTTPException(status_code=403, detail={"code": "INSTITUTIONAL_REQUEST_ROLE_REQUIRED", "message": "Un rôle operator ou analyst habilité est requis pour une demande virtuelle."})


def _load_scoped_request(db: Session, request_id: str, session: StepUpSession):
    from .institutional_gates import _get_request  # private lookup kept server-side

    request = _get_request(db, request_id)
    _same_project(session, request.project_id)
    return request


@router.post("/requests", status_code=201)
def submit_institutional_request(
    payload: InstitutionalRequestInput,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    _same_project(session, payload.project_id)
    role = _requester_role(session)
    try:
        request = create_request(
            db,
            project_id=payload.project_id,
            requester_id=session.user_id,
            requester_role=role,
            virtual_command=payload.virtual_command,
            parameters=payload.parameters,
        )
        db.flush()
        return request_view(db, request)
    except InstitutionalGateError as error:
        raise _error(error) from error


@router.get("/requests/{request_id}")
def read_institutional_request(
    request_id: str,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    try:
        request = _load_scoped_request(db, request_id, session)
        return request_view(db, request)
    except InstitutionalGateError as error:
        raise _error(error) from error


@router.post("/requests/{request_id}/gates/{gate}")
def decide_institutional_gate(
    request_id: str,
    gate: str,
    payload: GateDecisionInput,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    try:
        request = _load_scoped_request(db, request_id, session)
        request, transmission_code = decide_gate(
            db,
            request_id=request.id,
            gate=gate,
            decision=payload.decision,
            actor_id=session.user_id,
            actor_roles=session.scope,
            note=payload.note,
        )
        db.flush()
        response = request_view(db, request)
        # Returned only to the validated GATE 04 action so the secure delivery
        # channel can pass it to the Super-Administrator. It is never itself an
        # automatic approval nor a hardware token.
        if transmission_code:
            response["transmissionCode"] = transmission_code
        return response
    except InstitutionalGateError as error:
        raise _error(error) from error


@router.post("/transmissions/verify")
def verify_institutional_transmission(
    payload: TransmissionVerificationInput,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    try:
        request = _load_scoped_request(db, payload.request_id, session)
        request = verify_transmission(
            db,
            request_id=request.id,
            transmission_code=payload.transmission_code,
            actor_id=session.user_id,
            actor_roles=session.scope,
        )
        db.flush()
        return request_view(db, request)
    except InstitutionalGateError as error:
        raise _error(error) from error


@router.post("/requests/{request_id}/gate-05")
def decide_institutional_gate_05(
    request_id: str,
    payload: Gate05DecisionInput,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    try:
        request = _load_scoped_request(db, request_id, session)
        request = decide_gate_05(
            db,
            request_id=request.id,
            decision=payload.decision,
            transmission_code=payload.transmission_code,
            actor_id=session.user_id,
            actor_roles=session.scope,
            note=payload.note,
        )
        db.flush()
        return request_view(db, request)
    except InstitutionalGateError as error:
        raise _error(error) from error


@router.post("/requests/{request_id}/simulate")
def execute_institutional_request_in_simulation(
    request_id: str,
    session: StepUpSession = Depends(verify_lab_session),
    db: Session = Depends(_db_session),
):
    try:
        request = _load_scoped_request(db, request_id, session)
        role = _requester_role(session)
        request = execute_in_simulation(db, request_id=request.id, actor_id=session.user_id, actor_role=role)
        db.flush()
        return request_view(db, request)
    except InstitutionalGateError as error:
        raise _error(error) from error
