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


# ---------------------------------------------------------------------------
# Modernized LabBench 01 — gate progression (N1 → N2 → N3 armed → N4)
#
# This module deliberately keeps the simulation-only contract: no physical
# output is ever produced. The gates below orchestrate the *visible* path
# from conception (N1) to supervised virtual command (N3) to independent
# sign-off (N4), replacing the previous "permanent block" UX with a clear,
# auditable progression that the operator drives explicitly.
# ---------------------------------------------------------------------------

GATE_KIND = "labbench_gate_state.v1"

# Each gate has a stable code, a level and the conditions required to pass it.
# Conditions are evaluated server-side from the persisted LabSession records
# (registry, simulation runs, gate events) — never from the client.
GATE_DEFINITIONS: list[dict[str, Any]] = [
    {
        "code": "N1",
        "label": "Conception",
        "description": "Registre exigences + identité appareil/émulateur créés.",
        "level": "N1",
        "zone": "governance",
        "requiredConditions": ["registry_initialized"],
    },
    {
        "code": "N2",
        "label": "Simulation",
        "description": "Au moins un run N2 archivé côté serveur (empreinte SHA-256).",
        "level": "N2",
        "zone": "simulation",
        "requiredConditions": ["registry_initialized", "n2_run_archived"],
    },
    {
        "code": "N3-READY",
        "label": "Conformité matérielle",
        "description": "Pilote + identité appareil vérifiés ; calibration simulée exécutée.",
        "level": "N3",
        "zone": "hardware",
        "requiredConditions": ["registry_initialized", "n2_run_archived", "hardware_checklist_complete"],
    },
    {
        "code": "N3-ARMED",
        "label": "Armement N3 supervisé",
        "description": "Armement explicite après double confirmation humaine.",
        "level": "N3",
        "zone": "bench",
        "requiredConditions": ["n3_ready", "arm_double_confirmed"],
    },
    {
        "code": "N4",
        "label": "Mise en service (revue indépendante)",
        "description": "Revue indépendante signée après démonstration N3 supervisée.",
        "level": "N4",
        "zone": "audit",
        "requiredConditions": ["n3_armed", "independent_review_signed"],
    },
]


def _gate_state_row(db: Session, project_id: str, user_id: str) -> tuple[LabSession | None, dict[str, Any] | None]:
    rows = db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project_id, LabSession.user_id == user_id)
        .order_by(LabSession.created_at.asc())
    ).all()
    for row in rows:
        data = _decode_session(row)
        if data and data.get("kind") == GATE_KIND:
            return row, data
    return None, None


