-- Additive migration for existing AeroMind deployments.
-- Apply once with a TiDB administrator before deploying the validation-journal API.
CREATE TABLE IF NOT EXISTS audit_events (
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
    KEY ix_audit_events_project_id (project_id),
    KEY ix_audit_events_user_id (user_id),
    KEY ix_audit_events_project_created (project_id, created_at),
    CONSTRAINT fk_audit_events_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
