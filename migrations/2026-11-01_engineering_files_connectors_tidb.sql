-- TiDB/MySQL variant of 2026-11-01_engineering_files_connectors.sql.
-- Additive only. TiDB's DDL may auto-commit; uploaded bytes stay on a private volume.
CREATE TABLE IF NOT EXISTS engineering_artifacts (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id          VARCHAR(36)  NOT NULL,
    user_id             VARCHAR(255) NOT NULL,
    cell_id             VARCHAR(36)  NULL,
    profile_id          VARCHAR(120) NOT NULL,
    original_filename   VARCHAR(255) NOT NULL,
    declared_mime_type  VARCHAR(255) NULL,
    byte_size           BIGINT       NOT NULL,
    sha256              CHAR(64)     NOT NULL,
    storage_key         VARCHAR(80)  NOT NULL,
    status              VARCHAR(40)  NOT NULL DEFAULT 'quarantined',
    scan_status         VARCHAR(40)  NOT NULL DEFAULT 'not_scanned',
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at        DATETIME     NULL,
    UNIQUE KEY uq_engineering_artifacts_storage_key (storage_key),
    KEY ix_engineering_artifacts_project (project_id),
    KEY ix_engineering_artifacts_user (user_id),
    KEY ix_engineering_artifacts_cell (cell_id),
    KEY ix_engineering_artifacts_sha256 (sha256),
    KEY ix_engineering_artifacts_status (status),
    CONSTRAINT fk_engineering_artifacts_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_artifacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_artifacts_cell FOREIGN KEY (cell_id) REFERENCES drones(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS engineering_jobs (
    id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id              VARCHAR(36)  NOT NULL,
    user_id                 VARCHAR(255) NOT NULL,
    artifact_id             VARCHAR(36)  NOT NULL,
    source_job_id           VARCHAR(36)  NULL,
    job_type                VARCHAR(32)  NOT NULL DEFAULT 'import',
    profile_id              VARCHAR(120) NOT NULL,
    status                  VARCHAR(40)  NOT NULL DEFAULT 'queued',
    phase                   VARCHAR(60)  NOT NULL DEFAULT 'quarantine',
    idempotency_key         VARCHAR(64)  NOT NULL,
    input_sha256            CHAR(64)     NOT NULL,
    options_json            LONGTEXT     NOT NULL,
    report_json             LONGTEXT     NOT NULL,
    normalized_storage_key  VARCHAR(80)  NULL,
    output_storage_key      VARCHAR(80)  NULL,
    error_code              VARCHAR(80)  NULL,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at              DATETIME     NULL,
    completed_at            DATETIME     NULL,
    committed_at            DATETIME     NULL,
    UNIQUE KEY uq_engineering_job_idempotency (user_id, project_id, idempotency_key),
    KEY ix_engineering_jobs_project (project_id),
    KEY ix_engineering_jobs_user (user_id),
    KEY ix_engineering_jobs_artifact (artifact_id),
    KEY ix_engineering_jobs_source (source_job_id),
    KEY ix_engineering_jobs_input_sha256 (input_sha256),
    KEY ix_engineering_jobs_status_created (status, created_at),
    KEY ix_engineering_jobs_project_status (project_id, status),
    CONSTRAINT fk_engineering_jobs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_jobs_artifact FOREIGN KEY (artifact_id) REFERENCES engineering_artifacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_jobs_source FOREIGN KEY (source_job_id) REFERENCES engineering_jobs(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS engineering_simulation_runs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NOT NULL,
    user_id         VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(64)  NOT NULL,
    scenario_id     VARCHAR(120) NOT NULL,
    mode            VARCHAR(32)  NOT NULL DEFAULT 'internal',
    status          VARCHAR(32)  NOT NULL DEFAULT 'completed',
    evidence_level  VARCHAR(40)  NOT NULL,
    report_json     LONGTEXT     NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_engineering_simulation_idempotency (user_id, project_id, idempotency_key),
    KEY ix_engineering_simulation_runs_project (project_id),
    KEY ix_engineering_simulation_runs_user (user_id),
    CONSTRAINT fk_engineering_simulation_runs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_engineering_simulation_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- === ROLLBACK SCRIPT (manual; destructive to data stored in these new tables)
-- DROP TABLE IF EXISTS engineering_simulation_runs;
-- DROP TABLE IF EXISTS engineering_jobs;
-- DROP TABLE IF EXISTS engineering_artifacts;
-- Run those statements manually only after taking a backup and approving data loss.
