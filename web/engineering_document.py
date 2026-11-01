"""Shared engineering document contract for design and assembly modules."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Cookie, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .business_api import owner
from .database import get_db
from .models import EngineeringDocumentRecord, PrototypeVersion

router = APIRouter(prefix="/api/engineering-documents", tags=["engineering-document"])
DOCUMENT_SCHEMA_VERSION = 1


class ComponentInstance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    definition_id: str = Field(min_length=1, max_length=160)
    label: str = Field(min_length=1, max_length=200)
    category: Literal["airframe", "propulsion", "energy", "avionics", "payload", "landing-gear", "safety", "hardware"]
    quantity: int = Field(default=1, ge=1, le=10_000)
    mass_kg: float = Field(ge=0, le=100_000)
    x_m: float = Field(default=0, ge=-100_000, le=100_000)
    y_m: float = Field(default=0, ge=-100_000, le=100_000)
    z_m: float = Field(default=0, ge=-100_000, le=100_000)
    rotation_deg: float = Field(default=0, ge=-3600, le=3600)
    scale: float = Field(default=1, gt=0, le=20)
    source_status: Literal["verified", "partial", "estimate", "missing"] = "estimate"
    interfaces: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("mass_kg", "x_m", "y_m", "z_m", "rotation_deg", "scale", mode="before")
    @classmethod
    def finite_number(cls, value: float) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("must be numeric")
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("must be finite")
        return value


class Connection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    source_component_id: str = Field(min_length=1, max_length=120)
    target_component_id: str = Field(min_length=1, max_length=120)
    kind: Literal["mechanical", "power", "control", "data", "mount"]
    status: Literal["defined", "verified", "warning", "invalid"] = "defined"
    connector: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    severity: Literal["info", "warning", "error"]
    code: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=500)
    component_ids: list[str] = Field(default_factory=list, max_length=50)
    status: Literal["open", "resolved", "not_checked"] = "not_checked"


class BomLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    component_id: str = Field(min_length=1, max_length=120)
    reference: str = Field(min_length=1, max_length=160)
    designation: str = Field(min_length=1, max_length=200)
    quantity: int = Field(ge=1, le=10_000)
    unit_mass_kg: float | None = Field(default=None, ge=0, le=100_000)
    total_mass_kg: float | None = Field(default=None, ge=0, le=100_000_000)
    data_status: Literal["verified", "partial", "estimate", "missing"]
    notes: str | None = Field(default=None, max_length=500)


class EngineeringDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_: Literal["aeromind-engineering-document"] = Field(default="aeromind-engineering-document", alias="schema")
    schema_version: Literal[1] = DOCUMENT_SCHEMA_VERSION
    project_id: str = Field(min_length=1, max_length=36)
    prototype_version_id: str = Field(min_length=1, max_length=36)
    architecture: str = Field(min_length=1, max_length=100)
    units: Literal["SI"] = "SI"
    geometry: dict[str, float] = Field(default_factory=dict)
    parameters: dict[str, float | str | bool] = Field(default_factory=dict)
    component_instances: list[ComponentInstance] = Field(default_factory=list, max_length=2_000)
    connections: list[Connection] = Field(default_factory=list, max_length=5_000)
    validation: list[ValidationIssue] = Field(default_factory=list, max_length=2_000)
    bom: list[BomLine] = Field(default_factory=list, max_length=2_000)
    assumptions: list[str] = Field(default_factory=list, max_length=200)
    missing_data: list[str] = Field(default_factory=list, max_length=200)
    created_at: str | None = None

    @field_validator("component_instances")
    @classmethod
    def unique_component_ids(cls, value: list[ComponentInstance]) -> list[ComponentInstance]:
        ids = [item.id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("component instance ids must be unique")
        return value

    @field_validator("connections")
    @classmethod
    def unique_connection_ids(cls, value: list[Connection]) -> list[Connection]:
        ids = [item.id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("connection ids must be unique")
        return value


def _validate_references(document: EngineeringDocument) -> EngineeringDocument:
    component_ids = {item.id for item in document.component_instances}
    issues = list(document.validation)
    for connection in document.connections:
        missing = [item for item in (connection.source_component_id, connection.target_component_id) if item not in component_ids]
        if missing:
            issues.append(ValidationIssue(id=f"missing-ref-{connection.id}", severity="error", code="MISSING_COMPONENT_REFERENCE", message=f"Connexion {connection.id} référence des composants absents: {', '.join(missing)}", component_ids=missing, status="open"))
    return document.model_copy(update={"validation": issues})


def _document_response(row: EngineeringDocumentRecord) -> dict:
    return {"id": row.id, "prototype_version_id": row.prototype_version_id, "document": row.document_json and __import__("json").loads(row.document_json), "created_at": row.created_at.isoformat() if row.created_at else None}


@router.post("/prototype-versions/{prototype_version_id}", status_code=201)
def save_document(prototype_version_id: str, document: EngineeringDocument, aeromind_session: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    prototype = db.scalar(select(PrototypeVersion).where(PrototypeVersion.id == prototype_version_id, PrototypeVersion.user_id == user_id))
    if prototype is None:
        raise HTTPException(404, "Prototype version not found")
    if document.prototype_version_id != prototype.id or document.project_id != prototype.project_id:
        raise HTTPException(422, "Document identity does not match prototype version")
    checked = _validate_references(document)
    existing = db.scalar(select(EngineeringDocumentRecord).where(EngineeringDocumentRecord.prototype_version_id == prototype.id))
    if existing is not None:
        raise HTTPException(409, "Engineering document already exists for immutable prototype version")
    record = EngineeringDocumentRecord(id=str(uuid4()), prototype_version_id=prototype.id, project_id=prototype.project_id, user_id=user_id, schema_version=DOCUMENT_SCHEMA_VERSION, document_json=checked.model_dump_json(by_alias=True), created_at=datetime.now(UTC))
    db.add(record)
    db.commit()
    db.refresh(record)
    return _document_response(record)


@router.get("/prototype-versions/{prototype_version_id}")
def read_document(prototype_version_id: str, aeromind_session: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    user_id = owner(aeromind_session, db)
    record = db.scalar(select(EngineeringDocumentRecord).where(EngineeringDocumentRecord.prototype_version_id == prototype_version_id, EngineeringDocumentRecord.user_id == user_id))
    if record is None:
        raise HTTPException(404, "Engineering document not found")
    return _document_response(record)