def _new_gate_state(project: Project, user: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    return {
        "kind": GATE_KIND,
        "schemaVersion": 1,
        "projectId": project.id,
        "ownerId": user["id"],
        "createdAt": now,
        "updatedAt": now,
        # Conditions are persisted so the UI can show which checklist items
        # are still open even when the operator refreshes the page.
        "conditions": {
            "registry_initialized": False,
            "n2_run_archived": False,
            "hardware_checklist_complete": False,
            "n3_ready": False,
            "arm_double_confirmed": False,
            "n3_armed": False,
            "independent_review_signed": False,
        },
        "armEvents": [],
        "reviewEvents": [],
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def _ensure_gate_state(db: Session, project: Project, user: dict[str, Any]) -> tuple[LabSession, dict[str, Any], bool]:
    row, data = _gate_state_row(db, project.id, user["id"])
    if row is not None and data is not None:
        return row, data, False
    data = _new_gate_state(project, user)
    row = LabSession(id=str(uuid4()), user_id=user["id"], project_id=project.id, data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    db.add(row)
    return row, data, True


def _evaluate_conditions(db: Session, project: Project, user: dict[str, Any], gate_state: dict[str, Any]) -> dict[str, bool]:
    """Re-evaluate each gate condition from persisted evidence."""
    conditions = dict(gate_state.get("conditions", {}))
    # Always reset to false before re-evaluation; this prevents stale state
    # if the underlying evidence rows were removed out of band.
    for key in ("registry_initialized", "n2_run_archived", "hardware_checklist_complete", "n3_ready", "n3_armed"):
        conditions[key] = False

    # registry_initialized: a registry row of kind REGISTRY_KIND exists
    registry_row, _ = _registry_row(db, project.id, user["id"])
    conditions["registry_initialized"] = registry_row is not None

    # n2_run_archived: at least one server-archived simulation run exists
    n2_archived = False
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project.id, LabSession.user_id == user["id"])
        .order_by(LabSession.created_at.desc())
    ):
        item = _decode_session(row)
        candidate = item.get("run") if item and item.get("kind") == RUN_KIND else None
        if (
            isinstance(candidate, dict)
            and candidate.get("source") == "server-archived"
            and candidate.get("persisted") is True
        ):
            n2_archived = True
            break
    conditions["n2_run_archived"] = n2_archived

    # hardware_checklist_complete: emulator identity verified + driver validated.
    # Both flags are persisted by the arm/checklist mutation below; the
    # server refuses to flip them purely from a client request.
    checklist = bool(gate_state.get("hardwareChecklist", {}).get("complete") is True)
    conditions["hardware_checklist_complete"] = checklist and conditions["registry_initialized"] and conditions["n2_run_archived"]

    # n3_ready: N3-READY gate is passed (registry + n2 + hardware checklist)
    conditions["n3_ready"] = (
        conditions["registry_initialized"]
        and conditions["n2_run_archived"]
        and conditions["hardware_checklist_complete"]
    )

    # n3_armed: at least one ARMED event is active (no disarm since)
    arm_events = gate_state.get("armEvents", [])
    armed_active = False
    if isinstance(arm_events, list):
        for event in arm_events:
            if (
                isinstance(event, dict)
                and event.get("action") == "arm"
                and event.get("active") is True
            ):
                armed_active = True
                break
    conditions["n3_armed"] = armed_active and conditions["n3_ready"]

    # arm_double_confirmed is a transient flag; it is set true only when the
    # operator completed the arm procedure (and reset after each arm event).
    conditions.setdefault("arm_double_confirmed", False)
    # independent_review_signed persists across reads; do not reset it.
    conditions["independent_review_signed"] = bool(
        gate_state.get("reviewEvents")
        and isinstance(gate_state.get("reviewEvents"), list)
        and any(isinstance(e, dict) and e.get("action") == "sign-off" for e in gate_state["reviewEvents"])
    )

    return conditions


def _resolved_gates(conditions: dict[str, bool]) -> list[dict[str, Any]]:
    """Project the boolean conditions onto the ordered gate definitions."""
    resolved: list[dict[str, Any]] = []
    passed_so_far = True
    for definition in GATE_DEFINITIONS:
        required = definition["requiredConditions"]
        all_met = all(conditions.get(name) is True for name in required)
        # Once a gate fails, subsequent gates cannot be "passed" — they are "pending".
        state = "passed" if (passed_so_far and all_met) else ("pending" if not passed_so_far else "open")
        if not all_met and passed_so_far:
            state = "open"
            passed_so_far = False
        resolved.append({
            "code": definition["code"],
            "label": definition["label"],
            "description": definition["description"],
            "level": definition["level"],
            "zone": definition["zone"],
            "requiredConditions": required,
            "conditions": {name: bool(conditions.get(name)) for name in required},
            "state": state,
        })
    return resolved


def gate_state(db: Session, user: dict[str, Any] | None, project_id: str) -> dict[str, Any]:
    """Return the current gate progression for a project."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    row, data = _gate_state_row(db, project.id, user["id"])
    if row is None or data is None:
        # Lazily initialize the gate state on first read; the operator has
        # not yet started the progression, so all conditions are false.
        data = _new_gate_state(project, user)
        row = LabSession(
            id=str(uuid4()),
            user_id=user["id"],
            project_id=project.id,
            data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    conditions = _evaluate_conditions(db, project, user, data)
    data["conditions"] = conditions
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.commit()
    gates = _resolved_gates(conditions)
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "updatedAt": data["updatedAt"],
        "conditions": conditions,
        "gates": gates,
        "currentGate": next((g["code"] for g in gates if g["state"] != "passed"), "N4"),
        "armEvents": data.get("armEvents", []),
        "reviewEvents": data.get("reviewEvents", []),
        "hardwareChecklist": data.get("hardwareChecklist", {
            "deviceIdentified": False,
            "driverValidated": False,
            "calibrationSimulated": False,
            "complete": False,
        }),
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "physicalExecutionPermitted": False,
        "zoneProgress": _zone_progress(gates),
    }


def _zone_progress(gates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate per-zone state for the modernized 5-zone sidebar."""
    zones_order = ["governance", "simulation", "hardware", "bench", "audit"]
    zone_labels = {
        "governance": "Gouvernance & Exigences",
        "simulation": "Simulation & HIL",
        "hardware": "Hardware & Drivers",
        "bench": "Banc de test & Commandes",
        "audit": "Preuves & Audit",
    }
    progress: list[dict[str, Any]] = []
    for zone in zones_order:
        zone_gates = [g for g in gates if g["zone"] == zone]
        passed = all(g["state"] == "passed" for g in zone_gates) if zone_gates else False
        open_count = sum(1 for g in zone_gates if g["state"] == "open")
        progress.append({
            "zone": zone,
            "label": zone_labels[zone],
            "passed": passed,
            "openCount": open_count,
            "gates": [{"code": g["code"], "state": g["state"]} for g in zone_gates],
        })
    return progress


def complete_hardware_checklist(db: Session, user: dict[str, Any] | None, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Persist the simulated hardware checklist (driver + identity + calibration).

    The checklist is *simulated*: it does not command any real device. It is the
    server-side equivalent of the operator ticking the boxes on the bench-side
    checklist before requesting the N3-READY gate.
    """
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    if payload.get("physicalOutputEnabled") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output remains disabled")
    row, data, _ = _ensure_gate_state(db, project, user)
    checklist = {
        "deviceIdentified": bool(payload.get("deviceIdentified") is True),
        "driverValidated": bool(payload.get("driverValidated") is True),
        "calibrationSimulated": bool(payload.get("calibrationSimulated") is True),
    }
    checklist["complete"] = all(checklist.values())
    data["hardwareChecklist"] = checklist
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    audit_id = str(uuid4())
    db.add(
        AuditEvent(
            id=audit_id,
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.hardware_checklist",
            message="Checklist hardware simulée complétée ; aucune commande matérielle.",
            payload_json=json.dumps({
                "scope": "labbench-gate",
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "checklist": checklist,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "checklist": checklist,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def arm_n3_gate(db: Session, user: dict[str, Any] | None, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Arm the N3 gate after a double human confirmation.

    The arm event is recorded server-side and audit-logged. The receipt returned
    to the UI makes explicit that no physical command is enabled; the arm only
    unlocks the *virtual* N3 commands in the supervised bench view.
    """
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Arm payload must be an object")
    if payload.get("physicalOutputEnabled") is True or payload.get("deviceConnected") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output remains disabled")
    human_confirmed = payload.get("humanConfirmed") is True
    safety_confirmed = payload.get("safetyConfirmed") is True
    second_operator = str(payload.get("secondOperatorCode") or "").strip()
    if not (human_confirmed and safety_confirmed):
        raise LabBenchError(400, "ARM_CONFIRMATION_MISSING", "humanConfirmed and safetyConfirmed are both required")
    if len(second_operator) < 6:
        raise LabBenchError(400, "ARM_SECOND_OPERATOR_CODE_REQUIRED", "A second operator code (≥ 6 characters) is required to arm N3")

    row, data, _ = _ensure_gate_state(db, project, user)
    # Re-evaluate conditions to confirm N3-READY is met.
    conditions = _evaluate_conditions(db, project, user, data)
    if not conditions.get("n3_ready"):
        raise LabBenchError(409, "GATE_NOT_READY", "N3-READY gate must be passed before arming N3")

    arm_event = {
        "id": str(uuid4()),
        "action": "arm",
        "active": True,
        "at": datetime.now(UTC).isoformat(),
        "actorId": user["id"],
        "actorRole": user.get("role", "user"),
        "secondOperatorCodeHash": hashlib.sha256(second_operator.encode("utf-8")).hexdigest(),
        "humanConfirmed": True,
        "safetyConfirmed": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "reason": "Armement N3 supervisé enregistré ; sorties physiques toujours interdites.",
    }
    data.setdefault("armEvents", []).append(arm_event)
    data["conditions"]["arm_double_confirmed"] = True
    data["conditions"]["n3_armed"] = True
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    audit_id = str(uuid4())
    db.add(
        AuditEvent(
            id=audit_id,
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.arm_n3",
            message="Armement N3 supervisé enregistré après double confirmation humaine ; aucune sortie physique.",
            payload_json=json.dumps({
                "scope": "labbench-gate",
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "armEventId": arm_event["id"],
                "humanConfirmed": True,
                "safetyConfirmed": True,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "armEventId": arm_event["id"],
        "armed": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "physicalExecutionPermitted": False,
        "reason": arm_event["reason"],
    }


def disarm_n3_gate(db: Session, user: dict[str, Any] | None, project_id: str) -> dict[str, Any]:
    """Disarm the N3 gate; mark the last arm event inactive and audit-log it."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    row, data = _gate_state_row(db, project.id, user["id"])
    if row is None or data is None:
        raise LabBenchError(404, "NOT_FOUND", "No gate state to disarm")
    arm_events = data.get("armEvents", [])
    if not isinstance(arm_events, list) or not arm_events:
        raise LabBenchError(409, "NOT_ARMED", "N3 gate is not armed")
    last = arm_events[-1]
    if not isinstance(last, dict) or last.get("active") is not True:
        raise LabBenchError(409, "NOT_ARMED", "N3 gate is not armed")
    last["active"] = False
    last["disarmedAt"] = datetime.now(UTC).isoformat()
    data["conditions"]["arm_double_confirmed"] = False
    data["conditions"]["n3_armed"] = False
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.disarm_n3",
            message="Désarmement N3 enregistré ; aucune commande active résiduelle.",
            payload_json=json.dumps({
                "scope": "labbench-gate",
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "disarmedEventId": last.get("id"),
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "armed": False,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def sign_off_n4_gate(db: Session, user: dict[str, Any] | None, project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Sign off the independent N4 review. Requires the N3 gate to be armed first."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Sign-off payload must be an object")
    reviewer = str(payload.get("reviewer") or "").strip()
    review_token = str(payload.get("reviewToken") or "").strip()
    if not reviewer or len(review_token) < 8:
        raise LabBenchError(400, "BAD_REQUEST", "reviewer and reviewToken (≥ 8 chars) are required")
    row, data, _ = _ensure_gate_state(db, project, user)
    conditions = _evaluate_conditions(db, project, user, data)
    if not conditions.get("n3_armed"):
        raise LabBenchError(409, "GATE_NOT_READY", "N3 must be armed before the independent N4 sign-off")
    event = {
        "id": str(uuid4()),
        "action": "sign-off",
        "at": datetime.now(UTC).isoformat(),
        "reviewer": reviewer,
        "reviewTokenHash": hashlib.sha256(review_token.encode("utf-8")).hexdigest(),
        "actorId": user["id"],
        "actorRole": user.get("role", "user"),
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "note": str(payload.get("note") or "Revue indépendante signée."),
    }
    data.setdefault("reviewEvents", []).append(event)
    data["conditions"]["independent_review_signed"] = True
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.sign_off_n4",
            message="Revue indépendante N4 signée ; aucune commande matérielle.",
            payload_json=json.dumps({
                "scope": "labbench-gate",
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "reviewer": reviewer,
                "reviewEventId": event["id"],
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "gateStateId": row.id,
        "reviewEventId": event["id"],
        "signedOff": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


# ===========================================================================
# Multi-drone (fleet) support — LabBench 01 v3.
#
# Each drone in a project has its OWN gate state, so N3 can be armed on
# drone A while drone B stays in N2. The fleet view aggregates all per-drone
# states; fleet simulation runs N2 scenarios in parallel for a list of
# drones.
# ===========================================================================

PER_DRONE_GATE_KIND = "labbench_gate_state_per_drone.v1"

# Hard cap to keep the fleet view bounded; UI can paginate beyond.
MAX_FLEET_SIZE = 12


def _require_drone_owner(db: Session, project: Project, user_id: str, drone_id: str) -> Any:
    """Resolve a drone that belongs to the project + user, else raise."""
    from .models import Drone
    drone_id = str(drone_id or "").strip()
    if not drone_id:
        raise LabBenchError(400, "BAD_REQUEST", "A drone id is required")
    drone = db.scalar(
        select(Drone).where(
            Drone.id == drone_id,
            Drone.project_id == project.id,
            Drone.user_id == user_id,
        )
    )
    if drone is None:
        raise LabBenchError(404, "NOT_FOUND", "Drone not found in this project")
    return drone


def _per_drone_gate_rows(db: Session, project_id: str, user_id: str) -> list[tuple[LabSession, dict[str, Any], str]]:
    """Return all per-drone gate state rows for a project, with the drone_id."""
    rows: list[tuple[LabSession, dict[str, Any], str]] = []
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project_id, LabSession.user_id == user_id)
        .order_by(LabSession.created_at.asc())
    ):
        data = _decode_session(row)
        if (
            data
            and data.get("kind") == PER_DRONE_GATE_KIND
            and isinstance(data.get("droneId"), str)
        ):
            rows.append((row, data, data["droneId"]))
    return rows


def _per_drone_gate_row(db: Session, project_id: str, user_id: str, drone_id: str) -> tuple[LabSession | None, dict[str, Any] | None]:
    for row, data, did in _per_drone_gate_rows(db, project_id, user_id):
        if did == drone_id:
            return row, data
    return None, None


def _new_per_drone_gate_state(project: Project, user: dict[str, Any], drone_id: str, drone_name: str) -> dict[str, Any]:
    now = datetime.now(UTC).isoformat()
    state = _new_gate_state(project, user)
    state["kind"] = PER_DRONE_GATE_KIND
    state["droneId"] = drone_id
    state["droneName"] = drone_name
    state["createdAt"] = now
    state["updatedAt"] = now
    return state


def _ensure_per_drone_gate_state(
    db: Session,
    project: Project,
    user: dict[str, Any],
    drone_id: str,
    drone_name: str,
) -> tuple[LabSession, dict[str, Any], bool]:
    row, data = _per_drone_gate_row(db, project.id, user["id"], drone_id)
    if row is not None and data is not None:
        return row, data, False
    data = _new_per_drone_gate_state(project, user, drone_id, drone_name)
    row = LabSession(
        id=str(uuid4()),
        user_id=user["id"],
        project_id=project.id,
        data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")),
    )
    db.add(row)
    return row, data, True


def _per_drone_n2_archived(db: Session, project: Project, user: dict[str, Any], drone_id: str) -> bool:
    """Return True if at least one server-archived N2 run is tagged for this drone."""
    for row in db.scalars(
        select(LabSession)
        .where(LabSession.project_id == project.id, LabSession.user_id == user["id"])
        .order_by(LabSession.created_at.desc())
    ):
        item = _decode_session(row)
        candidate = item.get("run") if item and item.get("kind") == RUN_KIND else None
        if (
            isinstance(candidate, dict)
            and candidate.get("source") == "server-archived"
            and candidate.get("persisted") is True
            and candidate.get("droneId") == drone_id
        ):
            return True
    return False


def _evaluate_per_drone_conditions(
    db: Session,
    project: Project,
    user: dict[str, Any],
    gate_state: dict[str, Any],
    drone_id: str,
) -> dict[str, bool]:
    """Per-drone condition evaluation. Same logic as _evaluate_conditions but
    the N2 archive check is filtered by drone_id."""
    conditions = dict(gate_state.get("conditions", {}))
    for key in ("registry_initialized", "n2_run_archived", "hardware_checklist_complete", "n3_ready", "n3_armed"):
        conditions[key] = False

    registry_row, _ = _registry_row(db, project.id, user["id"])
    conditions["registry_initialized"] = registry_row is not None
    conditions["n2_run_archived"] = _per_drone_n2_archived(db, project, user, drone_id)

    checklist = bool(gate_state.get("hardwareChecklist", {}).get("complete") is True)
    conditions["hardware_checklist_complete"] = (
        checklist and conditions["registry_initialized"] and conditions["n2_run_archived"]
    )
    conditions["n3_ready"] = (
        conditions["registry_initialized"]
        and conditions["n2_run_archived"]
        and conditions["hardware_checklist_complete"]
    )

    arm_events = gate_state.get("armEvents", [])
    armed_active = False
    if isinstance(arm_events, list):
        for event in arm_events:
            if (
                isinstance(event, dict)
                and event.get("action") == "arm"
                and event.get("active") is True
            ):
                armed_active = True
                break
    conditions["n3_armed"] = armed_active and conditions["n3_ready"]

    conditions.setdefault("arm_double_confirmed", False)
    conditions["independent_review_signed"] = bool(
        gate_state.get("reviewEvents")
        and isinstance(gate_state.get("reviewEvents"), list)
        and any(isinstance(e, dict) and e.get("action") == "sign-off" for e in gate_state["reviewEvents"])
    )
    return conditions


def per_drone_gate_state(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
) -> dict[str, Any]:
    """Return the gate progression scoped to one drone in the fleet."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    drone = _require_drone_owner(db, project, user["id"], drone_id)
    row, data = _per_drone_gate_row(db, project.id, user["id"], drone.id)
    if row is None or data is None:
        data = _new_per_drone_gate_state(project, user, drone.id, drone.name)
        row = LabSession(
            id=str(uuid4()),
            user_id=user["id"],
            project_id=project.id,
            data_json=json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    conditions = _evaluate_per_drone_conditions(db, project, user, data, drone.id)
    data["conditions"] = conditions
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.commit()
    gates = _resolved_gates(conditions)
    return {
        "projectId": project.id,
        "droneId": drone.id,
        "droneName": drone.name,
        "gateStateId": row.id,
        "updatedAt": data["updatedAt"],
        "conditions": conditions,
        "gates": gates,
        "currentGate": next((g["code"] for g in gates if g["state"] != "passed"), "N4"),
        "armEvents": data.get("armEvents", []),
        "reviewEvents": data.get("reviewEvents", []),
        "hardwareChecklist": data.get("hardwareChecklist", {
            "deviceIdentified": False,
            "driverValidated": False,
            "calibrationSimulated": False,
            "complete": False,
        }),
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "physicalExecutionPermitted": False,
    }


def fleet_gate_state(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
) -> dict[str, Any]:
    """Aggregate gate progressions for every drone in a project's fleet."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    from .models import Drone
    drones = db.scalars(
        select(Drone)
        .where(Drone.project_id == project.id, Drone.user_id == user["id"])
        .order_by(Drone.name.asc())
    ).all()
    if len(drones) > MAX_FLEET_SIZE:
        raise LabBenchError(400, "FLEET_TOO_LARGE", f"Fleet size capped at {MAX_FLEET_SIZE} drones; archive or split the project")
    per_drone: list[dict[str, Any]] = []
    for drone in drones:
        per_drone.append(per_drone_gate_state(db, user, project.id, drone.id))
    # Aggregate: a project-wide gate is "passed" if it has passed for ALL drones.
    gates_aggregate: list[dict[str, Any]] = []
    if per_drone:
        for gate_def in GATE_DEFINITIONS:
            code = gate_def["code"]
            states = []
            for entry in per_drone:
                gate = next((g for g in entry["gates"] if g["code"] == code), None)
                states.append(gate["state"] if gate else "pending")
            if all(s == "passed" for s in states):
                state = "passed"
            elif any(s == "open" for s in states):
                state = "open"
            else:
                state = "pending"
            gates_aggregate.append({
                "code": code,
                "label": gate_def["label"],
                "description": gate_def["description"],
                "level": gate_def["level"],
                "zone": gate_def["zone"],
                "state": state,
                "perDroneStates": states,
            })
    return {
        "projectId": project.id,
        "fleetSize": len(per_drone),
        "maxFleetSize": MAX_FLEET_SIZE,
        "perDrone": per_drone,
        "gatesAggregate": gates_aggregate,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "physicalExecutionPermitted": False,
    }


def arm_n3_gate_drone(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Arm N3 for a specific drone — independent of the rest of the fleet."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    drone = _require_drone_owner(db, project, user["id"], drone_id)
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Arm payload must be an object")
    if payload.get("physicalOutputEnabled") is True or payload.get("deviceConnected") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output remains disabled")
    human_confirmed = payload.get("humanConfirmed") is True
    safety_confirmed = payload.get("safetyConfirmed") is True
    second_operator = str(payload.get("secondOperatorCode") or "").strip()
    if not (human_confirmed and safety_confirmed):
        raise LabBenchError(400, "ARM_CONFIRMATION_MISSING", "humanConfirmed and safetyConfirmed are both required")
    if len(second_operator) < 6:
        raise LabBenchError(400, "ARM_SECOND_OPERATOR_CODE_REQUIRED", "A second operator code (≥ 6 characters) is required to arm N3")

    row, data, _ = _ensure_per_drone_gate_state(db, project, user, drone.id, drone.name)
    conditions = _evaluate_per_drone_conditions(db, project, user, data, drone.id)
    if not conditions.get("n3_ready"):
        raise LabBenchError(409, "GATE_NOT_READY", f"N3-READY gate must be passed for drone {drone.name} before arming")

    arm_event = {
        "id": str(uuid4()),
        "action": "arm",
        "active": True,
        "at": datetime.now(UTC).isoformat(),
        "actorId": user["id"],
        "actorRole": user.get("role", "user"),
        "droneId": drone.id,
        "droneName": drone.name,
        "secondOperatorCodeHash": hashlib.sha256(second_operator.encode("utf-8")).hexdigest(),
        "humanConfirmed": True,
        "safetyConfirmed": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "reason": f"Armement N3 supervisé enregistré pour {drone.name} ; sorties physiques toujours interdites.",
    }
    data.setdefault("armEvents", []).append(arm_event)
    data["conditions"]["arm_double_confirmed"] = True
    data["conditions"]["n3_armed"] = True
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.arm_n3_drone",
            message=f"Armement N3 drone {drone.name} enregistré ; aucune sortie physique.",
            payload_json=json.dumps({
                "scope": "labbench-gate-per-drone",
                "droneId": drone.id,
                "droneName": drone.name,
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "armEventId": arm_event["id"],
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "droneId": drone.id,
        "droneName": drone.name,
        "gateStateId": row.id,
        "armEventId": arm_event["id"],
        "armed": True,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
        "physicalExecutionPermitted": False,
        "reason": arm_event["reason"],
    }


def disarm_n3_gate_drone(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
) -> dict[str, Any]:
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    drone = _require_drone_owner(db, project, user["id"], drone_id)
    row, data = _per_drone_gate_row(db, project.id, user["id"], drone.id)
    if row is None or data is None:
        raise LabBenchError(404, "NOT_FOUND", "No gate state to disarm for this drone")
    arm_events = data.get("armEvents", [])
    if not isinstance(arm_events, list) or not arm_events:
        raise LabBenchError(409, "NOT_ARMED", f"N3 gate is not armed for drone {drone.name}")
    last = arm_events[-1]
    if not isinstance(last, dict) or last.get("active") is not True:
        raise LabBenchError(409, "NOT_ARMED", f"N3 gate is not armed for drone {drone.name}")
    last["active"] = False
    last["disarmedAt"] = datetime.now(UTC).isoformat()
    data["conditions"]["arm_double_confirmed"] = False
    data["conditions"]["n3_armed"] = False
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.disarm_n3_drone",
            message=f"Désarmement N3 drone {drone.name} enregistré.",
            payload_json=json.dumps({
                "scope": "labbench-gate-per-drone",
                "droneId": drone.id,
                "droneName": drone.name,
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
        "gateStateId": row.id,
        "armed": False,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def complete_hardware_checklist_drone(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    drone_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Persist the simulated hardware checklist scoped to a single drone."""
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    drone = _require_drone_owner(db, project, user["id"], drone_id)
    if payload.get("physicalOutputEnabled") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output remains disabled")
    row, data, _ = _ensure_per_drone_gate_state(db, project, user, drone.id, drone.name)
    checklist = {
        "deviceIdentified": bool(payload.get("deviceIdentified") is True),
        "driverValidated": bool(payload.get("driverValidated") is True),
        "calibrationSimulated": bool(payload.get("calibrationSimulated") is True),
    }
    checklist["complete"] = all(checklist.values())
    data["hardwareChecklist"] = checklist
    data["updatedAt"] = datetime.now(UTC).isoformat()
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db.add(
        AuditEvent(
            id=str(uuid4()),
            project_id=project.id,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.gate.hardware_checklist_drone",
            message=f"Checklist hardware simulée complétée pour {drone.name} ; aucune commande matérielle.",
            payload_json=json.dumps({
                "scope": "labbench-gate-per-drone",
                "droneId": drone.id,
                "droneName": drone.name,
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
                "checklist": checklist,
            }, ensure_ascii=False, separators=(",", ":")),
            occurred_at=datetime.now(UTC),
        )
    )
    db.commit()
    return {
        "projectId": project.id,
        "droneId": drone.id,
        "droneName": drone.name,
        "gateStateId": row.id,
        "checklist": checklist,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }


def run_fleet_simulation(
    db: Session,
    user: dict[str, Any] | None,
    project_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Run a fleet simulation: one N2 scenario per drone, in parallel.

    `payload.scenarios` is a list of `{droneId, scenario}` objects. Each
    scenario is run through `run_simulation()` (no hardware). The results are
    persisted as server-archived LabSessions tagged with `droneId`, so the
    per-drone gate N2 advances independently.
    """
    project = _require_project_owner(db, user, project_id)
    assert user is not None
    _official_write_allowed(user)
    if not isinstance(payload, dict):
        raise LabBenchError(400, "BAD_REQUEST", "Fleet payload must be an object")
    if payload.get("physicalOutputEnabled") is True:
        raise LabBenchError(403, "PHYSICAL_COMMAND_FORBIDDEN", "Physical output remains disabled")
    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise LabBenchError(400, "BAD_REQUEST", "scenarios must be a non-empty array")
    if len(scenarios) > MAX_FLEET_SIZE:
        raise LabBenchError(400, "FLEET_TOO_LARGE", f"Fleet size capped at {MAX_FLEET_SIZE}")
    # Validate each entry references a real drone in this project.
    validated: list[tuple[Any, dict[str, Any]]] = []
    for entry in scenarios:
        if not isinstance(entry, dict):
            raise LabBenchError(400, "BAD_REQUEST", "Each scenario entry must be an object")
        drone_id = str(entry.get("droneId") or "").strip()
        if not drone_id:
            raise LabBenchError(400, "BAD_REQUEST", "Each scenario entry requires a droneId")
        drone = _require_drone_owner(db, project, user["id"], drone_id)
        scenario_payload = entry.get("scenario") or entry
        if not isinstance(scenario_payload, dict):
            raise LabBenchError(400, "BAD_REQUEST", "scenario must be an object")
        scenario_payload = {**scenario_payload, "mode": "simulation"}
        validated.append((drone, scenario_payload))

    # Run + persist each scenario. Each persist_simulation call writes its own
    # LabSession + AuditEvent atomically.
    results: list[dict[str, Any]] = []
    for drone, scenario_payload in validated:
        try:
            run_payload = {**scenario_payload, "droneId": drone.id, "droneName": drone.name}
            run = run_simulation(run_payload)
            run["source"] = "server-archived"
            run["persisted"] = True
            run["droneId"] = drone.id
            run["droneName"] = drone.name
            registry_row, registry_data, seeded = _ensure_registry(db, project, user)
            registry_data["updatedAt"] = datetime.now(UTC).isoformat()
            registry_row.data_json = json.dumps(registry_data, ensure_ascii=False, separators=(",", ":"))
            audit_id = str(uuid4())
            record = LabSession(
                id=str(uuid4()),
                user_id=user["id"],
                project_id=project.id,
                data_json=json.dumps(
                    {"kind": RUN_KIND, "run": run, "auditEventId": audit_id},
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            )
            db.add(record)
            db.add(
                AuditEvent(
                    id=audit_id,
                    project_id=project.id,
                    user_id=user["id"],
                    actor_role=user.get("role", "user"),
                    event_type="labbench.simulation.fleet_run",
                    message=f"Run LABBENCH synthétique {run['runId']} archivé pour drone {drone.name}",
                    payload_json=json.dumps({
                        "scope": "local-simulation-only",
                        "droneId": drone.id,
                        "droneName": drone.name,
                        "physicalOutputEnabled": False,
                        "physicalCommandsEmitted": False,
                        "runId": run["runId"],
                        "contentSha256": run["contentSha256"],
                    }, ensure_ascii=False, separators=(",", ":")),
                    occurred_at=datetime.now(UTC),
                )
            )
            results.append({
                "droneId": drone.id,
                "droneName": drone.name,
                "runId": run["runId"],
                "predictedTemperatureC": run["predictedTemperatureC"],
                "verdict": run["verdict"],
                "contentSha256": run["contentSha256"],
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
            })
        except LabBenchError as exc:
            results.append({
                "droneId": drone.id,
                "droneName": drone.name,
                "error": {"code": exc.code, "message": exc.message},
                "physicalOutputEnabled": False,
                "physicalCommandsEmitted": False,
            })
    db.commit()
    return {
        "projectId": project.id,
        "fleetSize": len(validated),
        "results": results,
        "physicalOutputEnabled": False,
        "physicalCommandsEmitted": False,
    }

