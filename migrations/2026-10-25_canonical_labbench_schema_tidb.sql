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

-- P0-06 fix (INSPECT-BACKEND B-CRIT-06): lab_sessions.id must be VARCHAR(128) to
-- match the PostgreSQL variant and the ORM (LabSession.id is generated via
-- secrets.token_urlsafe(48) which produces ~64-char strings; VARCHAR(36) would
-- silently truncate them and break session lookups).
CREATE TABLE IF NOT EXISTS lab_sessions (
    id              VARCHAR(128) NOT NULL PRIMARY KEY,
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
    -- P0-06 fix: data_json is REQUIRED by the LabSession ORM (canonical_models.py
    -- declares data_json nullable=False). Without this column, every INSERT into
    -- lab_sessions on TiDB raised "Field 'data_json' doesn't have a default value"
    -- and step-up session issuance silently fell back to in-memory only.
    -- LONGTEXT cannot have a DEFAULT in MySQL/TiDB strict mode, so NOT NULL is
    -- used and the ORM always supplies a value via session_store._db_persist_session.
    data_json       LONGTEXT     NOT NULL,
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

-- ============================================================================
-- P0-06 fix (INSPECT-BACKEND B-CRIT-06): make the missions ALTER TABLE
-- statements idempotent.
--
-- TiDB does NOT support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (the
-- PostgreSQL variant relies on it). Running this migration twice on TiDB
-- previously failed with "Duplicate column name" on the second run, which
-- blocked re-applying the canonical migration on already-initialised TiDB
-- deployments.
--
-- The workaround is the standard information_schema guard + prepared
-- statement pattern (TiDB / MySQL 5.7 idiom):
--   1. SELECT COUNT(*) FROM information_schema.columns WHERE column exists
--   2. Build the ALTER as a string only if the column is missing
--   3. PREPARE / EXECUTE / DEALLOCATE the dynamic statement
-- The single quotes inside the prepared SQL string are doubled ('') to
-- escape them per the MySQL/TiDB string literal syntax.
--
-- Columns added:
--   upload_state           VARCHAR(20)  DEFAULT 'pending'  (FUNC-05 state machine)
--   upload_started_at      DATETIME     NULL                (FUNC-05)
--   upload_error           TEXT         NULL                (FUNC-05)
--   upload_protocol        VARCHAR(20)  NULL                (P0-04 fix — was
--                                                              missing in TiDB
--                                                              variant; PG has
--                                                              VARCHAR(60), TiDB
--                                                              uses VARCHAR(20)
--                                                              per P0-04 spec)
--   upload_idempotency_key VARCHAR(128) NULL + INDEX        (P0-04 fix — was missing
--                                                              in TiDB variant;
--                                                              PG uses VARCHAR(120),
--                                                              TiDB uses VARCHAR(128)
--                                                              per P0-04 spec)
-- ============================================================================

-- upload_state (FUNC-05: mission upload state machine)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='missions' AND column_name='upload_state');
SET @sql = IF(@col_exists=0, 'ALTER TABLE missions ADD COLUMN upload_state VARCHAR(20) DEFAULT ''pending''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- upload_started_at (FUNC-05: when the upload was initiated)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='missions' AND column_name='upload_started_at');
SET @sql = IF(@col_exists=0, 'ALTER TABLE missions ADD COLUMN upload_started_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- upload_error (FUNC-05: last error message from the upload state machine)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='missions' AND column_name='upload_error');
SET @sql = IF(@col_exists=0, 'ALTER TABLE missions ADD COLUMN upload_error TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- upload_protocol (P0-04 fix — protocol trace for duplicate upload detection;
-- was present in the PostgreSQL variant but missing from the TiDB variant)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='missions' AND column_name='upload_protocol');
SET @sql = IF(@col_exists=0, 'ALTER TABLE missions ADD COLUMN upload_protocol VARCHAR(20) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- upload_idempotency_key (P0-04 fix — server-side idempotency for uploads;
-- was present in the PostgreSQL variant but missing from the TiDB variant)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='missions' AND column_name='upload_idempotency_key');
SET @sql = IF(@col_exists=0, 'ALTER TABLE missions ADD COLUMN upload_idempotency_key VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index ix_missions_upload_idem on upload_idempotency_key (P0-04 fix)
-- Idempotent: only create the index if it doesn't already exist.
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='missions' AND index_name='ix_missions_upload_idem');
SET @sql = IF(@idx_exists=0, 'CREATE INDEX ix_missions_upload_idem ON missions (upload_idempotency_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- P0-06 fix (INSPECT-BACKEND B-CRIT-06): missing tables vs PostgreSQL variant.
-- The PostgreSQL migration declares `anonymous_workspaces` (V5 LOT B / R-04)
-- and re-declares `gate_validations` (referenced by web/app.py:230-329 for
-- anonymous workspaces, and by canonical_models.py:359 / hardware_gate.py for
-- gate validations). The previous TiDB variant was missing `anonymous_workspaces`
-- entirely, and its `gate_validations` definition differed in column widths and
-- the `evidence_json` default. Both are re-declared here with `IF NOT EXISTS`
-- so this migration remains safe to apply on top of a partially-bootstrapped
-- TiDB schema (TIDB_SCHEMA.sql created an earlier `gate_validations` row).
-- ============================================================================
CREATE TABLE IF NOT EXISTS anonymous_workspaces (
  id VARCHAR(128) NOT NULL PRIMARY KEY,
  workspace_key VARCHAR(128) NOT NULL,
  user_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  data_json LONGTEXT NULL,
  INDEX ix_anon_workspaces_key (workspace_key),
  INDEX ix_anon_workspaces_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gate_validations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  gate VARCHAR(20) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewer_id VARCHAR(64) NOT NULL,
  evidence_json LONGTEXT NOT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_gate_validations_project (project_id),
  UNIQUE KEY uq_gate_per_project (project_id, gate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
