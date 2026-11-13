-- AeroMind institutional GATE 01–05 chain (simulation-only)
-- GATE 05 records a human institutional decision only; it never creates a
-- hardware authorization, MAVLink token, safety certification or regulatory approval.

CREATE TABLE IF NOT EXISTS institutional_command_requests (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requester_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  virtual_command VARCHAR(80) NOT NULL,
  parameters_json TEXT NOT NULL DEFAULT '{}',
  intent_hash VARCHAR(64) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'gate_01_pending',
  simulation_only BOOLEAN NOT NULL DEFAULT TRUE,
  transmission_code_hash VARCHAR(64),
  transmission_signature VARCHAR(64),
  transmission_issued_at TIMESTAMPTZ,
  gate_05_decided_by VARCHAR(255),
  gate_05_decided_at TIMESTAMPTZ,
  simulation_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_institutional_request_project_status ON institutional_command_requests(project_id, status);
CREATE INDEX IF NOT EXISTS ix_institutional_request_code_hash ON institutional_command_requests(transmission_code_hash);

CREATE TABLE IF NOT EXISTS institutional_gate_events (
  id VARCHAR(36) PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL REFERENCES institutional_command_requests(id) ON DELETE CASCADE,
  project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  gate VARCHAR(20) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  decision VARCHAR(12) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  correlation_id VARCHAR(36) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_institutional_events_request_time ON institutional_gate_events(request_id, occurred_at);
CREATE INDEX IF NOT EXISTS ix_institutional_events_project_time ON institutional_gate_events(project_id, occurred_at);
