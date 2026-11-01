"""Persistent bounded worker for AeroMind file inspection and CSV export.

This worker never invokes a shell, CAD binary, MAVLink transport, or user code.
For container deployments it is intended to run as a separate, network-isolated
process; the API may also submit a bounded job as a post-response fallback.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from sqlalchemy import select, update

from .database import SessionLocal
from .engineering_files import FileValidationError, export_csv_file, inspect_csv_file, inspect_step_part21
from .models import EngineeringArtifact, EngineeringJob

logger = logging.getLogger("aeromind.engineering.worker")
WORKER_VERSION = "aeromind-engineering-worker/1.0.0"
_STORAGE_NAME = __import__("re").compile(r"^[0-9a-f-]{36}\.(?:source|normalized\.jsonl|normalized\.tmp|export\.csv|export\.tmp)$")


def storage_root() -> Path:
    project_root = Path(__file__).resolve().parent.parent
    configured = os.getenv("AEROMIND_ENGINEERING_STORAGE_DIR", "").strip()
    root = Path(configured).expanduser().resolve() if configured else (project_root / "data" / "engineering_files").resolve()
    public_root = (project_root / "frontend" / "client" / "public").resolve()
    if root == public_root or public_root in root.parents:
        raise RuntimeError("Engineering storage must remain outside the public web root")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        root.chmod(0o700)
    except OSError:
        pass
    return root


def storage_path(storage_key: str) -> Path:
    if not _STORAGE_NAME.fullmatch(storage_key):
        raise ValueError("Invalid internal storage key")
    root = storage_root()
    path = (root / storage_key).resolve()
    if path.parent != root:
        raise ValueError("Storage path escapes the configured root")
    return path


def _report_json(report: dict) -> str:
    return json.dumps(report, ensure_ascii=False, separators=(",", ":"))


def process_engineering_job(job_id: str) -> None:
    """Atomically claim and process one persistent job; safe to call repeatedly."""
    try:
        UUID(job_id)
    except (ValueError, TypeError, AttributeError):
        logger.warning("Rejected malformed engineering job id")
        return
    now = datetime.now(UTC)
    with SessionLocal() as db:
        claimed = db.execute(
            update(EngineeringJob)
            .where(EngineeringJob.id == job_id, EngineeringJob.status == "queued")
            .values(status="running", phase="processing", started_at=now, updated_at=now)
        )
        if claimed.rowcount != 1:
            db.rollback()
            return
        db.commit()
        job = db.get(EngineeringJob, job_id)
        if job is None:
            return
        artifact = db.get(EngineeringArtifact, job.artifact_id)
        if artifact is None:
            _fail_job(db, job, "ARTIFACT_MISSING", "Artefact source introuvable.")
            return
        job_type = job.job_type
        profile_id = job.profile_id
        source_key = artifact.storage_key
        source_job_id = job.source_job_id
        options = json.loads(job.options_json or "{}")
        project_id, actor_id, artifact_id, input_hash = job.project_id, job.user_id, artifact.id, job.input_sha256
        db.expunge(job)
        db.expunge(artifact)

    try:
        if job_type == "import":
            source_path = storage_path(source_key)
            if not source_path.is_file():
                raise FileValidationError("SOURCE_FILE_MISSING", "Fichier source absent du stockage de quarantaine")
            if profile_id == "aeromind.step.p21.inspect.v1":
                report = inspect_step_part21(source_path)
                normalized_key = None
            else:
                normalized_key = f"{job_id}.normalized.jsonl"
                temp_key = f"{job_id}.normalized.tmp"
                temp_path = storage_path(temp_key)
                final_path = storage_path(normalized_key)
                temp_path.unlink(missing_ok=True)
                report = inspect_csv_file(source_path, temp_path, profile_id, options.get("dialect_id", "utf8-comma-v1"))
                temp_path.replace(final_path)
            report.update({
                "schema_version": "aeromind.job-report.v1",
                "job_id": job_id,
                "project_id": project_id,
                "artifact_id": artifact_id,
                "cell_id": options.get("cell_id"),
                "input_sha256": input_hash,
                "worker_version": WORKER_VERSION,
                "tool_versions": {"parser": "aeromind-profile-parser/1.0.0"},
                "created_at": datetime.now(UTC).isoformat(),
                "physical_output_enabled": False,
                "scan_status": "not_scanned",
            })
            if os.getenv("AEROMIND_ENGINEERING_REQUIRE_AV_SCAN", "false").strip().lower() in {"1", "true", "yes", "on"}:
                report["status"] = "blocked"
                report["evidence_level"] = "not_scanned"
                report["warnings"].append({"code": "AV_SCAN_REQUIRED", "message": "La politique impose un scan antivirus, mais aucun scanner n’est intégré à ce worker."})
                final_status = "blocked"
                normalized_key = None
                if "normalized_key" in locals():
                    storage_path(f"{job_id}.normalized.jsonl").unlink(missing_ok=True)
            else:
                report["status"] = "awaiting_review"
                final_status = "awaiting_review"
            with SessionLocal() as db:
                row = db.get(EngineeringJob, job_id)
                source = db.get(EngineeringArtifact, artifact_id)
                if row is None or source is None:
                    return
                if row.status == "cancel_requested":
                    if normalized_key:
                        storage_path(normalized_key).unlink(missing_ok=True)
                    row.status, row.phase = "cancelled", "cancelled"
                    row.completed_at = datetime.now(UTC)
                    report["status"] = "cancelled"
                else:
                    row.status, row.phase = final_status, "review" if final_status == "awaiting_review" else "blocked"
                    row.normalized_storage_key = normalized_key
                    row.completed_at = datetime.now(UTC)
                    source.status = "validated" if final_status == "awaiting_review" else "blocked"
                    source.scan_status = "not_scanned"
                row.report_json = _report_json(report)
                row.updated_at = datetime.now(UTC)
                db.commit()
            return

        if job_type == "export":
            if not source_job_id:
                raise FileValidationError("EXPORT_SOURCE_MISSING", "Job source d’export manquant")
            with SessionLocal() as db:
                parent = db.get(EngineeringJob, source_job_id)
                if parent is None or parent.user_id != actor_id or parent.project_id != project_id or parent.status != "completed" or not parent.committed_at:
                    raise FileValidationError("EXPORT_SOURCE_NOT_COMMITTED", "L’import source n’est pas commité dans le projet")
                normalized_key = parent.normalized_storage_key
                source_profile = parent.profile_id
                source_hash = parent.input_sha256
            if not normalized_key:
                raise FileValidationError("EXPORT_SOURCE_NOT_TABULAR", "Aucune donnée tabulaire normalisée à exporter")
            output_key = f"{job_id}.export.csv"
            temp_key = f"{job_id}.export.tmp"
            temp_path = storage_path(temp_key)
            temp_path.unlink(missing_ok=True)
            row_count = export_csv_file(storage_path(normalized_key), temp_path, source_profile, options.get("export_format", "machine-canonical"))
            temp_path.replace(storage_path(output_key))
            report = {
                "schema_version": "aeromind.job-report.v1",
                "job_id": job_id,
                "project_id": project_id,
                "artifact_ids": [artifact_id],
                "profile_id": source_profile,
                "profile_version": "1.0.0",
                "export_format": options.get("export_format", "machine-canonical"),
                "status": "completed",
                "evidence_level": "serialized_and_validated",
                "input_sha256": source_hash,
                "output_rows": row_count,
                "worker_version": WORKER_VERSION,
                "tool_versions": {"exporter": "aeromind-csv-exporter/1.0.0"},
                "warnings": ([{"code": "SPREADSHEET_SAFE_TRANSFORMATION", "message": "Des cellules à risque ont été préfixées d’une tabulation; cet export d’affichage n’est pas un CSV canonique réimportable."}] if options.get("export_format") == "spreadsheet-safe" else []),
                "errors": [],
                "physical_output_enabled": False,
                "created_at": datetime.now(UTC).isoformat(),
            }
            with SessionLocal() as db:
                row = db.get(EngineeringJob, job_id)
                if row is None:
                    storage_path(output_key).unlink(missing_ok=True)
                    return
                if row.status == "cancel_requested":
                    storage_path(output_key).unlink(missing_ok=True)
                    row.status, row.phase = "cancelled", "cancelled"
                    report["status"] = "cancelled"
                else:
                    row.status, row.phase = "completed", "complete"
                    row.output_storage_key = output_key
                row.report_json = _report_json(report)
                row.completed_at = row.updated_at = datetime.now(UTC)
                db.commit()
            return
        raise FileValidationError("JOB_TYPE_UNSUPPORTED", "Type de job non pris en charge")
    except FileValidationError as exc:
        report = {
            "schema_version": "aeromind.job-report.v1",
            "job_id": job_id,
            "project_id": project_id,
            "artifact_ids": [artifact_id],
            "profile_id": profile_id,
            "status": "rejected",
            "evidence_level": "validation_failed",
            "input_sha256": input_hash,
            "worker_version": WORKER_VERSION,
            "warnings": [],
            "errors": [{"code": exc.code, "message": str(exc)}],
            **exc.report,
            "physical_output_enabled": False,
            "created_at": datetime.now(UTC).isoformat(),
        }
        with SessionLocal() as db:
            row = db.get(EngineeringJob, job_id)
            if row is not None:
                row.status, row.phase, row.error_code = "rejected", "validation", exc.code
                row.report_json = _report_json(report)
                row.completed_at = row.updated_at = datetime.now(UTC)
                if row.job_type == "import":
                    source = db.get(EngineeringArtifact, row.artifact_id)
                    if source:
                        source.status = "rejected"
                db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Engineering job failed; job_id=%s error_type=%s", job_id, type(exc).__name__)
        with SessionLocal() as db:
            row = db.get(EngineeringJob, job_id)
            if row is not None:
                _fail_job(db, row, "PROCESSING_FAILED", "Traitement interrompu; consulter l’administrateur système.")


def _fail_job(db, job: EngineeringJob, code: str, message: str) -> None:
    now = datetime.now(UTC)
    job.status, job.phase, job.error_code = "failed", "failed", code
    job.report_json = _report_json({
        "schema_version": "aeromind.job-report.v1", "job_id": job.id,
        "project_id": job.project_id, "artifact_ids": [job.artifact_id],
        "profile_id": job.profile_id, "status": "failed", "evidence_level": "not_validated",
        "errors": [{"code": code, "message": message}], "warnings": [],
        "physical_output_enabled": False, "created_at": now.isoformat(),
        "worker_version": WORKER_VERSION,
    })
    job.completed_at = job.updated_at = now
    db.commit()


def recover_stale_jobs(stale_after_minutes: int = 20) -> int:
    """Requeue only jobs whose worker lease has gone stale; never touches completed rows."""
    threshold = datetime.now(UTC) - timedelta(minutes=stale_after_minutes)
    with SessionLocal() as db:
        cancelled = db.execute(
            update(EngineeringJob)
            .where(EngineeringJob.status == "cancel_requested", EngineeringJob.updated_at < threshold)
            .values(status="cancelled", phase="cancelled", completed_at=datetime.now(UTC), updated_at=datetime.now(UTC))
        ).rowcount or 0
        requeued = db.execute(
            update(EngineeringJob)
            .where(EngineeringJob.status == "running", EngineeringJob.updated_at < threshold)
            .values(status="queued", phase="recovered_after_worker_restart", updated_at=datetime.now(UTC))
        ).rowcount or 0
        db.commit()
        return int(cancelled + requeued)


def run_worker(poll_seconds: float = 0.5) -> None:
    """Poll the durable queue; run as `python -m web.engineering_worker`."""
    import time

    poll_seconds = min(10.0, max(0.1, poll_seconds))
    logger.info("AeroMind engineering file worker started; version=%s", WORKER_VERSION)
    last_recovery = 0.0
    last_heartbeat = 0.0
    while True:
        monotonic_now = time.monotonic()
        if monotonic_now - last_heartbeat >= 5:
            marker = storage_root() / ".worker-heartbeat"
            marker.write_text(datetime.now(UTC).isoformat(), encoding="ascii")
            last_heartbeat = monotonic_now
        if time.monotonic() - last_recovery > 60:
            recover_stale_jobs()
            last_recovery = time.monotonic()
        with SessionLocal() as db:
            job_ids = list(db.scalars(
                select(EngineeringJob.id)
                .where(EngineeringJob.status == "queued")
                .order_by(EngineeringJob.created_at.asc())
                .limit(1)
            ))
        if job_ids:
            process_engineering_job(job_ids[0])
        else:
            time.sleep(poll_seconds)
