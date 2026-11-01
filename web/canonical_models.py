"""AeroMind LABBENCH-01 — Canonical data models (cahier des charges §3.1, §18-22).

Implements the entity layer required by the Option C FAST-TRACK specification:
- User (existing, unchanged)
- Project (existing, augmented with revision + active_revision_id)
- Drone (existing, augmented with origin_type, source_id, active_revision_id)
- DroneRevision (NEW — versioned immutable drone configuration)
- LabSession (NEW — short-lived step-up session bound to user/project/drone)
- TestRun (NEW — single trial execution with state machine)
- Measurement (NEW — sampled metric with source_type, persisted, quality)
- AuditEvent (existing — extended with correlation_id)
- GeofenceRecord (NEW — persistent per-owner geofence, fail-closed)
- HardwareToken (NEW — single-use signed expiring authorization token)
- EventOutbox (NEW — transactional outbox for event delivery)

All new tables follow the cahier des charges requirements:
- UTC timestamps with timezone
- Owner/tenant/project binding on every entity
- Append-only audit trail with correlation_id
- source_type enum: synthetic | sitl | hil | physical
- persisted flag on every measurement/result
- Optimistic concurrency via revision/version + checksum
"""
from datetime import UTC, datetime
from enum import Enum
from sqlalchemy import (
    DateTime, ForeignKey, Index, Integer, String, Text, Boolean,
    UniqueConstraint, CheckConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def now_utc():
    return datetime.now(UTC)


def _sql_in_list(values) -> str:
    """Build a SQL ``IN (...)`` clause from a Python iterable of strings.

    P0-06 fix — the previous ``f"... IN {TUPLE!r}".replace("(", "('")...``
    chain produced invalid SQL like ``IN (''G0_gel'',''G1_securite'')``
    because Python's ``repr()`` already emits single-quoted strings, so
    the manual ``replace`` calls doubled the quotes. The result was a
    syntax error at CREATE TABLE time, which broke the temp_db fixture
    used by the labbench reception tests. Use a clean Python format
    string so the emitted SQL is valid in SQLite, PostgreSQL and MySQL.
    """
    return "(" + ",".join(f"'{v}'" for v in values) + ")"


# === Enum-like string constants (kept as String for SQLAlchemy portability) ===
SOURCE_TYPES = ("synthetic", "sitl", "hil", "physical")  # EXIGENCE C-002, SYNC-07
RUN_STATES = ("pending", "running", "completed", "failed", "cancelled")
SESSION_STATES = ("active", "expired", "revoked")
TOKEN_KINDS = ("command", "mission_upload", "arm", "actuator", "geofence_update")
GATE_STATES = (
    "G0_gel", "G1_securite", "G2_fiabilite", "G3_banc",
    "G4_qualification", "G5_exploitation",
)


# ─────────────────────────────────────────────────────────────────────────────
# DroneRevision — immutable versioned drone configuration (cahier des charges §3.1)
# ─────────────────────────────────────────────────────────────────────────────
class DroneRevision(Base):
    """Immutable, versioned drone configuration with checksum for optimistic concurrency.

    EXIGENCE SYNC-02 — Bibliothèque des cellules et Dessin de drones doivent
    produire une DroneRevision persistée côté serveur, jamais un brouillon local.
    """
    __tablename__ = "drone_revisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    drone_id: Mapped[str] = mapped_column(
        ForeignKey("drones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    schema_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hex
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    geometry_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    mass_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    inertia_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    propulsion_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    units_json: Mapped[str] = mapped_column(Text, nullable=False, default='{"length":"m","mass":"kg"}')
    origin_type: Mapped[str] = mapped_column(String(20), nullable=False)  # catalog | sketch | imported
    source_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # external reference
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, nullable=False
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        UniqueConstraint("drone_id", "revision_number", name="uq_drone_revision_number"),
        Index("ix_drone_revisions_project_drone", "project_id", "drone_id"),
        CheckConstraint(
            f"origin_type IN ('catalog', 'sketch', 'imported')",
            name="ck_drone_revisions_origin"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# LabSession — short step-up session bound to user/project/drone (EXIGENCE IAM-01)
# ─────────────────────────────────────────────────────────────────────────────
# P0-06 fix — The legacy ``web.models.LabSession`` defines the same table
# (``lab_sessions``) with a simpler schema (id, user_id, project_id, data_json,
# created_at) and is used by ``web.labbench`` / ``web.hardware_gate`` /
# ``web.business_api`` for the project registry row. Rather than duplicate
# the table definition and trigger an SQLAlchemy ``DuplicateTable`` warning
# (or worse, a runtime error on the second class definition), we ALIAS
# ``canonical_models.LabSession`` to the legacy class. The richer canonical
# fields (assurance_level, state, expires_at, ...) are persisted in the
# ``data_json`` JSON column on the legacy row — this is consistent with how
# ``web.labbench._decode_session`` already extracts structured state from
# that JSON field. Production deployments that want a separate schema can
# run the migration ``2026-10-25_canonical_labbench_schema.sql`` which
# ALTERs the legacy table to add the canonical columns.
# ─────────────────────────────────────────────────────────────────────────────
from .models import LabSession as _LegacyLabSession

# Re-export so callers can ``from .canonical_models import LabSession`` and
# get the same class object that ``web.models`` exposes. This preserves the
# stable identity contract — every caller sees the same ORM class, so the
# shared ``Base.metadata`` only registers the ``lab_sessions`` Table once.
LabSession = _LegacyLabSession


# ─────────────────────────────────────────────────────────────────────────────
# TestRun — single trial execution with state machine (EXIGENCE SYNC-04, §9)
# ─────────────────────────────────────────────────────────────────────────────
class TestRun(Base):
    """One trial execution with explicit source_type and persisted status.

    EXIGENCE C-002 — source_type ∈ {synthetic, sitl, hil, physical}
    EXIGENCE SYNC-07 — every result exposes source_type, persisted, runId, droneVersion
    """
    __tablename__ = "test_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(
        String(128),
        ForeignKey("lab_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drone_id: Mapped[str] = mapped_column(
        ForeignKey("drones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("drone_revisions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    scenario_id: Mapped[str] = mapped_column(String(100), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(60), nullable=False, default="aeromind-1.0")
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="synthetic")
    persisted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    __table_args__ = (
        CheckConstraint(
            f"state IN {_sql_in_list(RUN_STATES)}",
            name="ck_test_runs_state"
        ),
        CheckConstraint(
            f"source_type IN {_sql_in_list(SOURCE_TYPES)}",
            name="ck_test_runs_source_type"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Measurement — sampled metric with source, quality, persisted (EXIGENCE SYNC-07)
# ─────────────────────────────────────────────────────────────────────────────
class Measurement(Base):
    """Single sampled metric for a TestRun.

    EXIGENCE SYNC-07 — sourceType (synthetic/SITL/HIL/physical), timestamp UTC,
    unités, quality, persisted, runId, droneVersion obligatoires.
    """
    __tablename__ = "measurements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("test_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drone_id: Mapped[str] = mapped_column(
        ForeignKey("drones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("drone_revisions.id", ondelete="RESTRICT"), nullable=False
    )
    timestamp_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metric: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    quality: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="synthetic")
    persisted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    calibration_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    origin: Mapped[str] = mapped_column(String(100), nullable=False, default="local")
    __table_args__ = (
        Index("ix_measurements_run_timestamp", "run_id", "timestamp_utc"),
        CheckConstraint(
            f"source_type IN {_sql_in_list(SOURCE_TYPES)}",
            name="ck_measurements_source_type"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GeofenceRecord — persistent per-owner geofence (SEC-04 fix, EXIGENCE PHY-02)
# ─────────────────────────────────────────────────────────────────────────────
class GeofenceRecord(Base):
    """Persistent geofence bound to project (and therefore owner via project.user_id).

    SEC-04 fix — geofence was previously an in-memory dict keyed only by project_id
    with no owner check. Now persisted and fail-closed: any mission must have
    a valid geofence attached, else rejected.
    """
    __tablename__ = "geofence_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    polygon_json: Mapped[str] = mapped_column(Text, nullable=False)
    max_altitude_m: Mapped[float] = mapped_column(nullable=False)
    min_altitude_m: Mapped[float] = mapped_column(default=0.0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False
    )
    __table_args__ = (
        CheckConstraint("max_altitude_m > min_altitude_m", name="ck_geofence_altitude_range"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# HardwareToken — single-use signed expiring authorization token (SEC-03, EXIGENCE PHY)
# ─────────────────────────────────────────────────────────────────────────────
class HardwareToken(Base):
    """Single-use, signed, expiring, context-bound hardware authorization token.

    SEC-03 fix — Previous implementation used raw uuid4().hex without HMAC,
    no expiry, and no project/drone/command binding. Now:
    - signature: HMAC-SHA256 of (token_id, project_id, drone_id, command, expires_at)
    - consumed_at: NULL until atomic consumption via UPDATE WHERE consumed_at IS NULL
    - reviewer_id: distinct from actor_id (EXIGENCE IAM-03)
    """
    __tablename__ = "hardware_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    drone_id: Mapped[str] = mapped_column(
        ForeignKey("drones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    command: Mapped[str] = mapped_column(String(80), nullable=False)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 of params
    signature: Mapped[str] = mapped_column(String(128), nullable=False)   # HMAC-SHA256 hex
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="command")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (
        CheckConstraint(
            f"kind IN {_sql_in_list(TOKEN_KINDS)}",
            name="ck_hardware_tokens_kind"
        ),
        Index("ix_hardware_tokens_drone_expires", "drone_id", "expires_at"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# EventOutbox — transactional outbox for at-least-once event delivery (SYNC-04)
# ─────────────────────────────────────────────────────────────────────────────
class EventOutbox(Base):
    """Transactional outbox for versioned domain events.

    EXIGENCE SYNC-04 — events: drone.selected, sketch.saved,
    configuration.versioned, test.started, telemetry.received,
    test.completed, test.failed. Each event has eventId, correlationId,
    tenantId, projectId, droneId, version, occurredAt.

    Delivery: at-least-once ; consumers must be idempotent (use event_id).
    """
    __tablename__ = "event_outbox"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    schema_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    revision_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivery_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    __table_args__ = (
        Index("ix_event_outbox_unpublished", "published_at", "occurred_at"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# AuditEvent extension — add correlation_id (already in schema, but explicit here)
# ─────────────────────────────────────────────────────────────────────────────
class AuditEventExt(Base):
    """Append-only audit log with correlation_id (extended from AuditEvent).

    EXIGENCE IAM-05 — Journaux d'audit inviolables (append-only, accès restreint).
    Mirrors AuditEvent but with correlation_id required for end-to-end tracing.
    """
    __tablename__ = "audit_events_ext"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # allow | deny | error
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)
    # P0-07 fix: tamper-evident hash chain (prev_hash + chain_hash)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chain_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    __table_args__ = (
        CheckConstraint("decision IN ('allow', 'deny', 'error')", name="ck_audit_events_ext_decision"),
        Index("ix_audit_events_ext_project_time", "project_id", "occurred_at"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# GateValidation — G0..G5 progress tracking (cahier des charges §22)
# ─────────────────────────────────────────────────────────────────────────────
class GateValidation(Base):
    """Tracks approval of the 6 gates G0..G5 required before physical operations.

    EXIGENCE C-001 — Toutes sorties MAVLink matérielles restent bloquées
    jusqu'à satisfaction documentée des portes de validation G0 à G5.
    """
    __tablename__ = "gate_validations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gate: Mapped[str] = mapped_column(String(20), nullable=False)
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    reviewer_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # P1-05 fix: store the operator who REQUESTED the gate (for IAM-03 enforcement).
    # approve_gate now checks operator_id != session.user_id (was missing entirely).
    operator_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    evidence_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    __table_args__ = (
        UniqueConstraint("project_id", "gate", name="uq_gate_per_project"),
        CheckConstraint(
            # P0-06 fix — use the _sql_in_list helper to emit valid SQL.
            f"gate IN {_sql_in_list(GATE_STATES)}",
            name="ck_gate_validations_gate"
        ),
        CheckConstraint("state IN ('pending', 'approved', 'rejected', 'revoked')", name="ck_gate_validations_state"),
    )


# Convenience exports
__all__ = [
    "DroneRevision", "LabSession", "TestRun", "Measurement",
    "GeofenceRecord", "HardwareToken", "EventOutbox", "AuditEventExt",
    "GateValidation",
    "SOURCE_TYPES", "RUN_STATES", "SESSION_STATES", "TOKEN_KINDS", "GATE_STATES",
]
