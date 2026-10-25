-- AeroMind LABBENCH-01 — Canonical schema migration
-- Cahier des charges §3.1, §18-22 (Option C FAST-TRACK)
-- Date: 2026-10-25
-- Reversible: each CREATE TABLE is paired with a DROP in the rollback section
-- Apply on PostgreSQL; for TiDB use the _tidb.sql variant

BEGIN;

-- DroneRevision — immutable versioned drone configuration
CREATE TABLE IF NOT EXISTS drone_revisions (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    drone_id        VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    owner_id        VARCHAR(255) NOT NULL,
    revision_number INTEGER      NOT NULL DEFAULT 1,
    schema_version  VARCHAR(20)  NOT NULL DEFAULT '1.0',
    checksum        VARCHAR(64)  NOT NULL,
    config_json     TEXT         NOT NULL,
    geometry_json   TEXT         NOT NULL DEFAULT '{}',
    mass_json       TEXT         NOT NULL DEFAULT '{}',
    inertia_json    TEXT         NOT NULL DEFAULT '{}',
    propulsion_json TEXT         NOT NULL DEFAULT '{}',
    units_json      TEXT         NOT NULL DEFAULT '{"length":"m","mass":"kg"}',
    origin_type     VARCHAR(20)  NOT NULL,
    source_id       VARCHAR(255) NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    activated_at    TIMESTAMPTZ  NULL,
    UNIQUE (drone_id, revision_number),
    CONSTRAINT ck_drone_revisions_origin CHECK (origin_type IN ('catalog', 'sketch', 'imported'))
);
CREATE INDEX IF NOT EXISTS ix_drone_revisions_project_drone ON drone_revisions (project_id, drone_id);
CREATE INDEX IF NOT EXISTS ix_drone_revisions_owner ON drone_revisions (owner_id);
ALTER TABLE drone_revisions ADD CONSTRAINT fk_drone_revisions_drone FOREIGN KEY (drone_id) REFERENCES drones (id) ON DELETE CASCADE;
ALTER TABLE drone_revisions ADD CONSTRAINT fk_drone_revisions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE drone_revisions ADD CONSTRAINT fk_drone_revisions_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE;

-- LabSession — short step-up session
CREATE TABLE IF NOT EXISTS lab_sessions (
    id              VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NULL,
    revision_id     VARCHAR(36)  NULL,
    assurance_level VARCHAR(20)  NOT NULL DEFAULT 'step-up',
    state           VARCHAR(20)  NOT NULL DEFAULT 'active',
    step_up_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    revoked_at      TIMESTAMPTZ  NULL,
    scope_json      TEXT         NOT NULL DEFAULT '{}',
    -- V6 — legacy ORM compat: the legacy models.LabSession maps data_json
    -- for session_store DB persistence. Without this column, the ORM
    -- SELECT/INSERT fails on PostgreSQL (SQLite masks it because it doesn't
    -- enforce column existence at query time as strictly).
    data_json       TEXT         NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(64)  NULL,
    CONSTRAINT ck_lab_sessions_state CHECK (state IN ('active', 'expired', 'revoked')),
    CONSTRAINT ck_lab_sessions_assurance CHECK (assurance_level IN ('aeromind', 'step-up', 'mfa'))
);
CREATE INDEX IF NOT EXISTS ix_lab_sessions_user ON lab_sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_lab_sessions_project ON lab_sessions (project_id);
CREATE INDEX IF NOT EXISTS ix_lab_sessions_idem ON lab_sessions (idempotency_key);
ALTER TABLE lab_sessions ADD CONSTRAINT fk_lab_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE lab_sessions ADD CONSTRAINT fk_lab_sessions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;

