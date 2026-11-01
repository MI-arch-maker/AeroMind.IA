"""Authenticated AeroMind file, connector catalog and internal-model APIs."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .business_api import get_project, owner
from .database import SessionLocal, get_db
from .engineering_connector_registry import connector_catalog
from .engineering_jobs import process_engineering_job, storage_path, storage_root
from .models import (
    AuditEvent, Drone, EngineeringArtifact, EngineeringJob,
    EngineeringSimulationRun, Project,
)
from sitl_modules.propulsion_model import new_state, step

router = APIRouter(prefix="/api/engineering", tags=["engineering-connectors"])
MAX_CSV_BYTES = 50 * 1024 * 1024
MAX_STEP_BYTES = 250 * 1024 * 1024
MAX_PROJECT_BYTES = 1024 * 1024 * 1024
ACTIVE_JOB_LIMIT_PER_PROJECT = 2
_IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")


class CommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: bool
    expected_input_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    acknowledge_partial: bool = False
    confirm_source_only: bool = False


class ExportJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=36)
    source_job_id: str = Field(min_length=1, max_length=36)
    export_format: Literal["machine-canonical", "spreadsheet-safe"] = "machine-canonical"


class InternalSimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=36)
    scenario_id: Literal[
        "propulsion.piston-demo.v1",
        "propulsion.jet-demo.v1",
        "propulsion.hybrid-demo.v1",
    ]


class ExternalSITLRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=36)
    target_id: Literal["ardupilot-copter-sitl", "px4-copter-sitl"]


def _actor(cookie: str | None, authorization: str | None, db: Session) -> str:
    return owner(cookie, db, authorization)


def _idempotency_key(value: str | None) -> str:
    if value is None or not _IDEMPOTENCY_RE.fullmatch(value):
        raise HTTPException(422, "Idempotency-Key obligatoire (1 à 64 caractères sûrs)")
    return value


def _audit(db: Session, *, user_id: str, project_id: str, event_type: str, message: str, payload: dict) -> None:
    db.add(AuditEvent(
        id=str(uuid4()), project_id=project_id, user_id=user_id, actor_role="user",
        event_type=event_type, message=message,
        payload_json=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        occurred_at=datetime.now(UTC),
    ))


def _job_payload(job: EngineeringJob, artifact: EngineeringArtifact | None = None) -> dict:
    try:
        report = json.loads(job.report_json or "{}")
    except (json.JSONDecodeError, TypeError):
        report = {}
    return {
        "job_id": job.id,
        "artifact_id": job.artifact_id,
        "project_id": job.project_id,
        "cell_id": artifact.cell_id if artifact else None,
        "job_type": job.job_type,
        "profile_id": job.profile_id,
        "status": job.status,
        "phase": job.phase,
        "progress": None,
        "input_sha256": job.input_sha256,
        "report": report,
        "error_code": job.error_code,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "committed_at": job.committed_at.isoformat() if job.committed_at else None,
        "physical_output_enabled": False,
        "artifact_status": artifact.status if artifact else None,
    }


def _owned_job(db: Session, job_id: str, user_id: str) -> tuple[EngineeringJob, EngineeringArtifact]:
    job = db.scalar(select(EngineeringJob).where(EngineeringJob.id == job_id, EngineeringJob.user_id == user_id))
    if job is None:
        raise HTTPException(404, "Job d’ingénierie introuvable")
    artifact = db.get(EngineeringArtifact, job.artifact_id)
    if artifact is None or artifact.user_id != user_id or artifact.project_id != job.project_id:
        raise HTTPException(404, "Artefact introuvable")
    return job, artifact


def _check_project_quota(db: Session, user_id: str, project_id: str) -> None:
    used = db.scalar(select(func.coalesce(func.sum(EngineeringArtifact.byte_size), 0)).where(
        EngineeringArtifact.user_id == user_id,
        EngineeringArtifact.project_id == project_id,
    )) or 0
    if used >= MAX_PROJECT_BYTES:
        raise HTTPException(413, "Quota de fichiers AeroMind dépassé pour ce projet")


def _inline_worker_enabled() -> bool:
    configured = os.getenv("AEROMIND_ENGINEERING_INLINE_WORKER")
    if configured is not None:
        return configured.strip().lower() in {"1", "true", "yes", "on"}
    return os.getenv("AEROMIND_ENV", "development").strip().lower() != "production"


def _ensure_file_runtime() -> None:
    if _inline_worker_enabled():
        return
    enabled = os.getenv("AEROMIND_ENGINEERING_WORKER_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
    if not enabled or not os.getenv("AEROMIND_ENGINEERING_STORAGE_DIR", "").strip():
        raise HTTPException(503, "Import/export indisponible: worker isolé et stockage partagé non configurés")
    try:
        heartbeat = storage_root() / ".worker-heartbeat"
        if not heartbeat.is_file() or time.time() - heartbeat.stat().st_mtime > 120:
            raise HTTPException(503, "Import/export indisponible: worker isolé non joignable")
    except OSError:
        raise HTTPException(503, "Import/export indisponible: stockage partagé non accessible") from None


def _dispatch_job(background_tasks: BackgroundTasks, job_id: str) -> None:
    if _inline_worker_enabled():
        background_tasks.add_task(process_engineering_job, job_id)


@router.get("/connectors")
def list_connectors(
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _actor(aeromind_session, authorization, db)
    return connector_catalog()


@router.get("/simulations/status")
def simulation_status(
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _actor(aeromind_session, authorization, db)
    embedded_sitl = next((item for item in connector_catalog()["items"] if item["family_id"] == "embedded-sitl"), None)
    return {
        "internal": {
            "status": "available",
            "engine": "sitl_modules.propulsion_model",
            "evidence_level": "educational_model",
            "scope": "modèle de propulsion déterministe; aucune dynamique de vol ni autopilote",
            "physical_output_enabled": False,
        },
        "external_sitl": {
            "status": "configuration_required",
            "available": False,
            "runtime_detected": bool(embedded_sitl and embedded_sitl["runtime_detected"]),
            "runtime_names": embedded_sitl["runtime_names"] if embedded_sitl else [],
            "evidence_level": "not_run",
            "reason": "Aucun worker SITL externe isolé n’est configuré; la simple présence d’un binaire ne déclenche aucune commande.",
            "physical_output_enabled": False,
        },
        "physical_output_enabled": False,
    }


@router.post("/simulations/internal", status_code=201)
def run_internal_simulation(
    body: InternalSimulationRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    project = get_project(db, user_id, body.project_id)
    key = _idempotency_key(idempotency_key)
    prior = db.scalar(select(EngineeringSimulationRun).where(
        EngineeringSimulationRun.user_id == user_id,
        EngineeringSimulationRun.project_id == project.id,
        EngineeringSimulationRun.idempotency_key == key,
    ))
    if prior:
        if prior.scenario_id != body.scenario_id:
            raise HTTPException(409, "Idempotency-Key déjà utilisée pour un autre scénario")
        return {**json.loads(prior.report_json), "run_id": prior.id, "idempotent_replay": True}

    scenario = {
        "propulsion.piston-demo.v1": {"engine_type": "piston", "fuel_capacity_kg": 12.0, "battery_wh": 0.0, "setpoints": [0.2, 0.5, 0.8]},
        "propulsion.jet-demo.v1": {"engine_type": "jet", "fuel_capacity_kg": 20.0, "battery_wh": 0.0, "setpoints": [0.15, 0.4, 0.7]},
        "propulsion.hybrid-demo.v1": {"engine_type": "hybrid", "fuel_capacity_kg": 12.0, "battery_wh": 120.0, "setpoints": [0.2, 0.45, 0.7]},
    }[body.scenario_id]
    state = new_state(scenario["engine_type"], scenario["fuel_capacity_kg"], scenario["battery_wh"])
    events = []
    for index, throttle in enumerate(scenario["setpoints"], start=1):
        step(state, 1.0, throttle)
        events.append({"tick": index, "simulation_setpoint": throttle, "state": state.as_dict()})
    run_id = str(uuid4())
    report = {
        "schema_version": "aeromind.simulation-report.v1",
        "run_id": run_id,
        "project_id": project.id,
        "scenario_id": body.scenario_id,
        "mode": "internal",
        "target_kind": "simulator",
        "status": "completed",
        "engine": "sitl_modules.propulsion_model",
        "engine_version": "1.0",
        "evidence_level": "educational_model",
        "events": events,
        "limitations": ["Modèle pédagogique de propulsion; pas un modèle de dynamique de vol, un autopilote, une certification ou une validation expérimentale."],
        "physical_output_enabled": False,
        "sent_to_hardware": False,
        "created_at": datetime.now(UTC).isoformat(),
    }
    db.add(EngineeringSimulationRun(
        id=run_id, user_id=user_id, project_id=project.id,
        scenario_id=body.scenario_id, mode="internal", status="completed",
        evidence_level="educational_model", report_json=json.dumps(report, ensure_ascii=False, separators=(",", ":")),
        idempotency_key=key,
    ))
    _audit(db, user_id=user_id, project_id=project.id, event_type="engineering_internal_model_run", message="Run du modèle de propulsion pédagogique AeroMind", payload={"run_id": run_id, "scenario_id": body.scenario_id, "evidence_level": "educational_model"})
    db.commit()
    return report


@router.post("/simulations/external-sitl", status_code=409)
def external_sitl_not_configured(
    body: ExternalSITLRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    get_project(db, user_id, body.project_id)
    _idempotency_key(idempotency_key)
    raise HTTPException(status_code=409, detail={
        "code": "SITL_RUNTIME_NOT_CONFIGURED",
        "status": "not_run",
        "target_id": body.target_id,
        "message": "Aucun worker SITL externe isolé n’est configuré; aucune commande n’a été émise.",
        "physical_output_enabled": False,
    })


@router.post("/files/import-jobs", status_code=202)
async def create_import_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: str = Form(..., min_length=1, max_length=36),
    profile_id: str = Form(..., min_length=1, max_length=120),
    dialect_id: str = Form(default="utf8-comma-v1", max_length=40),
    dry_run: bool = Form(default=True),
    cell_id: str | None = Form(default=None, max_length=36),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    project = get_project(db, user_id, project_id)
    _ensure_file_runtime()
    if not dry_run:
        raise HTTPException(422, "Les imports doivent commencer en dry-run")
    if cell_id:
        cell = db.scalar(select(Drone).where(Drone.id == cell_id, Drone.project_id == project.id, Drone.user_id == user_id))
        if cell is None:
            raise HTTPException(404, "Cellule introuvable dans le projet autorisé")
    if profile_id not in {"aeromind.bom.v1", "aeromind.simulation-results.v1", "aeromind.step.p21.inspect.v1"}:
        raise HTTPException(422, "Profil d’import non pris en charge")
    suffix = Path((file.filename or "").replace("\\", "/")).suffix.lower()
    if profile_id == "aeromind.step.p21.inspect.v1":
        if suffix not in {".step", ".stp"}:
            raise HTTPException(415, "Le profil STEP accepte uniquement .step ou .stp")
        max_bytes = MAX_STEP_BYTES
    else:
        if suffix != ".csv":
            raise HTTPException(415, "Les profils CSV acceptent uniquement .csv")
        max_bytes = MAX_CSV_BYTES
    key = _idempotency_key(idempotency_key)
    existing = db.scalar(select(EngineeringJob).where(
        EngineeringJob.user_id == user_id,
        EngineeringJob.project_id == project.id,
        EngineeringJob.idempotency_key == key,
    ))
    if existing:
        if existing.job_type != "import" or existing.profile_id != profile_id:
            raise HTTPException(409, "Idempotency-Key déjà utilisée pour une autre opération")
        artifact = db.get(EngineeringArtifact, existing.artifact_id)
        if existing.status == "queued":
            _dispatch_job(background_tasks, existing.id)
        return _job_payload(existing, artifact)
    active_jobs = db.scalar(select(func.count()).select_from(EngineeringJob).where(
        EngineeringJob.user_id == user_id,
        EngineeringJob.project_id == project.id,
        EngineeringJob.status.in_(["queued", "running"]),
    )) or 0
    if active_jobs >= ACTIVE_JOB_LIMIT_PER_PROJECT:
        raise HTTPException(429, "Limite de travaux concurrents atteinte pour ce projet")
    sanitized = Path((file.filename or "import").replace("\\", "/")).name
    sanitized = "".join(char for char in sanitized if char.isprintable() and char not in "/\\")[:255] or "import"
    artifact_id, job_id = str(uuid4()), str(uuid4())
    storage_key = f"{artifact_id}.source"
    path = storage_path(storage_key)
    digest = hashlib.sha256()
    byte_count = 0
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                byte_count += len(chunk)
                if byte_count > max_bytes:
                    raise HTTPException(413, f"Taille maximale dépassée ({max_bytes} octets)")
                digest.update(chunk)
                output.write(chunk)
        if byte_count == 0:
            raise HTTPException(400, "Fichier vide")
        _check_project_quota(db, user_id, project.id)
        if byte_count + (db.scalar(select(func.coalesce(func.sum(EngineeringArtifact.byte_size), 0)).where(EngineeringArtifact.user_id == user_id, EngineeringArtifact.project_id == project.id)) or 0) > MAX_PROJECT_BYTES:
            raise HTTPException(413, "Quota de fichiers AeroMind dépassé pour ce projet")
        artifact = EngineeringArtifact(
            id=artifact_id, project_id=project.id, user_id=user_id,
            cell_id=cell_id,
            profile_id=profile_id, original_filename=sanitized,
            declared_mime_type=(file.content_type or "")[:255] or None,
            byte_size=byte_count, sha256=digest.hexdigest(), storage_key=storage_key,
            status="quarantined", scan_status="not_scanned",
        )
        job = EngineeringJob(
            id=job_id, project_id=project.id, user_id=user_id, artifact_id=artifact_id,
            job_type="import", profile_id=profile_id, status="queued", phase="quarantine",
            idempotency_key=key, input_sha256=digest.hexdigest(),
            options_json=json.dumps({"dialect_id": dialect_id, "dry_run": True, "cell_id": cell_id}, separators=(",", ":")),
            report_json="{}",
        )
        db.add(artifact)
        db.add(job)
        _audit(db, user_id=user_id, project_id=project.id, event_type="engineering_file_quarantined", message="Fichier d’ingénierie reçu en quarantaine", payload={"artifact_id": artifact_id, "job_id": job_id, "cell_id": cell_id, "profile_id": profile_id, "sha256": digest.hexdigest(), "byte_size": byte_count})
        db.commit()
        db.refresh(job)
        db.refresh(artifact)
        _dispatch_job(background_tasks, job_id)
        return _job_payload(job, artifact)
    except HTTPException:
        path.unlink(missing_ok=True)
        raise
    except Exception:
        path.unlink(missing_ok=True)
        db.rollback()
        raise
    finally:
        await file.close()


@router.get("/jobs/{job_id}")
def get_engineering_job(
    job_id: str,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    job, artifact = _owned_job(db, job_id, user_id)
    return _job_payload(job, artifact)


@router.get("/jobs/{job_id}/report")
def get_engineering_job_report(
    job_id: str,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    job, _ = _owned_job(db, job_id, user_id)
    try:
        return json.loads(job.report_json or "{}")
    except json.JSONDecodeError:
        raise HTTPException(500, "Rapport de job invalide") from None


@router.post("/jobs/{job_id}/commit")
def commit_import(
    job_id: str,
    body: CommitRequest,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    job, artifact = _owned_job(db, job_id, user_id)
    if not body.confirm:
        raise HTTPException(422, "Confirmation explicite requise")
    if job.job_type != "import" or job.status != "awaiting_review":
        raise HTTPException(409, "Ce job n’est pas prêt pour un commit")
    if body.expected_input_sha256 != job.input_sha256 or artifact.sha256 != job.input_sha256:
        raise HTTPException(409, "Le hash source ne correspond plus au rapport de dry-run")
    report = json.loads(job.report_json or "{}")
    if report.get("rejected_records", 0) and not body.acknowledge_partial:
        raise HTTPException(422, "Le rapport contient des lignes rejetées; confirmez explicitement le commit partiel")
    if job.profile_id == "aeromind.step.p21.inspect.v1" and not body.confirm_source_only:
        raise HTTPException(422, "Le commit STEP doit confirmer qu’il s’agit d’un artefact source sans géométrie extraite")
    if os.getenv("AEROMIND_ENGINEERING_REQUIRE_AV_SCAN", "false").strip().lower() in {"1", "true", "yes", "on"} and artifact.scan_status != "clean":
        raise HTTPException(423, "Le commit est bloqué: le scan antivirus obligatoire n’a pas été réalisé")
    now = datetime.now(UTC)
    artifact.status, artifact.committed_at = "committed", now
    job.status, job.phase, job.committed_at, job.updated_at = "completed", "committed", now, now
    report["status"] = "committed"
    report["committed_at"] = now.isoformat()
    report["physical_output_enabled"] = False
    job.report_json = json.dumps(report, ensure_ascii=False, separators=(",", ":"))
    _audit(db, user_id=user_id, project_id=job.project_id, event_type="engineering_import_committed", message="Artefact d’ingénierie commité après revue explicite", payload={"artifact_id": artifact.id, "job_id": job.id, "profile_id": job.profile_id, "sha256": artifact.sha256, "accepted_records": report.get("accepted_records", 0), "rejected_records": report.get("rejected_records", 0)})
    db.commit()
    db.refresh(job)
    db.refresh(artifact)
    return _job_payload(job, artifact)


@router.post("/jobs/{job_id}/cancel")
def cancel_engineering_job(
    job_id: str,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    job, artifact = _owned_job(db, job_id, user_id)
    if job.status == "queued":
        job.status, job.phase = "cancelled", "cancelled"
        job.completed_at = job.updated_at = datetime.now(UTC)
    elif job.status == "running":
        job.status, job.phase = "cancel_requested", "cancellation_requested"
        job.updated_at = datetime.now(UTC)
    else:
        raise HTTPException(409, "Le job n’est pas annulable dans son état courant")
    db.commit()
    db.refresh(job)
    return _job_payload(job, artifact)


@router.post("/files/export-jobs", status_code=202)
def create_export_job(
    body: ExportJobRequest,
    background_tasks: BackgroundTasks,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    project = get_project(db, user_id, body.project_id)
    _ensure_file_runtime()
    key = _idempotency_key(idempotency_key)
    source = db.scalar(select(EngineeringJob).where(
        EngineeringJob.id == body.source_job_id,
        EngineeringJob.project_id == project.id,
        EngineeringJob.user_id == user_id,
    ))
    if source is None or source.job_type != "import" or source.status != "completed" or not source.committed_at:
        raise HTTPException(404, "Import source commité introuvable dans le projet")
    if source.profile_id not in {"aeromind.bom.v1", "aeromind.simulation-results.v1"} or not source.normalized_storage_key:
        raise HTTPException(422, "Seuls les profils CSV normalisés sont exportables")
    existing = db.scalar(select(EngineeringJob).where(EngineeringJob.user_id == user_id, EngineeringJob.project_id == project.id, EngineeringJob.idempotency_key == key))
    if existing:
        if existing.job_type != "export" or existing.source_job_id != source.id:
            raise HTTPException(409, "Idempotency-Key déjà utilisée pour une autre opération")
        artifact = db.get(EngineeringArtifact, existing.artifact_id)
        if existing.status == "queued":
            _dispatch_job(background_tasks, existing.id)
        return _job_payload(existing, artifact)
    artifact = db.get(EngineeringArtifact, source.artifact_id)
    if artifact is None or artifact.user_id != user_id:
        raise HTTPException(404, "Artefact source introuvable")
    export_id = str(uuid4())
    job = EngineeringJob(
        id=export_id, project_id=project.id, user_id=user_id, artifact_id=artifact.id,
        source_job_id=source.id, job_type="export", profile_id=source.profile_id,
        status="queued", phase="export_queued", idempotency_key=key,
        input_sha256=source.input_sha256,
        options_json=json.dumps({"export_format": body.export_format}, separators=(",", ":")),
        report_json="{}",
    )
    db.add(job)
    _audit(db, user_id=user_id, project_id=project.id, event_type="engineering_csv_export_queued", message="Export CSV demandé", payload={"job_id": export_id, "source_job_id": source.id, "export_format": body.export_format})
    db.commit()
    db.refresh(job)
    _dispatch_job(background_tasks, export_id)
    return _job_payload(job, artifact)


@router.get("/jobs/{job_id}/download")
def download_job_output(
    job_id: str,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    job, _artifact = _owned_job(db, job_id, user_id)
    if job.job_type != "export" or job.status != "completed" or not job.output_storage_key:
        raise HTTPException(409, "Aucun fichier d’export disponible")
    path = storage_path(job.output_storage_key)
    if not path.is_file():
        raise HTTPException(404, "Fichier d’export introuvable")
    return FileResponse(path, media_type="text/csv; charset=utf-8", filename=f"aeromind-{job.profile_id}-{job.id}.csv", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@router.get("/artifacts/{artifact_id}/download")
def download_source_artifact(
    artifact_id: str,
    aeromind_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user_id = _actor(aeromind_session, authorization, db)
    artifact = db.scalar(select(EngineeringArtifact).where(EngineeringArtifact.id == artifact_id, EngineeringArtifact.user_id == user_id))
    if artifact is None or artifact.status not in {"validated", "committed"}:
        raise HTTPException(404, "Artefact validé introuvable")
    path = storage_path(artifact.storage_key)
    if not path.is_file():
        raise HTTPException(404, "Fichier source introuvable")
    return FileResponse(path, media_type="application/octet-stream", filename=artifact.original_filename, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})
