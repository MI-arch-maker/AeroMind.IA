-- Additive migration for TiDB/MySQL deployments. Apply before deploying with schema bootstrap disabled.
CREATE TABLE IF NOT EXISTS admin_accounts (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(320) NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY ix_admin_accounts_email (email)
);

CREATE TABLE IF NOT EXISTS admin_account_events (
    id VARCHAR(36) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    actor_email VARCHAR(320) NOT NULL,
    target_user_id VARCHAR(255) NULL,
    payload_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_admin_account_events_event_type (event_type),
    KEY ix_admin_account_events_actor_id (actor_id),
    KEY ix_admin_account_events_target_user_id (target_user_id),
    KEY ix_admin_account_events_created_at (created_at)
);
