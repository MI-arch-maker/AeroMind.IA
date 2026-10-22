"""LABBENCH simulation-only contract used by the FastAPI tRPC compatibility layer.

This module deliberately has no hardware imports and never opens a transport or emits a
physical command.  It offers deterministic, clearly synthetic N2 simulation data plus
owner-scoped persistence for project evidence.
"""

from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEvent, LabSession, Project, Report


ENGINE_VERSION = "labbench-thermal-v1.0.0"
SYNTHETIC_QUALITY = "synthetic"
REGISTRY_KIND = "labbench_registry.v1"
RUN_KIND = "labbench_simulation_run.v1"


class LabBenchError(ValueError):
    """A stable tRPC-facing validation failure."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _number(payload: dict[str, Any], field: str, minimum: float, maximum: float) -> float:
    value = payload.get(field)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise LabBenchError(400, "INVALID_SIMULATION_INPUT", f"{field} must be a finite number")
    number = float(value)
    if not minimum <= number <= maximum:
        raise LabBenchError(400, "SIMULATION_INPUT_OUT_OF_RANGE", f"{field} must be between {minimum:g} and {maximum:g}")
    return number


def _simulation_inputs(payload: dict[str, Any]) -> dict[str, float | int]:
    if not isinstance(payload, dict):
        raise LabBenchError(400, "INVALID_SIMULATION_INPUT", "Simulation input must be an object")
    mode = payload.get("mode", "simulation")
    if mode != "simulation":
        raise LabBenchError(403, "SIMULATION_ONLY", "LABBENCH accepts simulation mode only; physical execution is unavailable")
    for physical_flag in ("physicalOutputEnabled", "deviceConnected", "physicalExecutionRequested"):
        if payload.get(physical_flag) is True:
            raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output is permanently disabled for LABBENCH")
    duration = _number(payload, "durationSeconds", 1, 3600)
    if not duration.is_integer():
        raise LabBenchError(400, "INVALID_SIMULATION_INPUT", "durationSeconds must be an integer")
    return {
        "ambientC": _number(payload, "ambientC", -10, 50),
        "heaterPowerW": _number(payload, "heaterPowerW", 0, 12),
        "dutyCycle": _number(payload, "dutyCycle", 0, 1),
        "thermalResistanceCPerW": _number(payload, "thermalResistanceCPerW", 0.1, 12),
        "durationSeconds": int(duration),
        "positionSetpointDeg": _number(payload, "positionSetpointDeg", 0, 90),
    }


def run_simulation(payload: dict[str, Any]) -> dict[str, Any]:
    """Calculate a deterministic N2 synthetic result; this is not a physical model."""
    inputs = _simulation_inputs(payload)
    predicted = round(
        inputs["ambientC"]
        + inputs["heaterPowerW"] * inputs["dutyCycle"] * inputs["thermalResistanceCPerW"],
        2,
    )
    telemetry = [
        {
            "sequence": sequence,
            "elapsedSeconds": round(inputs["durationSeconds"] * sequence / 12),
            "temperatureC": round(inputs["ambientC"] + (predicted - inputs["ambientC"]) * sequence / 12, 2),
            "positionDeg": inputs["positionSetpointDeg"],
            "quality": SYNTHETIC_QUALITY,
        }
        for sequence in range(1, 13)
    ]
    evidence = {
        "engineVersion": ENGINE_VERSION,
        "inputs": inputs,
        "formula": "T = Tamb + (P × duty) × Rθ",
        "predictedTemperatureC": predicted,
        "uncertaintyC": 0.58,
        "telemetry": telemetry,
        "evidenceLevel": "N2 — simulation synthétique",
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }
    digest = _canonical_sha256(evidence)
    limits = [
        "Synthetic calculation only; it is not a physical measurement.",
        "The model is not a calibrated digital twin or a commissioning authorization.",
    ]
    return {
        "runId": f"LB-SIM-{digest[:12].upper()}",
        **evidence,
        "verdict": "review" if predicted > 55 else "pass",
        "contentSha256": digest,
        "synthetic": True,
        "limits": limits,
        # Alias retained for callers written before the frontend's `limits` field.
        "limitations": limits,
    }


def _requirements() -> list[dict[str, Any]]:
    return [
        {
            "code": "REQ-SAF-003",
            "title": "Aucune sortie physique depuis le démonstrateur",
            "limitValue": "false",
            "unit": "physicalOutputEnabled",
            "source": "Frontière de contrôle AeroMind LABBENCH",
            "acceptanceCriteria": "Toute requête matérielle est refusée; les résultats sont explicitement synthétiques.",
            "status": "approved",
        },
        {
            "code": "REQ-SIM-001",
            "title": "Simulation thermique bornée et rejouable",
            "limitValue": "T = Tamb + (P × duty) × Rθ",
            "unit": "modèle synthétique",
            "source": f"{ENGINE_VERSION}",
            "acceptanceCriteria": "Entrées bornées, 12 échantillons synthétiques, version et empreinte SHA-256 conservées.",
            "status": "approved",
        },
        {
            "code": "REQ-VAL-002",
            "title": "Confirmation renforcée pour consigne virtuelle",
            "limitValue": "0–90",
            "unit": "degree",
            "source": "Contrat validateCommand LABBENCH",
            "acceptanceCriteria": "humanConfirmed et safetyConfirmed sont strictement true avant une autorisation virtuelle.",
            "status": "approved",
        },
    ]


def _devices() -> list[dict[str, Any]]:
    return [
        {
            "deviceCode": "LB01-EMU-001",
            "manufacturer": "AeroMind reference rig",
            "model": "LabBench 01 / émulateur",
            "hardwareRevision": "REV-A",
            "firmwareVersion": "0.4.2-sim",
            "interfacesJson": json.dumps(["virtual://labbench", "telemetry://synthetic"], ensure_ascii=False),
            "limitsJson": json.dumps({"positionSetpointDeg": {"minimum": 0, "maximum": 90, "unit": "degree"}, "physicalOutputEnabled": False}, ensure_ascii=False),
            "connectionState": "not_connected",
            "validationStatus": "simulated",
            "physical": False,
        }
    ]


def _drivers() -> list[dict[str, Any]]:
    return [
        {
            "name": "AeroMind Device Gateway — virtual contract",
            "version": "0.1.0-sim",
            "protocol": "AMDG-virtual",
            "permissions": "Simulation uniquement · aucune sortie physique",
            "validationStatus": "simulated",
            "allowlistJson": json.dumps(["read.status", "read.temperature", "read.position", "simulate.servo.setpoint"], ensure_ascii=False),
            "physicalOutputEnabled": False,
        }
    ]


def _catalog() -> list[dict[str, Any]]:
    return [
        {
            "id": "LB01-EMU-001",
            "name": "LabBench 01 virtual emulator",
            "manufacturer": {"name": "AeroMind reference rig", "verification": "unverified"},
            "category": "test-bench-emulator",
            "operationalState": "catalog_only",
            "connectionState": "not_connected",
            "validationStatus": "unverified",
            "criticality": {"level": "none"},
            "driver": {"status": "reference_only"},
            "description": "Synthetic reference record only. No physical device, firmware, or adapter is connected or verified.",
            "specifications": {
                "interfaces": [{"type": "virtual", "security": "not_connected"}],
                "standards": [
                    {"code": "ISO 12100", "status": "reference_only"},
                    {"code": "IEC 62443", "status": "reference_only"},
                ],
            },
        }
    ]


def status() -> dict[str, Any]:
    """Public static status. It makes the simulation boundary explicit."""
    return {
        "ready": True,
        "mode": "simulation",
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "project": {
            "code": "LABBENCH-01",
            "name": "AeroMind LabBench 01",
            "proofLevel": "N2 — Simulation",
            "evidenceLevel": "N2 — simulation synthétique",
        },
        "services": [
            {"id": "simulation-engine", "label": "Moteur de simulation", "detail": f"{ENGINE_VERSION} · calcul synthétique déterministe", "state": "simulated"},
            {"id": "registry", "label": "Registre de projet", "detail": "Disponible pour les propriétaires authentifiés", "state": "available"},
            {"id": "hardware-gateway", "label": "Passerelle matérielle", "detail": "Aucun adaptateur chargé; aucune sortie physique", "state": "limited"},
        ],
        "requirements": _requirements(),
        "device": {
            "deviceCode": "LB01-EMU-001",
            "manufacturer": "AeroMind reference rig",
            "model": "LabBench 01 / émulateur",
            "hardwareRevision": "REV-A",
            "firmwareVersion": "0.4.2-sim",
            "interfaces": ["virtual://labbench", "telemetry://synthetic"],
            "limits": ["consigne virtuelle 0–90 degree", "physicalOutputEnabled=false"],
            "connectionState": "not_connected",
        },
        "driver": {
            "name": "AeroMind Device Gateway — virtual contract",
            "version": "0.1.0-sim",
            "protocol": "AMDG-virtual",
            "permissions": "Simulation uniquement · aucune sortie physique",
            "validation": "simulated",
            "allowedCommands": ["read.status", "read.temperature", "read.position", "simulate.servo.setpoint"],
        },
        "catalog": _catalog(),
    }


def _require_project_owner(db: Session, user: dict[str, Any] | None, project_id: str) -> Project:
    if not user:
        raise LabBenchError(401, "UNAUTHORIZED", "OIDC authentication required")
    project_id = str(project_id or "").strip()
    if not project_id:
        raise LabBenchError(400, "BAD_REQUEST", "A project id is required")
    project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user["id"]))
    if project is None:
        # Do not permit a caller to read or append evidence to another owner's project.
        existing = db.get(Project, project_id)
        if existing is not None:
            raise LabBenchError(403, "FORBIDDEN", "Only the project owner can access LABBENCH evidence")
        raise LabBenchError(404, "NOT_FOUND", "Project not found")
    return project


def _official_write_allowed(user: dict[str, Any]) -> None:
    if user.get("role") in {"visitor", "demo"}:
        raise LabBenchError(403, "FORBIDDEN", "This account level cannot create official LABBENCH evidence")


def _decode_session(row: LabSession) -> dict[str, Any] | None:
    try:
        value = json.loads(row.data_json or "{}")
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _registry_row(db: Session, project_id: str, user_id: str) -> tuple[LabSession | None, dict[str, Any] | None]:
    rows = db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project_id, LabSession.user_id == user_id)
        .order_by(LabSession.created_at.asc())
    ).all()
    for row in rows:
        data = _decode_session(row)
        if data and data.get("kind") == REGISTRY_KIND:
            return row, data
    return None, None


def _new_registry(project: Project, user: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    return {
        "kind": REGISTRY_KIND,
        "schemaVersion": 1,
        "projectId": project.id,
        "ownerId": user["id"],
        "requirements": _requirements(),
        "devices": _devices(),
        "drivers": _drivers(),
        "createdAt": now,
        "updatedAt": now,
        "physicalOutputEnabled": False,
    }


def _ensure_registry(db: Session, project: Project, user: dict[str, Any]) -> tuple[LabSession, dict[str, Any], bool]:
    row, data = _registry_row(db, project.id, user["id"])
    if row is not None and data is not None:
        return row, data, False
    data = _new_registry(project, user)
    row = LabSession(id=str(uuid4()), user_id=user["id"], project_id=project.id, data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    db.add(row)
    return row, data, True


def seed_registry(db: Session, user: dict[str, Any] | None, project_id: str) -> dict[str, Any]:
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    row, registry, seeded = _ensure_registry(db, project, user)
    if seeded:
        db.commit()
        db.refresh(row)
    return {
        "seeded": seeded,
        "reason": "Registre LABBENCH initialisé pour ce projet." if seeded else "Registre LABBENCH déjà présent pour ce projet.",
        "registryId": row.id,
        "projectId": project.id,
        "updatedAt": registry["updatedAt"],
        "physicalOutputEnabled": False,
    }


def registry(db: Session, user: dict[str, Any] | None, project_id: str) -> dict[str, Any]:
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    registry_row, data = _registry_row(db, project.id, user["id"])
    data = data or {}
    runs: list[dict[str, Any]] = []
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project.id, LabSession.user_id == user["id"])
        .order_by(LabSession.created_at.desc())
    ):
        item = _decode_session(row)
        if item and item.get("kind") == RUN_KIND and isinstance(item.get("run"), dict):
            runs.append({"id": row.id, "createdAt": row.created_at.astimezone(UTC).isoformat() if row.created_at.tzinfo else row.created_at.replace(tzinfo=UTC).isoformat(), **item["run"]})
    return {
        "projectId": project.id,
        "registryId": registry_row.id if registry_row is not None else None,
        "requirements": data.get("requirements", []),
        "devices": data.get("devices", []),
        "drivers": data.get("drivers", []),
        "runs": runs,
        "updatedAt": data.get("updatedAt"),
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def persist_simulation(db: Session, user: dict[str, Any] | None, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    run = run_simulation(payload)
    # This marker is persisted with the immutable session record.  A browser-local
    # preview cannot manufacture it because create_report reads this stored record.
    run["source"] = "server-archived"
    run["persisted"] = True
    registry_row, registry_data, seeded = _ensure_registry(db, project, user)
    now = datetime.now(UTC)
    registry_data["updatedAt"] = now.isoformat()
    registry_row.data_json = json.dumps(registry_data, ensure_ascii=False, separators=(",", ":"))
    audit_id = str(uuid4())
    audit_payload = {
        "scope": "local-simulation-only",
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "runId": run["runId"],
        "contentSha256": run["contentSha256"],
        "engineVersion": run["engineVersion"],
        "synthetic": True,
    }
    record = LabSession(
        id=str(uuid4()),
        user_id=user["id"],
        project_id=project.id,
        data_json=json.dumps({"kind": RUN_KIND, "run": run, "auditEventId": audit_id}, ensure_ascii=False, separators=(",", ":")),
    )
    db.add(record)
    db.add(
        AuditEvent(
            id=audit_id,
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="validation.action",
            message=f"Run LABBENCH synthétique {run['runId']} archivé",
            payload_json=json.dumps(audit_payload, ensure_ascii=False, separators=(",", ":")),
            occurred_at=now,
        )
    )
    db.commit()
    return {
        **run,
        "id": record.id,
        "projectId": project.id,
        "registryInitialized": seeded,
        "auditEventId": audit_id,
        "archivedAt": now.isoformat(),
    }


def _archived_report_markdown(run: dict[str, Any]) -> str:
    """Render the archived, server-side simulation evidence deterministically."""
    inputs = run.get("inputs")
    limits = run.get("limits")
    formula = run.get("formula")
    engine_version = run.get("engineVersion")
    if (
        not isinstance(inputs, dict)
        or not isinstance(limits, list)
        or not all(isinstance(limit, str) for limit in limits)
        or not isinstance(formula, str)
        or not isinstance(engine_version, str)
    ):
        raise LabBenchError(404, "NOT_FOUND", "Archived server run not found")

    input_lines = "\n".join(
        f"| {key} | {json.dumps(inputs[key], ensure_ascii=False, allow_nan=False)} |"
        for key in sorted(inputs)
    )
    limit_lines = "\n".join(f"- {limit}" for limit in limits)
    return "\n".join(
        [
            "# Rapport LABBENCH archivé",
            "",
            f"- **Run ID :** `{run['runId']}`",
            "- **Source :** `server-archived`",
            f"- **Version moteur :** `{engine_version}`",
            "",
            "## Entrées archivées",
            "",
            "| Paramètre | Valeur |",
            "| --- | --- |",
            input_lines,
            "",
            "## Formule",
            "",
            formula,
            "",
            "## Limites",
            "",
            limit_lines,
            "",
        ]
    )


def create_report(db: Session, user: dict[str, Any] | None, project_id: str, run_id: str) -> dict[str, Any]:
    """Archive a report from one already server-persisted LabBench simulation run."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    run_id = str(run_id or "").strip()
    if not run_id:
        raise LabBenchError(400, "BAD_REQUEST", "A run id is required")

    archived_run: dict[str, Any] | None = None
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project.id, LabSession.user_id == user["id"])
        .order_by(LabSession.created_at.desc())
    ):
        item = _decode_session(row)
        candidate = item.get("run") if item and item.get("kind") == RUN_KIND else None
        if (
            isinstance(candidate, dict)
            and candidate.get("runId") == run_id
            and candidate.get("source") == "server-archived"
            and candidate.get("persisted") is True
        ):
            archived_run = candidate
            break
    if archived_run is None:
        # A missing run, browser-local run, and an unarchived session intentionally
        # share this response so only server-archived evidence can become a report.
        raise LabBenchError(404, "NOT_FOUND", "Archived server run not found")

    content = _archived_report_markdown(archived_run)
    content_sha256 = _canonical_sha256({"content": content})
    report_id, audit_id = str(uuid4()), str(uuid4())
    now = datetime.now(UTC)
    report_payload = {
        "kind": "labbench_archived_report.v1",
        "projectId": project.id,
        "runId": run_id,
        "content": content,
        "contentSha256": content_sha256,
        "source": "server-archived",
        "status": "archived",
    }
    audit_payload = {
        "scope": "server-archived",
        "source": "server-archived",
        "reportId": report_id,
        "runId": run_id,
        "contentSha256": content_sha256,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }
    db.add(
        Report(
            id=report_id,
            user_id=user["id"],
            project_id=project.id,
            data_json=json.dumps(report_payload, ensure_ascii=False, separators=(",", ":")),
        )
    )
    db.add(
        AuditEvent(
            id=audit_id,
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="validation.action",
            message=f"Rapport LABBENCH archivé pour le run {run_id}",
            payload_json=json.dumps(audit_payload, ensure_ascii=False, separators=(",", ":")),
            occurred_at=now,
        )
    )
    try:
        # Both evidence records are committed together; no schema migration is needed.
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "id": report_id,
        "projectId": project.id,
        "runId": run_id,
        "contentSha256": content_sha256,
        "source": "server-archived",
        "status": "archived",
    }


