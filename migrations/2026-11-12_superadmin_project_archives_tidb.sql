-- Dedicated Super-Admin archive; intentionally has no foreign keys.
CREATE TABLE IF NOT EXISTS superadmin_project_archives (
    id VARCHAR(36) NOT NULL,
    original_project_id VARCHAR(36) NOT NULL,
    owner_id VARCHAR(255) NOT NULL,
    owner_email VARCHAR(320) NULL,
    project_name VARCHAR(200) NOT NULL,
    archive_reason VARCHAR(80) NOT NULL,
    archived_by VARCHAR(255) NOT NULL,
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sha256 VARCHAR(64) NOT NULL,
    snapshot_json TEXT NOT NULL,
    PRIMARY KEY (id),
    KEY ix_superadmin_project_archives_project (original_project_id),
    KEY ix_superadmin_project_archives_owner (owner_id),
    KEY ix_superadmin_project_archives_reason (archive_reason),
    KEY ix_superadmin_project_archives_archived_at (archived_at)
);
