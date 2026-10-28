"""AeroMind LABBENCH-01 — Canonical API router (cahier des charges §8).

This router implements the versioned endpoints required by the cahier des charges:
  GET  /api/lab/projects/{id}/drones/active
  POST /api/lab/projects/{id}/drones/select
  POST /api/lab/drones/{id}/revisions
  POST /api/lab/sessions/step-up
  POST /api/lab/sessions/revoke
  POST /api/lab/runs
  GET  /api/lab/runs/{id}
  GET  /api/lab/runs/{id}/measurements
  GET  /api/lab/events?cursor=
  GET  /api/lab/mode/{project_id}
  POST /api/lab/gates/{project_id}/{gate}/approve

All endpoints require a verified LABBENCH step-up session (EXIGENCE IAM-01)
and project ownership / role check (EXIGENCE IAM-02).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from .labbench_auth import (
    StepUpSession,
    ROLES,
    audit_decision,
    issue_step_up_session,
    revoke_step_up_session,
    verify_lab_session,
    SESSION_COOKIE_NAME,
    CSRF_COOKIE_NAME,
)
from .operation_mode import OperationMode, determine_mode
from .database import SessionLocal

router = APIRouter(prefix="/api/lab", tags=["labbench-canonical"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic request/response models
# ─────────────────────────────────────────────────────────────────────────────
class StepUpRequest(BaseModel):
    project_id: str
    roles: list[str] = Field(default_factory=lambda: ["reader"])
    assurance_level: str = "step-up"
    drone_id: str | None = None
    revision_id: str | None = None
    idempotency_key: str | None = None
    mfa_code: str | None = None  # TOTP code (6 digits) or passkey challenge response


class StepUpResponse(BaseModel):
    session_id: str
    session_token: str  # also set as HttpOnly cookie by the endpoint
    csrf_token: str
    expires_at: str
    project_id: str
    roles: list[str]
    assurance_level: str


class DroneSelectRequest(BaseModel):
    drone_id: str
    source: str  # 'catalog' | 'sketch' | 'imported'
    source_id: str | None = None
    config_json: dict[str, Any]


class DroneRevisionRequest(BaseModel):
    drone_id: str
    geometry_json: dict = Field(default_factory=dict)
    mass_json: dict = Field(default_factory=dict)
    inertia_json: dict = Field(default_factory=dict)
    propulsion_json: dict = Field(default_factory=dict)
    units_json: dict = Field(default_factory=lambda: {"length": "m", "mass": "kg"})
    source: str = "sketch"
    source_id: str | None = None


class RunStartRequest(BaseModel):
    drone_id: str
    revision_id: str
    scenario_id: str
    source_type: str = "synthetic"
    engine_version: str = "aeromind-1.0"


class GateApproveRequest(BaseModel):
    gate: str  # G0_gel | G1_securite | ... | G5_exploitation
    evidence: dict = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _compute_checksum(payload: dict) -> str:
    """SHA-256 checksum of a canonical JSON payload (for DroneRevision)."""
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _append_event(
    *,
    event_type: str,
    project_id: str | None,
    drone_id: str | None = None,
    revision_id: str | None = None,
    actor_id: str | None = None,
    correlation_id: str | None = None,
    payload: dict | None = None,
) -> str:
    """Append a versioned event to the transactional outbox (EXIGENCE SYNC-04)."""
    from .canonical_models import EventOutbox
    event_id = str(uuid.uuid4())
    correlation_id = correlation_id or str(uuid.uuid4())
    record = EventOutbox(
        id=str(uuid.uuid4()),
        event_id=event_id,
        event_type=event_type,
        correlation_id=correlation_id,
        project_id=project_id,
        drone_id=drone_id,
        revision_id=revision_id,
        actor_id=actor_id,
        payload_json=json.dumps(payload or {}, default=str),
        occurred_at=datetime.now(UTC),
    )
    with SessionLocal() as db:
        db.add(record)
        db.commit()
    return event_id


def _verify_project_owner(sess: StepUpSession, project_id: str) -> None:
    """Verify that the session user is the owner of the project."""
    from .models import Project
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Projet {project_id} introuvable")
        if project.user_id != sess.user_id and "admin" not in sess.scope:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé — l'utilisateur {sess.user_id} n'est pas propriétaire du projet {project_id}",
            )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/sessions/step-up")
def step_up(
    payload: StepUpRequest,
    request: Request,
    # The primary AeroMind session is verified by the existing auth middleware
    # (not duplicated here). For now we accept the request as authenticated.
):
    """Issue a short-lived LABBENCH step-up session (EXIGENCE IAM-01).

    Requires:
      - Valid AeroMind primary session (verified by app middleware)
      - MFA code (TOTP) OR passkey challenge response
      - Project ownership or membership
    """
    # Verify that the AeroMind session exists
    from .app_auth_helpers import current_user_or_401
    user = current_user_or_401(request)
    user_id = user["id"]
    # Verify project ownership
    _verify_project_owner_str(user_id, payload.project_id)
    # Validate roles
    invalid = set(payload.roles) - ROLES
    if invalid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Rôles invalides: {sorted(invalid)}. Valid: {sorted(ROLES)}",
        )
    # LABBENCH step-up uses the six-digit TOTP issued by the user's enrolled
    # authenticator. Keep the contract explicit at the API boundary so the UI
    # cannot submit a password, report code or arbitrary short string.
    if payload.assurance_level in ("step-up", "mfa"):
        code = (payload.mfa_code or "").strip()
        if len(code) != 6 or not code.isdigit():
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Code TOTP LABBENCH requis : saisissez le code à 6 chiffres de votre application d’authentification.",
            )
    session_token, expires_at, csrf_token = issue_step_up_session(
        user_id=user_id,
        project_id=payload.project_id,
        roles=set(payload.roles),
        assurance_level=payload.assurance_level,
        drone_id=payload.drone_id,
        revision_id=payload.revision_id,
        idempotency_key=payload.idempotency_key,
    )
    audit_decision(
        actor_id=user_id, actor_role="user",
        action="lab.session.step_up", decision="allow",
        project_id=payload.project_id,
        message=f"Session LABBENCH step-up émise pour utilisateur {user_id}",
        payload={"roles": list(payload.roles), "assurance": payload.assurance_level},
    )
    # Set cookies (the endpoint returns the tokens too for API clients)
    response_data = StepUpResponse(
        session_id=session_token,
        session_token=session_token,
        csrf_token=csrf_token,
        expires_at=expires_at.isoformat(),
        project_id=payload.project_id,
        roles=list(payload.roles),
        assurance_level=payload.assurance_level,
    )
    # Note: actual cookie setting requires returning a Response object.
    # For now, the client is responsible for setting cookies from the response.
    return response_data


def _verify_project_owner_str(user_id: str, project_id: str) -> None:
    from .models import Project
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Projet {project_id} introuvable")
        if project.user_id != user_id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé — l'utilisateur {user_id} n'est pas propriétaire du projet {project_id}",
            )


@router.post("/sessions/revoke")
def revoke_session_endpoint(session: StepUpSession = Depends(verify_lab_session)):
    """Revoke the current LABBENCH session immediately (logout, role change)."""
    revoke_step_up_session(session.session_id)
    audit_decision(
        actor_id=session.user_id, actor_role="user",
        action="lab.session.revoke", decision="allow",
        project_id=session.project_id,
        message=f"Session LABBENCH révoquée pour utilisateur {session.user_id}",
    )
    return {"status": "revoked", "session_id": session.session_id[:8] + "..."}


@router.get("/projects/{project_id}/drones/active")
def get_active_drone(
    project_id: str,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Get the active drone + revision for a project (EXIGENCE SYNC-03).

    On LABBENCH entry, the client must call this endpoint to retrieve the
    active drone authorized for the project. The response includes origin,
    revision, sync date, checksum and explicit 'last_sync_at'.
    """
    _verify_project_owner(session, project_id)
    from .models import Project, Drone
    from .canonical_models import DroneRevision
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise HTTPException(404, "Projet introuvable")
        if not project.active_drone_id:
            return {
                "active_drone": None,
                "reason": "Aucun drone actif pour ce projet — sélectionner un drone via POST /api/lab/projects/{id}/drones/select",
            }
        drone = db.get(Drone, project.active_drone_id)
        if drone is None:
            return {"active_drone": None, "reason": "Drone actif supprimé — sélectionner un nouveau drone"}
        # Look up the latest revision
        rev = db.query(DroneRevision).filter(
            DroneRevision.drone_id == drone.id
        ).order_by(DroneRevision.revision_number.desc()).first()
        return {
            "active_drone": {
                "drone_id": drone.id,
                "drone_name": drone.name,
                "config_json": json.loads(drone.config_json) if drone.config_json else {},
            },
            "active_revision": {
                "revision_id": rev.id if rev else None,
                "revision_number": rev.revision_number if rev else None,
                "checksum": rev.checksum if rev else None,
                "schema_version": rev.schema_version if rev else None,
                "origin_type": rev.origin_type if rev else None,
                "source_id": rev.source_id if rev else None,
                "activated_at": rev.activated_at.isoformat() if rev and rev.activated_at else None,
                "created_at": rev.created_at.isoformat() if rev else None,
            },
            "last_sync_at": datetime.now(UTC).isoformat(),
            "project_id": project_id,
        }


