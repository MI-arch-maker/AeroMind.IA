from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def now_utc():
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AdminAccountRecord(Base):
    """Durable AeroMind allowlist for Entra OIDC or pre-provisioned local MFA identities."""
    __tablename__ = "admin_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)


class AdminAccountEvent(Base):
    """Durable audit trail for account and authorization changes."""
    __tablename__ = "admin_account_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    target_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    data_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    active_drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


class Drone(Base):
    __tablename__ = "drones"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    config_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    # NOTE: active_revision_id was removed from the ORM model in V6.2 because
    # production databases (MySQL/TiDB) don't have this column and the
    # migration `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is PostgreSQL-only.
    # The active revision is now computed on-the-fly by querying the latest
    # DroneRevision for the drone (ORDER BY revision_number DESC LIMIT 1).
    # This avoids INSERT failures on databases that lack the column.


class Simulation(Base):
    __tablename__ = "simulations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    data_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    data_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuditEvent(Base):
    """Owner-scoped, append-only project validation/audit entry."""
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=True
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    actor_role: Mapped[str] = mapped_column(String(40), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    __table_args__ = (
        Index("ix_audit_events_project_created", "project_id", "created_at"),
    )


class LabSession(Base):
    __tablename__ = "lab_sessions"
    # V6 — widened from String(36) to String(128) because the session_id is
    # the actual token_urlsafe(48) output (~64 chars), not a UUID. PostgreSQL
    # enforces the VARCHAR length strictly (SQLite doesn't, so this was masked).
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    data_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class UserSetting(Base):
    __tablename__ = "user_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(120), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_setting"),)


class HardwareLog(Base):
    __tablename__ = "hardware_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    command: Mapped[str] = mapped_column(String(80), nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)


class PrototypeVersion(Base):
    """Immutable engineering configuration shared by design, simulation and test hall."""
    __tablename__ = "prototype_versions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    prototype_id: Mapped[str] = mapped_column(String(36), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)
    requirements_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    sketch_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    input_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="ready_to_simulate")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (UniqueConstraint("project_id", "prototype_id", "version", name="uq_prototype_version"),)


class WorkflowRun(Base):
    """Reproducible simulation/test execution bound to one immutable prototype version."""
    __tablename__ = "workflow_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    prototype_version_id: Mapped[str] = mapped_column(ForeignKey("prototype_versions.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    scenario_json: Mapped[str] = mapped_column(Text, nullable=False)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    engine_version: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="running")
    report_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    replay_of: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EngineeringDocumentRecord(Base):
    """Immutable normalized design/assembly document for one prototype version."""
    __tablename__ = "engineering_documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    prototype_version_id: Mapped[str] = mapped_column(ForeignKey("prototype_versions.id", ondelete="CASCADE"), unique=True, index=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    document_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class CommandRequestRecord(Base):
    """Immutable, owner-scoped human approval request; simulation-only."""
    __tablename__ = "command_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[str] = mapped_column(String(120), nullable=False)
    target_name: Mapped[str] = mapped_column(String(240), nullable=False)
    command: Mapped[str] = mapped_column(String(60), nullable=False)
    objective: Mapped[str] = mapped_column(String(500), nullable=False)
    parameters_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    checks_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    request_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    prepared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    presented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    decided_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CommandAuditEvent(Base):
    """Append-only-by-API event record for a human command request."""
    __tablename__ = "command_audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey("command_requests.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_role: Mapped[str] = mapped_column(String(40), nullable=False)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)


class FleetTelemetrySample(Base):
    """Persisted telemetry sample for one drone at a point in time.

    The fleet telemetry streamer (web.fleet_telemetry) writes one row every
    2 s per drone (capped at 500 rows per drone = ~17 min of history at
    2 Hz storage rate, more at lower frequency). The frontend radar replay
    mode reads these rows to scrub through past flights.
    """
    __tablename__ = "fleet_telemetry_samples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    drone_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    sample_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)
    latitude_deg: Mapped[float | None] = mapped_column(nullable=True)
    longitude_deg: Mapped[float | None] = mapped_column(nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(nullable=True)
    relative_altitude_m: Mapped[float | None] = mapped_column(nullable=True)
    x_m: Mapped[float | None] = mapped_column(nullable=True)
    y_m: Mapped[float | None] = mapped_column(nullable=True)
    heading_deg: Mapped[float | None] = mapped_column(nullable=True)
    battery_remaining_pct: Mapped[float | None] = mapped_column(nullable=True)
    voltage_v: Mapped[float | None] = mapped_column(nullable=True)
    current_a: Mapped[float | None] = mapped_column(nullable=True)
    armed: Mapped[bool] = mapped_column(nullable=False, default=False)
    connected: Mapped[bool] = mapped_column(nullable=False, default=False)
    inside_geofence: Mapped[bool] = mapped_column(nullable=False, default=True)
    altitude_ok: Mapped[bool] = mapped_column(nullable=False, default=True)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    __table_args__ = (
        Index("ix_fleet_telemetry_drone_time", "drone_id", "sample_time"),
    )


class AlertEvent(Base):
    """Server-side alert raised by the telemetry streamer (low battery,
    geofence breach, heartbeat lost). Append-only + audit-trail linked."""
    __tablename__ = "alert_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    alert_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    acknowledged: Mapped[bool] = mapped_column(nullable=False, default=False)
    acknowledged_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)


