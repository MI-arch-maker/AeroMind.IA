-- AeroMind engineering file jobs, persistent reports, and internal model runs.
-- Additive only. Uploaded bytes are stored on a private volume, never in SQL.
BEGIN;

CREATE TABLE IF NOT EXISTS engineering_artifacts (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id          VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id             VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cell_id             VARCHAR(36)  NULL REFERENCES drones(id) ON DELETE SET NULL,
    profile_id          VARCHAR(120) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    declared_mime_type  VARCHAR(255) NULL,
    byte_size           BIGINT       NOT NULL CHECK (byte_size > 0),
    sha256              CHAR(64)     NOT NULL,
    storage_key         VARCHAR(80)  NOT NULL UNIQUE,
    status              VARCHAR(40)  NOT NULL DEFAULT 'quarantined',
    scan_status         VARCHAR(40)  NOT NULL DEFAULT 'not_scanned',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    committed_at        TIMESTAMPTZ  NULL
);
CREATE INDEX IF NOT EXISTS ix_engineering_artifacts_project ON engineering_artifacts(project_id);
CREATE INDEX IF NOT EXISTS ix_engineering_artifacts_user ON engineering_artifacts(user_id);
CREATE INDEX IF NOT EXISTS ix_engineering_artifacts_cell ON engineering_artifacts(cell_id);
CREATE INDEX IF NOT EXISTS ix_engineering_artifacts_sha256 ON engineering_artifacts(sha256);
CREATE INDEX IF NOT EXISTS ix_engineering_artifacts_status ON engineering_artifacts(status);

CREATE TABLE IF NOT EXISTS engineering_jobs (
    id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id              VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id                 VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artifact_id             VARCHAR(36)  NOT NULL REFERENCES engineering_artifacts(id) ON DELETE CASCADE,
    source_job_id           VARCHAR(36)  NULL REFERENCES engineering_jobs(id) ON DELETE SET NULL,
    job_type                VARCHAR(32)  NOT NULL DEFAULT 'import',
    profile_id              VARCHAR(120) NOT NULL,
    status                  VARCHAR(40)  NOT NULL DEFAULT 'queued',
    phase                   VARCHAR(60)  NOT NULL DEFAULT 'quarantine',
    idempotency_key         VARCHAR(64)  NOT NULL,
    input_sha256            CHAR(64)     NOT NULL,
    options_json            TEXT         NOT NULL DEFAULT '{}',
    report_json             TEXT         NOT NULL DEFAULT '{}',
    normalized_storage_key  VARCHAR(80)  NULL,
    output_storage_key      VARCHAR(80)  NULL,
    error_code              VARCHAR(80)  NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at              TIMESTAMPTZ  NULL,
    completed_at            TIMESTAMPTZ  NULL,
    committed_at            TIMESTAMPTZ  NULL,
    CONSTRAINT uq_engineering_job_idempotency UNIQUE (user_id, project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_project ON engineering_jobs(project_id);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_user ON engineering_jobs(user_id);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_artifact ON engineering_jobs(artifact_id);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_source ON engineering_jobs(source_job_id);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_input_sha256 ON engineering_jobs(input_sha256);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_status_created ON engineering_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS ix_engineering_jobs_project_status ON engineering_jobs(project_id, status);

CREATE TABLE IF NOT EXISTS engineering_simulation_runs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(64)  NOT NULL,
    scenario_id     VARCHAR(120) NOT NULL,
    mode            VARCHAR(32)  NOT NULL DEFAULT 'internal',
    status          VARCHAR(32)  NOT NULL DEFAULT 'completed',
    evidence_level  VARCHAR(40)  NOT NULL,
    report_json     TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_engineering_simulation_idempotency UNIQUE (user_id, project_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_engineering_simulation_runs_project ON engineering_simulation_runs(project_id);
CREATE INDEX IF NOT EXISTS ix_engineering_simulation_runs_user ON engineering_simulation_runs(user_id);

COMMIT;

-- === ROLLBACK SCRIPT (manual; destructive to data stored in these new tables)
-- BEGIN;
-- DROP TABLE IF EXISTS engineering_simulation_runs;
-- DROP TABLE IF EXISTS engineering_jobs;
-- DROP TABLE IF EXISTS engineering_artifacts;
-- COMMIT;
-- Run those statements manually only after taking a backup and approving data loss.