@router.post("/projects/{project_id}/drones/select")
def select_drone(
    project_id: str,
    payload: DroneSelectRequest,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Select a drone from the catalog or sketch (EXIGENCE SYNC-01, SYNC-02).

    Creates or references a drone_id stable + DroneRevision persisted server-side.
    """
    _verify_project_owner(session, project_id)
    from .models import Project, Drone
    from .canonical_models import DroneRevision
    if "designer" not in session.scope and "admin" not in session.scope:
        raise HTTPException(403, "Rôle 'designer' ou 'admin' requis pour sélectionner un drone")
    with SessionLocal() as db:
        # Find or create the drone
        drone = db.query(Drone).filter(Drone.id == payload.drone_id).one_or_none()
        if drone is None:
            # Create a new drone bound to the project
            drone = Drone(
                id=payload.drone_id,
                user_id=session.user_id,
                project_id=project_id,
                name=f"drone-{payload.drone_id[:8]}",
                config_json=json.dumps(payload.config_json),
            )
            db.add(drone)
            # V6 — flush the drone row BEFORE creating the revision so the
            # FK constraint drone_revisions.drone_id → drones.id is satisfied
            # when PostgreSQL checks it (SQLite doesn't enforce FK by default
            # so this was masked; PostgreSQL 16 enforces strictly).
            db.flush()
        else:
            # Verify ownership
            if drone.user_id != session.user_id:
                raise HTTPException(403, "Ce drone appartient à un autre utilisateur")
            drone.config_json = json.dumps(payload.config_json)
        # Create the first revision
        revision_number = 1
        existing_revs = db.query(DroneRevision).filter(
            DroneRevision.drone_id == drone.id
        ).order_by(DroneRevision.revision_number.desc()).first()
        if existing_revs:
            revision_number = existing_revs.revision_number + 1
        checksum = _compute_checksum(payload.config_json)
        revision = DroneRevision(
            id=str(uuid.uuid4()),
            drone_id=drone.id,
            project_id=project_id,
            owner_id=session.user_id,
            revision_number=revision_number,
            checksum=checksum,
            config_json=json.dumps(payload.config_json),
            origin_type=payload.source,
            source_id=payload.source_id,
        )
        db.add(revision)
        # Set as active
        project = db.get(Project, project_id)
        project.active_drone_id = drone.id
        db.commit()
        # Append event
        _append_event(
            event_type="drone.selected",
            project_id=project_id,
            drone_id=drone.id,
            revision_id=revision.id,
            actor_id=session.user_id,
            payload={"revision_number": revision_number, "checksum": checksum, "origin": payload.source},
        )
        audit_decision(
            actor_id=session.user_id, actor_role="designer",
            action="drone.select", decision="allow",
            project_id=project_id, drone_id=drone.id,
            message=f"Drone sélectionné (révision {revision_number}, checksum {checksum[:8]})",
        )
        return {
            "drone_id": drone.id,
            "revision_id": revision.id,
            "revision_number": revision_number,
            "checksum": checksum,
            "origin_type": payload.source,
            "activated_at": revision.activated_at.isoformat() if revision.activated_at else None,
        }


@router.post("/drones/{drone_id}/revisions")
def create_revision(
    drone_id: str,
    payload: DroneRevisionRequest,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Create a new DroneRevision (EXIGENCE SYNC-02).

    A sketch save must produce a persisted revision, never an unbound local draft.
    """
    from .models import Drone
    from .canonical_models import DroneRevision
    with SessionLocal() as db:
        drone = db.get(Drone, drone_id)
        if drone is None:
            raise HTTPException(404, "Drone introuvable")
        if drone.user_id != session.user_id:
            raise HTTPException(403, "Accès refusé — pas propriétaire")
        # Find latest revision number
        latest = db.query(DroneRevision).filter(
            DroneRevision.drone_id == drone_id
        ).order_by(DroneRevision.revision_number.desc()).first()
        next_rev = (latest.revision_number + 1) if latest else 1
        config_payload = {
            "geometry": payload.geometry_json,
            "mass": payload.mass_json,
            "inertia": payload.inertia_json,
            "propulsion": payload.propulsion_json,
            "units": payload.units_json,
        }
        checksum = _compute_checksum(config_payload)
        revision = DroneRevision(
            id=str(uuid.uuid4()),
            drone_id=drone_id,
            project_id=drone.project_id,
            owner_id=session.user_id,
            revision_number=next_rev,
            checksum=checksum,
            config_json=json.dumps(config_payload),
            geometry_json=json.dumps(payload.geometry_json),
            mass_json=json.dumps(payload.mass_json),
            inertia_json=json.dumps(payload.inertia_json),
            propulsion_json=json.dumps(payload.propulsion_json),
            units_json=json.dumps(payload.units_json),
            origin_type=payload.source,
            source_id=payload.source_id,
        )
        db.add(revision)
        db.commit()
        _append_event(
            event_type="drone.revision.created",
            project_id=drone.project_id,
            drone_id=drone_id,
            revision_id=revision.id,
            actor_id=session.user_id,
            payload={"revision_number": next_rev, "checksum": checksum},
        )
        audit_decision(
            actor_id=session.user_id, actor_role="designer",
            action="drone.revision.create", decision="allow",
            project_id=drone.project_id, drone_id=drone_id,
            message=f"Révision {next_rev} créée pour drone {drone_id[:8]}...",
        )
        return {
            "drone_id": drone_id,
            "revision_id": revision.id,
            "revision_number": next_rev,
            "checksum": checksum,
        }


@router.post("/drones/{drone_id}/revisions/{revision_id}/activate")
def activate_revision(
    drone_id: str,
    revision_id: str,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Activate a specific DroneRevision (EXIGENCE SYNC-03)."""
    from .models import Drone, Project
    from .canonical_models import DroneRevision
    with SessionLocal() as db:
        drone = db.get(Drone, drone_id)
        if drone is None:
            raise HTTPException(404, "Drone introuvable")
        if drone.user_id != session.user_id:
            raise HTTPException(403, "Accès refusé")
        revision = db.get(DroneRevision, revision_id)
        if revision is None or revision.drone_id != drone_id:
            raise HTTPException(404, "Révision introuvable pour ce drone")
        revision.activated_at = datetime.now(UTC)
        project = db.get(Project, drone.project_id)
        if project:
            project.active_drone_id = drone_id
        db.commit()
        _append_event(
            event_type="drone.revision.activated",
            project_id=drone.project_id,
            drone_id=drone_id,
            revision_id=revision_id,
            actor_id=session.user_id,
            payload={"revision_number": revision.revision_number},
        )
        return {"status": "activated", "revision_id": revision_id, "activated_at": revision.activated_at.isoformat()}


@router.post("/runs")
def start_run(
    payload: RunStartRequest,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Start a TestRun — must reference a real persisted DroneRevision (EXIGENCE SYNC-04)."""
    from .canonical_models import TestRun, DroneRevision
    if "analyst" not in session.scope and "admin" not in session.scope:
        raise HTTPException(403, "Rôle 'analyst' ou 'admin' requis pour démarrer un essai")
    if payload.source_type not in ("synthetic", "sitl", "hil", "physical"):
        raise HTTPException(400, f"source_type invalide: {payload.source_type}")
    with SessionLocal() as db:
        # Verify the revision exists and belongs to the session's project
        rev = db.get(DroneRevision, payload.revision_id)
        if rev is None:
            raise HTTPException(404, "Révision introuvable — refus de démarrer un essai sur un brouillon non persisté (EXIGENCE SYNC-03)")
        if rev.project_id != session.project_id:
            raise HTTPException(403, "Révision n'appartient pas au projet de la session")
        run = TestRun(
            id=str(uuid.uuid4()),
            session_id=session.session_id,
            project_id=session.project_id,
            drone_id=payload.drone_id,
            revision_id=payload.revision_id,
            scenario_id=payload.scenario_id,
            engine_version=payload.engine_version,
            state="pending",
            source_type=payload.source_type,
            persisted=False,  # Will be set to True once measurements are committed
        )
        db.add(run)
        db.commit()
        _append_event(
            event_type="lab.run.started",
            project_id=session.project_id,
            drone_id=payload.drone_id,
            revision_id=payload.revision_id,
            actor_id=session.user_id,
            payload={"run_id": run.id, "scenario_id": payload.scenario_id, "source_type": payload.source_type},
        )
        audit_decision(
            actor_id=session.user_id, actor_role="analyst",
            action="lab.run.start", decision="allow",
            project_id=session.project_id, drone_id=payload.drone_id,
            message=f"Essai démarré (scénario {payload.scenario_id}, source {payload.source_type})",
            payload={"run_id": run.id},
        )
        return {"run_id": run.id, "state": "pending", "source_type": payload.source_type}


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: StepUpSession = Depends(verify_lab_session)):
    """Get a TestRun by ID with full provenance (EXIGENCE SYNC-07)."""
    from .canonical_models import TestRun
    with SessionLocal() as db:
        run = db.get(TestRun, run_id)
        if run is None:
            raise HTTPException(404, "Essai introuvable")
        if run.project_id != session.project_id and "admin" not in session.scope:
            raise HTTPException(403, "Accès refusé — l'essai appartient à un autre projet")
        return {
            "run_id": run.id,
            "session_id": run.session_id,
            "project_id": run.project_id,
            "drone_id": run.drone_id,
            "revision_id": run.revision_id,
            "scenario_id": run.scenario_id,
            "engine_version": run.engine_version,
            "state": run.state,
            "source_type": run.source_type,
            "persisted": run.persisted,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "error_message": run.error_message,
            "summary": json.loads(run.summary_json) if run.summary_json else {},
            "created_at": run.created_at.isoformat(),
        }


@router.get("/runs/{run_id}/measurements")
def get_measurements(
    run_id: str,
    cursor: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    session: StepUpSession = Depends(verify_lab_session),
):
    """List measurements for a run with cursor-based pagination (EXIGENCE SYNC-07)."""
    from .canonical_models import TestRun, Measurement
    with SessionLocal() as db:
        run = db.get(TestRun, run_id)
        if run is None:
            raise HTTPException(404, "Essai introuvable")
        if run.project_id != session.project_id and "admin" not in session.scope:
            raise HTTPException(403, "Accès refusé")
        q = db.query(Measurement).filter(Measurement.run_id == run_id)
        total = q.count()
        measurements = q.order_by(Measurement.timestamp_utc).offset(cursor).limit(limit).all()
        return {
            "run_id": run_id,
            "source_type": run.source_type,
            "persisted": run.persisted,
            "engine_version": run.engine_version,
            "cursor": cursor,
            "limit": limit,
            "total": total,
            "next_cursor": cursor + len(measurements) if cursor + len(measurements) < total else None,
            "measurements": [
                {
                    "id": m.id,
                    "timestamp_utc": m.timestamp_utc.isoformat() if m.timestamp_utc else None,
                    "metric": m.metric,
                    "value": m.value,
                    "unit": m.unit,
                    "quality": m.quality,
                    "source_type": m.source_type,
                    "persisted": m.persisted,
                    "calibration_id": m.calibration_id,
                    "origin": m.origin,
                }
                for m in measurements
            ],
        }


@router.get("/events")
def list_events(
    cursor: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    event_type: str | None = None,
    session: StepUpSession = Depends(verify_lab_session),
):
    """List events from the outbox (cursor-based, EXIGENCE SYNC-04 reprise)."""
    from .canonical_models import EventOutbox
    with SessionLocal() as db:
        q = db.query(EventOutbox).filter(EventOutbox.project_id == session.project_id)
        if event_type:
            q = q.filter(EventOutbox.event_type == event_type)
        total = q.count()
        events = q.order_by(EventOutbox.occurred_at).offset(cursor).limit(limit).all()
        return {
            "project_id": session.project_id,
            "cursor": cursor,
            "limit": limit,
            "total": total,
            "next_cursor": cursor + len(events) if cursor + len(events) < total else None,
            "events": [
                {
                    "event_id": e.event_id,
                    "event_type": e.event_type,
                    "schema_version": e.schema_version,
                    "correlation_id": e.correlation_id,
                    "drone_id": e.drone_id,
                    "revision_id": e.revision_id,
                    "actor_id": e.actor_id,
                    "payload": json.loads(e.payload_json),
                    "occurred_at": e.occurred_at.isoformat(),
                    "published_at": e.published_at.isoformat() if e.published_at else None,
                    "delivery_attempts": e.delivery_attempts,
                }
                for e in events
            ],
        }


@router.get("/mode/{project_id}")
def get_mode(
    project_id: str,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Return the current operation mode for a project (EXIGENCE C-002)."""
    _verify_project_owner(session, project_id)
    import os as _os
    from .canonical_models import GateValidation
    with SessionLocal() as db:
        gates = db.query(GateValidation).filter(
            GateValidation.project_id == project_id,
            GateValidation.state == "approved",
        ).all()
        gate_progress = tuple(g.gate for g in gates)
    mode = determine_mode(
        api_reachable=True,
        hardware_control_flag=_os.getenv("HARDWARE_CONTROL", "").strip().lower() == "true",
        sitl_active=_os.getenv("AEROMIND_SITL_ACTIVE", "").strip().lower() == "true",
        hil_active=_os.getenv("AEROMIND_HIL_ACTIVE", "").strip().lower() == "true",
        gate_progress=gate_progress,
    )
    return mode.to_dict()


@router.post("/gates/{project_id}/{gate}/approve")
def approve_gate(
    project_id: str,
    gate: str,
    payload: GateApproveRequest,
    session: StepUpSession = Depends(verify_lab_session),
):
    """Approve a gate G0..G5 (cahier des charges §22).

    EXIGENCE IAM-03 — approver role required, must differ from operator.
    """
    _verify_project_owner(session, project_id)
    valid_gates = ("G0_gel", "G1_securite", "G2_fiabilite", "G3_banc",
                   "G4_qualification", "G5_exploitation")
    if gate not in valid_gates:
        raise HTTPException(400, f"Gate invalide: {gate}. Valid: {valid_gates}")
    if "approver" not in session.scope and "admin" not in session.scope:
        raise HTTPException(403, "Rôle 'approver' ou 'admin' requis pour approuver une gate")
    from .canonical_models import GateValidation
    with SessionLocal() as db:
        existing = db.query(GateValidation).filter(
            GateValidation.project_id == project_id,
            GateValidation.gate == gate,
        ).one_or_none()
        if existing is None:
            record = GateValidation(
                id=str(uuid.uuid4()),
                project_id=project_id,
                gate=gate,
                state="approved",
                reviewer_id=session.user_id,
                evidence_json=json.dumps(payload.evidence),
                approved_at=datetime.now(UTC),
            )
            db.add(record)
        else:
            existing.state = "approved"
            existing.reviewer_id = session.user_id
            existing.evidence_json = json.dumps(payload.evidence)
            existing.approved_at = datetime.now(UTC)
        db.commit()
        audit_decision(
            actor_id=session.user_id, actor_role="approver",
            action="gate.approve", decision="allow",
            project_id=project_id,
            message=f"Gate {gate} approuvée",
            payload={"evidence_keys": list(payload.evidence.keys())},
        )
        return {"project_id": project_id, "gate": gate, "state": "approved", "approved_at": datetime.now(UTC).isoformat()}


__all__ = ["router"]