def validate_command(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate one virtual command and emit a non-physical receipt only.

    A receipt is returned for confirmation failures so the UI can show why the command
    stayed locked. Malformed/range/physical requests use a tRPC error instead.
    """
    if not isinstance(payload, dict):
        raise LabBenchError(400, "INVALID_COMMAND", "Command input must be an object")
    command = payload.get("command", "simulate.servo.setpoint")
    if command != "simulate.servo.setpoint":
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Only simulate.servo.setpoint is available, and only virtually")
    if payload.get("physicalOutputEnabled") is True or payload.get("deviceConnected") is True or payload.get("physicalExecutionRequested") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical command requests are refused; no hardware adapter is available")
    mode = payload.get("mode", "simulation")
    if mode not in {"simulation", "authorized"}:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "The command can be evaluated only in the virtual simulation boundary")
    position = _number(payload, "positionSetpointDeg", 0, 90)
    human_confirmed = payload.get("humanConfirmed") is True
    safety_confirmed = payload.get("safetyConfirmed") is True
    common = {
        "eventType": "labbench.command.virtual_validation",
        "command": command,
        "mode": "simulation",
        "positionSetpointDeg": position,
        "positionDeg": position,
        "humanConfirmed": human_confirmed,
        "safetyConfirmed": safety_confirmed,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "sentToHardware": False,
        "synthetic": True,
        "virtualPreview": True,
    }
    if not (human_confirmed and safety_confirmed):
        missing = []
        if not human_confirmed:
            missing.append("humanConfirmed=true")
        if not safety_confirmed:
            missing.append("safetyConfirmed=true")
        reason = "Commande virtuelle maintenue verrouillée : confirmation renforcée requise (" + ", ".join(missing) + ")."
        receipt = {**common, "allowed": False, "executed": False, "authorized": False, "status": "blocked", "reason": reason}
        return {**receipt, "receiptSha256": _canonical_sha256(receipt)}
    reason = "Validation uniquement : elle ne commande ni modèle serveur ni matériel; l’aperçu virtuel reste local au client."
    receipt = {**common, "allowed": True, "executed": False, "authorized": True, "status": "validated_preview_only", "reason": reason}
    return {**receipt, "receiptSha256": _canonical_sha256(receipt)}
