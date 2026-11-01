

-- ============================================================================
-- WARNING (P0-06 fix, INSPECT-BACKEND B-CRIT-07):
-- This file is a MINIMAL bootstrap covering only 3 tables (audit_events,
-- admin_accounts, admin_account_events). For a complete TiDB deployment
-- you MUST ALSO apply, in order:
--   1. migrations/2026-10-21_admin_account_registry_tidb.sql
--   2. migrations/2026-10-21_validation_audit_events.sql
--   3. migrations/2026-10-25_canonical_labbench_schema_tidb.sql
-- Failing to do so will leave the database without users, projects, drones,
-- lab_sessions, missions, hardware_tokens, gate_validations, etc.
-- See TIDB_SETUP_FR.md for the full deployment procedure.
-- ============================================================================


-- Persistent owner-scoped validation journal (required by auditEvents.list/record).
CREATE TABLE audit_events (
    id VARCHAR(36) NOT NULL,
    project_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    actor_role VARCHAR(40) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    message TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    occurred_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_audit_events_project_id ON audit_events (project_id);
CREATE INDEX ix_audit_events_user_id ON audit_events (user_id);
CREATE INDEX ix_audit_events_project_created ON audit_events (project_id, created_at);

-- Persistent allowlist for users who already have a Microsoft Entra identity.
CREATE TABLE admin_accounts (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(320) NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY ix_admin_accounts_email (email)
);

CREATE TABLE admin_account_events (
    id VARCHAR(36) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    actor_email VARCHAR(320) NOT NULL,
    target_user_id VARCHAR(255) NULL,
    payload_json TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY ix_admin_account_events_event_type (event_type),
    KEY ix_admin_account_events_actor_id (actor_id),
    KEY ix_admin_account_events_target_user_id (target_user_id),
    KEY ix_admin_account_events_created_at (created_at)
);
