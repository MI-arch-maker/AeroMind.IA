"""Versioned design -> simulation -> flight-test -> report workflow.

The service is intentionally N2-only. The execution result is labelled as a
synthetic deterministic demonstration unless a real physics engine is added.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .business_api import owner
from .database import get_db
from .models import Project, PrototypeVersion, Report, WorkflowRun

router = APIRouter(prefix="/api/workflow", tags=["integrated-workflow"])
ENGINE_VERSION = "aeromind-workflow-demo-1.0"


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be finite")
    return value


class CanonicalConfig(BaseModel):
    """Shared SI contract: metres, metres/second, kilograms and watt-hours."""
    model_config = ConfigDict(extra="forbid")
    wingspan_m: float = Field(gt=0, le=100)
    chord_m: float = Field(gt=0, le=30)
    fuselage_length_m: float = Field(gt=0, le=100)
    propeller_diameter_m: float = Field(gt=0, le=20)
    battery_wh: float = Field(ge=0, le=10_000_000)
    payload_kg: float = Field(ge=0, le=10_000)
    cruise_speed_mps: float = Field(gt=0, le=200)
    wind_speed_mps: float = Field(ge=0, le=200)
    altitude_m: float = Field(ge=0, le=100_000)
    max_takeoff_mass_kg: float = Field(gt=0, le=100_000)
    motor_count: int = Field(ge=1, le=64)
    airframe: str = Field(min_length=1, max_length=80)
    design_name: str = Field(min_length=1, max_length=200)

    _finite_values = field_validator(
        "wingspan_m", "chord_m", "fuselage_length_m", "propeller_diameter_m",
        "battery_wh", "payload_kg", "cruise_speed_mps", "wind_speed_mps",
        "altitude_m", "max_takeoff_mass_kg", mode="before"
    )(_finite)


class Requirement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    value: str | float | int
    unit: str = Field(min_length=1, max_length=40)


class PrototypeRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str = Field(min_length=1, max_length=36)
    prototype_id: str | None = Field(default=None, max_length=36)
    name: str = Field(min_length=1, max_length=200)
    version: str = Field(default="1.0.0", pattern=r"^\d+\.\d+\.\d+$")
    config: CanonicalConfig
    requirements: list[Requirement] = Field(default_factory=list, max_length=200)
    sketch: dict = Field(default_factory=dict)


class Waypoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=80)
    x_m: float = Field(ge=-100_000, le=100_000)
    y_m: float = Field(ge=-100_000, le=100_000)
    z_m: float = Field(ge=0, le=100_000)
    speed_mps: float = Field(gt=0, le=500)

    _finite_values = field_validator("x_m", "y_m", "z_m", "speed_mps", mode="before")(_finite)


class Scenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    coordinate_frame: str = Field(default="ENU", pattern=r"^(ENU|NED)$")
    altitude_unit: str = Field(default="m", pattern=r"^m$")
    speed_unit: str = Field(default="m/s", pattern=r"^m/s$")
    waypoints: list[Waypoint] = Field(min_length=2, max_length=100)
    seed: int = Field(default=1, ge=0, le=2**31 - 1)


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_input(config: CanonicalConfig, requirements: list[Requirement], sketch: dict) -> str:
    return hashlib.sha256(_canonical_json({"config": config.model_dump(), "requirements": [x.model_dump() for x in requirements], "sketch": sketch}).encode()).hexdigest()


def _prototype_response(row: PrototypeVersion) -> dict:
    return {
        "id": row.id,
        "prototype_id": row.prototype_id,
        "project_id": row.project_id,
        "name": row.name,
        "version": row.version,
        "status": row.status,
        "input_sha256": row.input_sha256,
        "engine_version": ENGINE_VERSION,
        "config": json.loads(row.config_json),
        "requirements": json.loads(row.requirements_json),
        "sketch": json.loads(row.sketch_json),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _execute(scenario: Scenario, config: dict) -> dict:
    """Deterministic route metrics, explicitly not a physical solver."""
    points = [(0.0, 0.0, config["altitude_m"])] + [(p.x_m, p.y_m, p.z_m) for p in scenario.waypoints]
    distance = 0.0
    for a, b in zip(points, points[1:]):
        distance += math.sqrt(sum((b[i] - a[i]) ** 2 for i in range(3)))
    duration = sum(math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2) / max(scenario.waypoints[min(i, len(scenario.waypoints) - 1)].speed_mps, 0.001) for i, (a, b) in enumerate(zip(points, points[1:])))
    return {
        "evidence_level": "synthetic_demo",
        "physical_solver_connected": False,
        "hardware_control": False,
        "engine_version": ENGINE_VERSION,
        "scenario_id": scenario.scenario_id,
        "input_units": {"distance": "m", "altitude": "m", "speed": "m/s", "time": "s"},
        "distance_m": round(distance, 6),
        "duration_s": round(duration, 6),
        "waypoint_count": len(scenario.waypoints),
        "seed": scenario.seed,
        "note": "Résultat déterministe de démonstration; aucun calcul aérodynamique ou moteur physique réel n’est connecté.",
    }


def _run_response(row: WorkflowRun, prototype: PrototypeVersion) -> dict:
    return {
        "id": row.id,
        "prototype_version_id": row.prototype_version_id,
        "prototype_id": prototype.prototype_id,
        "project_id": row.project_id,
        "status": row.status,
        "engine_version": row.engine_version,
        "scenario": json.loads(row.scenario_json),
        "result": json.loads(row.result_json) if row.result_json else None,
        "report_id": row.report_id,
        "replay_of": row.replay_of,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


def _get_prototype(db: Session, user_id: str, prototype_version_id: str) -> PrototypeVersion:
    row = db.scalar(select(PrototypeVersion).where(PrototypeVersion.id == prototype_version_id, PrototypeVersion.user_id == user_id))
    if row is None:
        raise HTTPException(404, "Prototype version not found")
    return row


@router.post("/prototypes", status_code=201)
def register_prototype(body: PrototypeRegistration, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    project = db.scalar(select(Project).where(Project.id == body.project_id, Project.user_id == user_id))
    if project is None:
        raise HTTPException(404, "Project not found")
    input_hash = _hash_input(body.config, body.requirements, body.sketch)
    prototype_id = body.prototype_id or f"proto-{hashlib.sha256(f'{body.project_id}:{body.name}'.encode()).hexdigest()[:24]}"
    duplicate = db.scalar(select(PrototypeVersion).where(PrototypeVersion.project_id == body.project_id, PrototypeVersion.prototype_id == prototype_id, PrototypeVersion.version == body.version))
    if duplicate is not None:
        raise HTTPException(409, "Immutable prototype version already exists")
    row = PrototypeVersion(id=str(uuid4()), prototype_id=prototype_id, project_id=body.project_id, user_id=user_id, name=body.name, version=body.version, config_json=_canonical_json(body.config.model_dump()), requirements_json=_canonical_json([x.model_dump() for x in body.requirements]), sketch_json=_canonical_json(body.sketch), input_sha256=input_hash, status="ready_to_simulate")
    db.add(row)
    db.commit()
    db.refresh(row)
    return _prototype_response(row)


@router.post("/prototypes/{prototype_version_id}/runs", status_code=201)
def create_run(prototype_version_id: str, body: Scenario, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    prototype = _get_prototype(db, user_id, prototype_version_id)
    row = WorkflowRun(id=str(uuid4()), prototype_version_id=prototype.id, project_id=prototype.project_id, user_id=user_id, scenario_json=_canonical_json(body.model_dump()), engine_version=ENGINE_VERSION, status="running")
    db.add(row)
    try:
        row.result_json = _canonical_json(_execute(body, json.loads(prototype.config_json)))
        row.status = "completed"
        row.completed_at = datetime.now(UTC)
        db.commit()
    except Exception as exc:
        row.status = "failed"
        db.commit()
        raise HTTPException(422, f"Scenario execution failed: {type(exc).__name__}") from exc
    db.refresh(row)
    return _run_response(row, prototype)


@router.post("/runs/{run_id}/replay", status_code=201)
def replay_run(run_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    original = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.user_id == user_id))
    if original is None:
        raise HTTPException(404, "Run not found")
    prototype = _get_prototype(db, user_id, original.prototype_version_id)
    scenario = Scenario.model_validate(json.loads(original.scenario_json))
    row = WorkflowRun(id=str(uuid4()), prototype_version_id=prototype.id, project_id=prototype.project_id, user_id=user_id, scenario_json=original.scenario_json, engine_version=ENGINE_VERSION, status="running", replay_of=original.id)
    row.result_json = _canonical_json(_execute(scenario, json.loads(prototype.config_json)))
    row.status = "completed"
    row.completed_at = datetime.now(UTC)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _run_response(row, prototype)


@router.get("/runs/{run_id}")
def read_run(run_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    row = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.user_id == user_id))
    if row is None:
        raise HTTPException(404, "Run not found")
    return _run_response(row, _get_prototype(db, user_id, row.prototype_version_id))


@router.post("/runs/{run_id}/report", status_code=201)
def create_run_report(run_id: str, aeromind_session: str | None = Cookie(default=None, convert_underscores=False), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    row = db.scalar(select(WorkflowRun).where(WorkflowRun.id == run_id, WorkflowRun.user_id == user_id))
    if row is None:
        raise HTTPException(404, "Run not found")
    if row.status != "completed" or not row.result_json:
        raise HTTPException(409, "Only a completed run can produce a report")
    prototype = _get_prototype(db, user_id, row.prototype_version_id)
    report_id = row.report_id or str(uuid4())
    report_payload = {"type": "AeroMind.WorkflowReport", "prototype": _prototype_response(prototype), "run": _run_response(row, prototype), "generated_at": datetime.now(UTC).isoformat(), "evidence_level": "synthetic_demo"}
    if row.report_id is None:
        db.add(Report(id=report_id, user_id=user_id, project_id=row.project_id, data_json=_canonical_json(report_payload)))
        row.report_id = report_id
        db.commit()
    return {"id": report_id, "report": report_payload}
