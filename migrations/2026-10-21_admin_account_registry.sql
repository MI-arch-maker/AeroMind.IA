-- AeroMind admin-account registry in the main relational database.
-- Apply before deploying with AEROMIND_AUTO_CREATE_SCHEMA=false.
CREATE TABLE IF NOT EXISTS admin_accounts (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(320) NOT NULL UNIQUE,
    data_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_account_events (
    id VARCHAR(36) PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    actor_email VARCHAR(320) NOT NULL,
    target_user_id VARCHAR(255),
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_admin_account_events_event_type ON admin_account_events (event_type);
CREATE INDEX IF NOT EXISTS ix_admin_account_events_actor_id ON admin_account_events (actor_id);
CREATE INDEX IF NOT EXISTS ix_admin_account_events_target_user_id ON admin_account_events (target_user_id);
CREATE INDEX IF NOT EXISTS ix_admin_account_events_created_at ON admin_account_events (created_at);
