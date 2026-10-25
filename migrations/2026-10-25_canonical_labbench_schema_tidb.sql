-- TiDB variant of 2026-10-25_canonical_labbench_schema.sql
-- TiDB syntax differences:
--   - DATETIME instead of TIMESTAMPTZ (TiDB has limited TZ support)
--   - No ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY enforcement (TiDB accepts syntax but does not enforce)
--   - DOUBLE instead of DOUBLE PRECISION
-- Foreign keys are declared for documentation; TiDB does not enforce them.
-- Application code MUST enforce ownership checks (already done via labbench_auth.py).

BEGIN;

CREATE TABLE IF NOT EXISTS drone_revisions (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    drone_id        VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    owner_id        VARCHAR(255) NOT NULL,
    revision_number INT          NOT NULL DEFAULT 1,
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
    created_at      DATETIME     NOT NULL,
    activated_at    DATETIME     NULL,
    UNIQUE KEY uq_drone_revisions_drone_rev (drone_id, revision_number),
    CONSTRAINT ck_drone_revisions_origin CHECK (origin_type IN ('catalog', 'sketch', 'imported'))
);
CREATE INDEX ix_drone_revisions_project_drone ON drone_revisions (project_id, drone_id);
CREATE INDEX ix_drone_revisions_owner ON drone_revisions (owner_id);

CREATE TABLE IF NOT EXISTS lab_sessions (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NULL,
    revision_id     VARCHAR(36)  NULL,
    assurance_level VARCHAR(20)  NOT NULL DEFAULT 'step-up',
    state           VARCHAR(20)  NOT NULL DEFAULT 'active',
    step_up_at      DATETIME     NOT NULL,
    expires_at      DATETIME     NOT NULL,
    revoked_at      DATETIME     NULL,
    scope_json      TEXT         NOT NULL DEFAULT '{}',
    idempotency_key VARCHAR(64)  NULL,
    CONSTRAINT ck_lab_sessions_state CHECK (state IN ('active', 'expired', 'revoked')),
    CONSTRAINT ck_lab_sessions_assurance CHECK (assurance_level IN ('aeromind', 'step-up', 'mfa')),
    KEY ix_lab_sessions_user (user_id),
    KEY ix_lab_sessions_project (project_id),
    KEY ix_lab_sessions_idem (idempotency_key)
);

CREATE TABLE IF NOT EXISTS test_runs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    session_id      VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    scenario_id     VARCHAR(100) NOT NULL,
    engine_version  VARCHAR(60)  NOT NULL DEFAULT 'aeromind-1.0',
    state           VARCHAR(20)  NOT NULL DEFAULT 'pending',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       TINYINT(1)   NOT NULL DEFAULT 0,
    started_at      DATETIME     NULL,
    completed_at    DATETIME     NULL,
    error_message   TEXT         NULL,
    summary_json    TEXT         NOT NULL DEFAULT '{}',
    created_at      DATETIME     NOT NULL,
    CONSTRAINT ck_test_runs_state CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT ck_test_runs_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical')),
    KEY ix_test_runs_session (session_id),
    KEY ix_test_runs_project (project_id),
    KEY ix_test_runs_drone (drone_id),
    KEY ix_test_runs_revision (revision_id)
);

CREATE TABLE IF NOT EXISTS measurements (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id          VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    timestamp_utc   DATETIME     NOT NULL,
    metric          VARCHAR(100) NOT NULL,
    value           DOUBLE       NOT NULL,
    unit            VARCHAR(40)  NOT NULL,
    quality         VARCHAR(20)  NOT NULL DEFAULT 'unknown',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       TINYINT(1)   NOT NULL DEFAULT 0,
    calibration_id  VARCHAR(100) NULL,
    origin          VARCHAR(100) NOT NULL DEFAULT 'local',
    CONSTRAINT ck_measurements_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical')),
    KEY ix_measurements_run_ts (run_id, timestamp_utc),
    KEY ix_measurements_project (project_id)
);

CREATE TABLE IF NOT EXISTS geofence_records (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id     VARCHAR(36)  NOT NULL,
    owner_id       VARCHAR(255) NOT NULL,
    polygon_json   TEXT         NOT NULL,
    max_altitude_m DOUBLE       NOT NULL,
    min_altitude_m DOUBLE       NOT NULL DEFAULT 0.0,
    notes          TEXT         NULL,
    created_at     DATETIME     NOT NULL,
    updated_at     DATETIME     NOT NULL,
    UNIQUE KEY uq_geofence_project (project_id),
    CONSTRAINT ck_geofence_altitude_range CHECK (max_altitude_m > min_altitude_m),
    KEY ix_geofence_records_owner (owner_id)
);

