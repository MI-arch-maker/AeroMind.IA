-- P2-10 fix — Legacy bootstrap migration for ORM-managed tables.
--
-- Problem: migrations/2026-10-21_validation_audit_events.sql declares FK
-- constraints referencing projects(id) and users(id), but NO migration creates
-- those tables. They were previously created at runtime via
-- Base.metadata.create_all() (AEROMIND_AUTO_CREATE_SCHEMA=true). In production
-- where AEROMIND_AUTO_CREATE_SCHEMA=false, apply_migrations.sh fails on a
-- fresh DB with "relation 'projects' does not exist".
--
-- This migration creates the legacy ORM tables with CREATE TABLE IF NOT EXISTS
-- so it is idempotent and safe to run on databases where create_all() has
-- already run. Column types match the SQLAlchemy ORM definitions in web/models.py.
-- This makes the migration chain self-contained: a fresh DB can be bootstrapped
-- purely via apply_migrations.sh without relying on runtime schema creation.

-- users (web/models.py: class User)
CREATE TABLE IF NOT EXISTS users (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- projects (web/models.py: class Project)
CREATE TABLE IF NOT EXISTS projects (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT         NULL,
    config_json     TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects (user_id);

-- drones (web/models.py: class Drone)
CREATE TABLE IF NOT EXISTS drones (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    config_json     TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_drones_project_id ON drones (project_id);

-- missions (web/models.py: class Mission)
CREATE TABLE IF NOT EXISTS missions (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id          VARCHAR(36)  NULL REFERENCES projects(id) ON DELETE SET NULL,
    user_id             VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    waypoints_json      TEXT         NULL,
    uploaded_to_drone_id VARCHAR(36) NULL,
    upload_state        VARCHAR(20)  NULL DEFAULT 'pending',
    upload_started_at   TIMESTAMPTZ  NULL,
    upload_error        TEXT         NULL,
    upload_protocol     VARCHAR(60)  NULL,
    upload_idempotency_key VARCHAR(128) NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_missions_project_id ON missions (project_id);
CREATE INDEX IF NOT EXISTS ix_missions_user_id ON missions (user_id);

-- simulations (web/models.py: class Simulation)
CREATE TABLE IF NOT EXISTS simulations (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    state           VARCHAR(30)  NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ  NULL,
    completed_at    TIMESTAMPTZ  NULL,
    results_json    TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_simulations_project_id ON simulations (project_id);

-- reports (web/models.py: class Report)
CREATE TABLE IF NOT EXISTS reports (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    content         TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_reports_project_id ON reports (project_id);

-- waypoints (web/models.py: class Waypoint)
CREATE TABLE IF NOT EXISTS waypoints (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    mission_id      VARCHAR(36)  NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    sequence        INTEGER      NOT NULL,
    latitude        DOUBLE PRECISION NULL,
    longitude       DOUBLE PRECISION NULL,
    altitude_m      DOUBLE PRECISION NULL,
    command         VARCHAR(60)  NULL DEFAULT 'NAV_WAYPOINT',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_waypoints_mission_id ON waypoints (mission_id);

-- user_settings (web/models.py: class UserSetting)
CREATE TABLE IF NOT EXISTS user_settings (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id         VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "key"           VARCHAR(120) NOT NULL,
    value           TEXT         NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, "key")
);
CREATE INDEX IF NOT EXISTS ix_user_settings_user_id ON user_settings (user_id);

-- hardware_logs (web/models.py: class HardwareLog)
CREATE TABLE IF NOT EXISTS hardware_logs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NULL REFERENCES projects(id) ON DELETE SET NULL,
    drone_id        VARCHAR(36)  NULL,
    event_type      VARCHAR(60)  NOT NULL,
    message         TEXT         NULL,
    payload_json    TEXT         NULL,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_hardware_logs_project_id ON hardware_logs (project_id);

-- audit_events (web/models.py: class AuditEvent — legacy, pre-canonical)
CREATE TABLE IF NOT EXISTS audit_events (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NULL,
    user_id         VARCHAR(36)  NULL,
    actor_role      VARCHAR(30)  NULL,
    event_type      VARCHAR(60)  NOT NULL,
    message         TEXT         NULL,
    payload_json    TEXT         NULL,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_audit_events_project_id ON audit_events (project_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_user_id ON audit_events (user_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_event_type ON audit_events (event_type);

-- fleet_telemetry_samples (web/models.py: class FleetTelemetrySample)
CREATE TABLE IF NOT EXISTS fleet_telemetry_samples (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    sample_time     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    latitude        DOUBLE PRECISION NULL,
    longitude       DOUBLE PRECISION NULL,
    altitude_m      DOUBLE PRECISION NULL,
    velocity_ms     DOUBLE PRECISION NULL,
    heading_deg     DOUBLE PRECISION NULL,
    battery_pct     DOUBLE PRECISION NULL,
    payload_json    TEXT         NULL
);
CREATE INDEX IF NOT EXISTS ix_fleet_telemetry_drone_time ON fleet_telemetry_samples (drone_id, sample_time);
CREATE INDEX IF NOT EXISTS ix_fleet_telemetry_project_id ON fleet_telemetry_samples (project_id);

-- Record this migration in schema_migrations (P2-08)
INSERT INTO schema_migrations (id, applied_at)
VALUES ('2026-10-21_legacy_bootstrap', NOW())
ON CONFLICT (id) DO NOTHING;