-- TestRun — single trial execution
CREATE TABLE IF NOT EXISTS test_runs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    session_id      VARCHAR(128) NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    scenario_id     VARCHAR(100) NOT NULL,
    engine_version  VARCHAR(60)  NOT NULL DEFAULT 'aeromind-1.0',
    state           VARCHAR(20)  NOT NULL DEFAULT 'pending',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       BOOLEAN      NOT NULL DEFAULT FALSE,
    started_at      TIMESTAMPTZ  NULL,
    completed_at    TIMESTAMPTZ  NULL,
    error_message   TEXT         NULL,
    summary_json    TEXT         NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_test_runs_state CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT ck_test_runs_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical'))
);
CREATE INDEX IF NOT EXISTS ix_test_runs_session ON test_runs (session_id);
CREATE INDEX IF NOT EXISTS ix_test_runs_project ON test_runs (project_id);
CREATE INDEX IF NOT EXISTS ix_test_runs_drone ON test_runs (drone_id);
CREATE INDEX IF NOT EXISTS ix_test_runs_revision ON test_runs (revision_id);
ALTER TABLE test_runs ADD CONSTRAINT fk_test_runs_session FOREIGN KEY (session_id) REFERENCES lab_sessions (id) ON DELETE CASCADE;
ALTER TABLE test_runs ADD CONSTRAINT fk_test_runs_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE test_runs ADD CONSTRAINT fk_test_runs_drone FOREIGN KEY (drone_id) REFERENCES drones (id) ON DELETE CASCADE;
ALTER TABLE test_runs ADD CONSTRAINT fk_test_runs_revision FOREIGN KEY (revision_id) REFERENCES drone_revisions (id) ON DELETE RESTRICT;

-- Measurement — sampled metric
CREATE TABLE IF NOT EXISTS measurements (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id          VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    timestamp_utc   TIMESTAMPTZ  NOT NULL,
    metric          VARCHAR(100) NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    unit            VARCHAR(40)  NOT NULL,
    quality         VARCHAR(20)  NOT NULL DEFAULT 'unknown',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       BOOLEAN      NOT NULL DEFAULT FALSE,
    calibration_id  VARCHAR(100) NULL,
    origin          VARCHAR(100) NOT NULL DEFAULT 'local',
    CONSTRAINT ck_measurements_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical'))
);
CREATE INDEX IF NOT EXISTS ix_measurements_run_ts ON measurements (run_id, timestamp_utc);
CREATE INDEX IF NOT EXISTS ix_measurements_project ON measurements (project_id);
ALTER TABLE measurements ADD CONSTRAINT fk_measurements_run FOREIGN KEY (run_id) REFERENCES test_runs (id) ON DELETE CASCADE;
ALTER TABLE measurements ADD CONSTRAINT fk_measurements_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE measurements ADD CONSTRAINT fk_measurements_drone FOREIGN KEY (drone_id) REFERENCES drones (id) ON DELETE CASCADE;
ALTER TABLE measurements ADD CONSTRAINT fk_measurements_revision FOREIGN KEY (revision_id) REFERENCES drone_revisions (id) ON DELETE RESTRICT;

-- GeofenceRecord — persistent per-owner geofence (SEC-04)
CREATE TABLE IF NOT EXISTS geofence_records (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id     VARCHAR(36)  NOT NULL UNIQUE,
    owner_id       VARCHAR(255) NOT NULL,
    polygon_json   TEXT         NOT NULL,
    max_altitude_m DOUBLE PRECISION NOT NULL,
    min_altitude_m DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    notes          TEXT         NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_geofence_altitude_range CHECK (max_altitude_m > min_altitude_m)
);
CREATE INDEX IF NOT EXISTS ix_geofence_records_owner ON geofence_records (owner_id);
ALTER TABLE geofence_records ADD CONSTRAINT fk_geofence_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE geofence_records ADD CONSTRAINT fk_geofence_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE;