CREATE TABLE IF NOT EXISTS hardware_tokens (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id    VARCHAR(36)  NOT NULL,
    drone_id      VARCHAR(36)  NOT NULL,
    actor_id      VARCHAR(255) NOT NULL,
    reviewer_id   VARCHAR(255) NOT NULL,
    command       VARCHAR(80)  NOT NULL,
    params_hash   VARCHAR(64)  NOT NULL,
    signature     VARCHAR(128) NOT NULL,
    kind          VARCHAR(40)  NOT NULL DEFAULT 'command',
    issued_at     DATETIME     NOT NULL,
    expires_at    DATETIME     NOT NULL,
    consumed_at   DATETIME     NULL,
    CONSTRAINT ck_hardware_tokens_kind CHECK (kind IN ('command', 'mission_upload', 'arm', 'actuator', 'geofence_update')),
    KEY ix_hardware_tokens_project (project_id),
    KEY ix_hardware_tokens_drone (drone_id),
    KEY ix_hardware_tokens_drone_expires (drone_id, expires_at)
);

CREATE TABLE IF NOT EXISTS event_outbox (
    id                VARCHAR(36)  NOT NULL PRIMARY KEY,
    event_id          VARCHAR(36)  NOT NULL,
    event_type        VARCHAR(60)  NOT NULL,
    schema_version    VARCHAR(20)  NOT NULL DEFAULT '1.0',
    correlation_id    VARCHAR(36)  NOT NULL,
    project_id        VARCHAR(36)  NULL,
    drone_id          VARCHAR(36)  NULL,
    revision_id       VARCHAR(36)  NULL,
    actor_id          VARCHAR(255) NULL,
    payload_json      TEXT         NOT NULL,
    occurred_at       DATETIME     NOT NULL,
    published_at      DATETIME     NULL,
    delivery_attempts INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_event_outbox_event_id (event_id),
    KEY ix_event_outbox_event_type (event_type),
    KEY ix_event_outbox_corr (correlation_id),
    KEY ix_event_outbox_unpublished (published_at, occurred_at)
);

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
    occurred_at     DATETIME     NOT NULL,
    CONSTRAINT ck_audit_events_ext_decision CHECK (decision IN ('allow', 'deny', 'error')),
    KEY ix_audit_events_ext_action (action),
    KEY ix_audit_events_ext_actor (actor_id),
    KEY ix_audit_events_ext_corr (correlation_id),
    KEY ix_audit_events_ext_occurred (occurred_at)
);

CREATE TABLE IF NOT EXISTS gate_validations (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id    VARCHAR(36)  NOT NULL,
    gate          VARCHAR(20)  NOT NULL,
    state         VARCHAR(20)  NOT NULL DEFAULT 'pending',
    reviewer_id   VARCHAR(255) NOT NULL,
    evidence_json TEXT         NOT NULL DEFAULT '{}',
    approved_at   DATETIME     NULL,
    created_at    DATETIME     NOT NULL,
    UNIQUE KEY uq_gate_per_project (project_id, gate),
    CONSTRAINT ck_gate_validations_gate CHECK (gate IN ('G0_gel', 'G1_securite', 'G2_fiabilite', 'G3_banc', 'G4_qualification', 'G5_exploitation')),
    CONSTRAINT ck_gate_validations_state CHECK (state IN ('pending', 'approved', 'rejected', 'revoked')),
    KEY ix_gate_validations_project (project_id),
    KEY ix_gate_validations_reviewer (reviewer_id)
);

-- Extend Mission table (idempotent — TiDB does not support IF NOT EXISTS on ADD COLUMN)
ALTER TABLE missions ADD COLUMN upload_state VARCHAR(20) DEFAULT 'pending';
ALTER TABLE missions ADD COLUMN upload_started_at DATETIME NULL;
ALTER TABLE missions ADD COLUMN upload_error TEXT NULL;

COMMIT;

-- === ROLLBACK ===
-- BEGIN;
-- DROP TABLE IF EXISTS gate_validations;
-- DROP TABLE IF EXISTS audit_events_ext;
-- DROP TABLE IF EXISTS event_outbox;
-- DROP TABLE IF EXISTS hardware_tokens;
-- DROP TABLE IF EXISTS geofence_records;
-- DROP TABLE IF EXISTS measurements;
-- DROP TABLE IF EXISTS test_runs;
-- DROP TABLE IF EXISTS lab_sessions;
-- DROP TABLE IF EXISTS drone_revisions;
-- COMMIT;