class MaterialItem(Base):
    """Material library item — extended catalog including motors, ESCs,
    propellers, frames, FC, cameras, sensors, payloads (non-weaponized).

    The catalog is bootstrapped from the JSON in web.material_library on
    first request; this table holds user-added custom items.
    """
    __tablename__ = "material_items"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    category: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(240), nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(120), nullable=True)
    part_number: Mapped[str] = mapped_column(String(120), nullable=True)
    mass_kg: Mapped[float | None] = mapped_column(nullable=True)
    dimensions: Mapped[str] = mapped_column(Text, nullable=True)
    electrical: Mapped[str] = mapped_column(Text, nullable=True)
    interfaces: Mapped[str] = mapped_column(Text, nullable=True)
    use: Mapped[str] = mapped_column(Text, nullable=True)
    compatible_airframes_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    catalog_source: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    weaponized: Mapped[bool] = mapped_column(nullable=False, default=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Mission(Base):
    """Mission plan — list of waypoints uploaded to a flight controller."""
    __tablename__ = "missions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    uploaded_to_drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # P0-04 fix — EXIGENCE FUNC-05 / R10: mission upload is a state machine.
    # ``upload_state`` ∈ {pending, uploading, uploaded, failed}; the previous
    # implementation set ``uploaded_at`` immediately on partial ACK and
    # announced success on transport errors. The new fields persist the
    # upload progress + error so the frontend can disable the upload button
    # until the protocol reaches ``uploaded`` and surface the failure reason
    # when it does not.
    upload_state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    upload_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    upload_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    upload_protocol: Mapped[str | None] = mapped_column(String(60), nullable=True)
    upload_idempotency_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)


class Waypoint(Base):
    """Waypoint in a mission."""
    __tablename__ = "waypoints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    mission_id: Mapped[str] = mapped_column(ForeignKey("missions.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(nullable=False)
    command: Mapped[str] = mapped_column(String(60), nullable=False, default="NAV_WAYPOINT")
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(nullable=True)
    param1: Mapped[float | None] = mapped_column(nullable=True)
    param2: Mapped[float | None] = mapped_column(nullable=True)
    param3: Mapped[float | None] = mapped_column(nullable=True)
    param4: Mapped[float | None] = mapped_column(nullable=True)


class PreflightChecklist(Base):
    """Pre-flight checklist template + execution record."""
    __tablename__ = "preflight_checklists"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    items_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    passed: Mapped[bool | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MaintenanceRecord(Base):
    """Maintenance / inspection record for a drone or part."""
    __tablename__ = "maintenance_records"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    material_item_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    maintenance_type: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    flight_hours_at_maintenance: Mapped[float | None] = mapped_column(nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class BatteryCycle(Base):
    """Battery charge/discharge cycle tracking."""
    __tablename__ = "battery_cycles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    drone_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    battery_label: Mapped[str] = mapped_column(String(120), nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False)  # charge / discharge / storage
    voltage_v: Mapped[float | None] = mapped_column(nullable=True)
    capacity_mah_used: Mapped[float | None] = mapped_column(nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    notes: Mapped[str] = mapped_column(Text, nullable=True)


class AnonymousWorkspace(Base):
    """V5 LOT B / R-04 — persistent anonymous browser workspace drafts.

    Replaces the in-memory ``_local_workspaces`` dict so that:
      - Workspaces survive a worker restart / multi-worker deployment
      - Two anonymous browsers cannot collide via the shared 'default' slot
      - TTL is enforced server-side (expired rows purged on next access)
      - Quotas are enforced (max N workspaces per IP / per browser key)
      - The workspace_key is a 43-char base64url opaque identifier
        (≥ 122 bits of entropy), not a sequential ID

    The ``workspace_key`` is the primary access key — it is sent by the
    browser via the ``X-AeroMind-Workspace`` header. The ``data_json``
    column carries the workspace payload (projects, active project ID,
    config, etc.) — it is NOT interpreted by the server, only stored and
    retrieved.
    """
    __tablename__ = "anonymous_workspaces"
    id: Mapped[str] = mapped_column(String(43), primary_key=True)  # workspace_key
    data_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Origin IP for quota / abuse tracking — NOT for authorization (the
    # workspace_key is the sole access credential, so we don't tie drafts
    # to IP).
    origin_ip: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    __table_args__ = (
        Index("ix_anonymous_workspaces_expires", "expires_at"),
    )