-- HardwareToken — single-use signed expiring authorization (SEC-03)
CREATE TABLE IF NOT EXISTS hardware_tokens (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id   VARCHAR(36)  NOT NULL,
    drone_id     VARCHAR(36)  NOT NULL,
    actor_id     VARCHAR(255) NOT NULL,
    reviewer_id  VARCHAR(255) NOT NULL,
    command      VARCHAR(80)  NOT NULL,
    params_hash  VARCHAR(64)  NOT NULL,
    signature    VARCHAR(128) NOT NULL,
    kind         VARCHAR(40)  NOT NULL DEFAULT 'command',
    issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    consumed_at  TIMESTAMPTZ  NULL,
    CONSTRAINT ck_hardware_tokens_kind CHECK (kind IN ('command', 'mission_upload', 'arm', 'actuator', 'geofence_update'))
);
CREATE INDEX IF NOT EXISTS ix_hardware_tokens_project ON hardware_tokens (project_id);
CREATE INDEX IF NOT EXISTS ix_hardware_tokens_drone ON hardware_tokens (drone_id);
CREATE INDEX IF NOT EXISTS ix_hardware_tokens_drone_expires ON hardware_tokens (drone_id, expires_at);
ALTER TABLE hardware_tokens ADD CONSTRAINT fk_hwtoken_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE hardware_tokens ADD CONSTRAINT fk_hwtoken_drone FOREIGN KEY (drone_id) REFERENCES drones (id) ON DELETE CASCADE;
ALTER TABLE hardware_tokens ADD CONSTRAINT fk_hwtoken_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE hardware_tokens ADD CONSTRAINT fk_hwtoken_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE;

