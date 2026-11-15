-- ICX project lifecycle: user deletion is logical archival; Super-Admin owns purge/restore.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255) NULL;
CREATE INDEX IF NOT EXISTS ix_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS ix_projects_deleted_at ON projects (deleted_at);
