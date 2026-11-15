-- ICX project lifecycle: user deletion is logical archival; Super-Admin owns purge/restore.
ALTER TABLE projects ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE projects ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE projects ADD COLUMN deleted_by VARCHAR(255) NULL;
CREATE INDEX ix_projects_status ON projects (status);
CREATE INDEX ix_projects_deleted_at ON projects (deleted_at);
