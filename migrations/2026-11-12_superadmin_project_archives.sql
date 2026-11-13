-- Dedicated Super-Admin archive for deleted projects and deleted-account workspaces.
-- No foreign keys by design: the archive must survive account/project deletion.
CREATE TABLE IF NOT EXISTS superadmin_project_archives (
    id VARCHAR(36) PRIMARY KEY,
    original_project_id VARCHAR(36) NOT NULL,
    owner_id VARCHAR(255) NOT NULL,
    owner_email VARCHAR(320),
    project_name VARCHAR(200) NOT NULL,
    archive_reason VARCHAR(80) NOT NULL,
    archived_by VARCHAR(255) NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sha256 VARCHAR(64) NOT NULL,
    snapshot_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_superadmin_project_archives_project ON superadmin_project_archives (original_project_id);
CREATE INDEX IF NOT EXISTS ix_superadmin_project_archives_owner ON superadmin_project_archives (owner_id);
CREATE INDEX IF NOT EXISTS ix_superadmin_project_archives_reason ON superadmin_project_archives (archive_reason);
CREATE INDEX IF NOT EXISTS ix_superadmin_project_archives_archived_at ON superadmin_project_archives (archived_at);
