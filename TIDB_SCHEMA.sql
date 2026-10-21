

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