-- EventOutbox — transactional outbox for at-least-once event delivery
CREATE TABLE IF NOT EXISTS event_outbox (
    id                VARCHAR(36)  NOT NULL PRIMARY KEY,
    event_id          VARCHAR(36)  NOT NULL UNIQUE,
    event_type        VARCHAR(60)  NOT NULL,
    schema_version    VARCHAR(20)  NOT NULL DEFAULT '1.0',
    correlation_id    VARCHAR(36)  NOT NULL,
    project_id        VARCHAR(36)  NULL,
    drone_id          VARCHAR(36)  NULL,
    revision_id       VARCHAR(36)  NULL,
    actor_id          VARCHAR(255) NULL,
    payload_json      TEXT         NOT NULL,
    occurred_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at      TIMESTAMPTZ  NULL,
    delivery_attempts INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_event_outbox_event_type ON event_outbox (event_type);
CREATE INDEX IF NOT EXISTS ix_event_outbox_corr ON event_outbox (correlation_id);
CREATE INDEX IF NOT EXISTS ix_event_outbox_unpublished ON event_outbox (published_at, occurred_at);

-- AuditEventExt — append-only audit log with correlation_id (EXIGENCE IAM-05)
CREATE TABLE IF NOT EXISTS audit_events_ext (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    actor_id        VARCHAR(255) NOT NULL,
    actor_role      VARCHAR(40)  NOT NULL,
    action          VARCHAR(80)  NOT NULL,
    resource_id     VARCHAR(255) NULL,
    decision        VARCHAR(20)  NOT NULL,
    project_id      VARCHAR(36)  NULL,
    drone_id        VARCHAR(36)  NULL,
    correlation_id  VARCHAR(36)  NOT NULL,
    message         TEXT         NOT NULL,
    payload_json    TEXT         NOT NULL DEFAULT '{}',
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_audit_events_ext_decision CHECK (decision IN ('allow', 'deny', 'error'))
);
CREATE INDEX IF NOT EXISTS ix_audit_events_ext_action ON audit_events_ext (action);
CREATE INDEX IF NOT EXISTS ix_audit_events_ext_actor ON audit_events_ext (actor_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_ext_corr ON audit_events_ext (correlation_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_ext_occurred ON audit_events_ext (occurred_at);

-- GateValidation — G0..G5 progress tracking (cahier des charges §22)
CREATE TABLE IF NOT EXISTS gate_validations (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id    VARCHAR(36)  NOT NULL,
    gate          VARCHAR(20)  NOT NULL,
    state         VARCHAR(20)  NOT NULL DEFAULT 'pending',
    reviewer_id   VARCHAR(255) NOT NULL,
    evidence_json TEXT         NOT NULL DEFAULT '{}',
    approved_at   TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, gate),
    CONSTRAINT ck_gate_validations_gate CHECK (gate IN ('G0_gel', 'G1_securite', 'G2_fiabilite', 'G3_banc', 'G4_qualification', 'G5_exploitation')),
    CONSTRAINT ck_gate_validations_state CHECK (state IN ('pending', 'approved', 'rejected', 'revoked'))
);
CREATE INDEX IF NOT EXISTS ix_gate_validations_project ON gate_validations (project_id);
CREATE INDEX IF NOT EXISTS ix_gate_validations_reviewer ON gate_validations (reviewer_id);
ALTER TABLE gate_validations ADD CONSTRAINT fk_gate_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE;
ALTER TABLE gate_validations ADD CONSTRAINT fk_gate_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE CASCADE;

-- Extend Mission table with upload state machine columns (FUNC-05 fix)
ALTER TABLE missions ADD COLUMN IF NOT EXISTS upload_state VARCHAR(20) DEFAULT 'pending';
ALTER TABLE missions ADD COLUMN IF NOT EXISTS upload_started_at TIMESTAMPTZ NULL;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS upload_error TEXT NULL;
-- P0-04 fix — protocol trace + idempotency key so duplicate upload attempts
-- can be detected even after a worker restart.
ALTER TABLE missions ADD COLUMN IF NOT EXISTS upload_protocol VARCHAR(60) NULL;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS upload_idempotency_key VARCHAR(120) NULL;
CREATE INDEX IF NOT EXISTS ix_missions_upload_idempotency_key ON missions (upload_idempotency_key);

-- EXIGENCE SYNC-02 — pointer to the active DroneRevision on the drone row.
-- Non-FK string pointer so the legacy schema remains valid even when the
-- canonical migration is only partially applied.
ALTER TABLE drones ADD COLUMN IF NOT EXISTS active_revision_id VARCHAR(36) NULL;
CREATE INDEX IF NOT EXISTS ix_drones_active_revision_id ON drones (active_revision_id);

-- V5 LOT B / R-04 — persistent anonymous workspaces (replaces the in-memory dict).
-- Sliding TTL via the expires_at column; expired rows are lazily purged on access.
CREATE TABLE IF NOT EXISTS anonymous_workspaces (
    id           VARCHAR(43)  NOT NULL PRIMARY KEY,  -- workspace_key (opaque, ≥122 bits entropy)
    data_json    TEXT         NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ  NOT NULL,
    origin_ip    VARCHAR(64)  NULL
);
CREATE INDEX IF NOT EXISTS ix_anonymous_workspaces_expires ON anonymous_workspaces (expires_at);
CREATE INDEX IF NOT EXISTS ix_anonymous_workspaces_origin_ip ON anonymous_workspaces (origin_ip);

COMMIT;

-- === ROLLBACK SCRIPT (reversible) ===
-- Run these statements in reverse order to revert the migration.
-- WARNING: rolling back will LOSE all data in the new tables.
--
-- BEGIN;
-- DROP TABLE IF EXISTS gate_validations CASCADE;
-- DROP TABLE IF EXISTS audit_events_ext CASCADE;
-- DROP TABLE IF EXISTS event_outbox CASCADE;
-- DROP TABLE IF EXISTS hardware_tokens CASCADE;
-- DROP TABLE IF EXISTS geofence_records CASCADE;
-- DROP TABLE IF EXISTS measurements CASCADE;
-- DROP TABLE IF EXISTS test_runs CASCADE;
-- DROP TABLE IF EXISTS lab_sessions CASCADE;
-- DROP TABLE IF EXISTS drone_revisions CASCADE;
-- DROP INDEX IF EXISTS ix_anonymous_workspaces_origin_ip;
-- DROP INDEX IF EXISTS ix_anonymous_workspaces_expires;
-- DROP TABLE IF EXISTS anonymous_workspaces CASCADE;
-- DROP INDEX IF EXISTS ix_drones_active_revision_id;
-- ALTER TABLE drones DROP COLUMN IF EXISTS active_revision_id;
-- DROP INDEX IF EXISTS ix_missions_upload_idempotency_key;
-- ALTER TABLE missions DROP COLUMN IF EXISTS upload_idempotency_key;
-- ALTER TABLE missions DROP COLUMN IF EXISTS upload_protocol;
-- ALTER TABLE missions DROP COLUMN IF EXISTS upload_state;
-- ALTER TABLE missions DROP COLUMN IF EXISTS upload_started_at;
-- ALTER TABLE missions DROP COLUMN IF EXISTS upload_error;
-- COMMIT;
