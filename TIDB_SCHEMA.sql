-- AeroMind schema for TiDB Cloud / MySQL compatibility
-- Generated from web/models.py. Run once as a TiDB user with CREATE/ALTER/INDEX privileges.
SET NAMES utf8mb4;

CREATE TABLE users (
	id VARCHAR(255) NOT NULL, 
	email VARCHAR(320) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_users_email ON users (email);

CREATE TABLE projects (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	data_json TEXT NOT NULL, 
	active_drone_id VARCHAR(36), 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_projects_user_id ON projects (user_id);

CREATE TABLE user_settings (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id VARCHAR(255) NOT NULL, 
	`key` VARCHAR(120) NOT NULL, 
	value_json TEXT NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_user_setting UNIQUE (user_id, `key`), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_user_settings_user_id ON user_settings (user_id);

CREATE TABLE hardware_logs (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id VARCHAR(255) NOT NULL, 
	command VARCHAR(80) NOT NULL, 
	payload_json TEXT NOT NULL, 
	status VARCHAR(40) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_hardware_logs_user_id ON hardware_logs (user_id);

CREATE INDEX ix_hardware_logs_created_at ON hardware_logs (created_at);

CREATE TABLE command_requests (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	target_id VARCHAR(120) NOT NULL, 
	target_name VARCHAR(240) NOT NULL, 
	command VARCHAR(60) NOT NULL, 
	objective VARCHAR(500) NOT NULL, 
	parameters_json TEXT NOT NULL, 
	checks_json TEXT NOT NULL, 
	request_sha256 VARCHAR(64) NOT NULL, 
	status VARCHAR(40) NOT NULL, 
	prepared_at DATETIME NOT NULL, 
	presented_at DATETIME, 
	expires_at DATETIME NOT NULL, 
	decided_by VARCHAR(255), 
	decided_at DATETIME, 
	result_json TEXT, 
	completed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_command_requests_expires_at ON command_requests (expires_at);

CREATE INDEX ix_command_requests_status ON command_requests (status);

CREATE INDEX ix_command_requests_user_id ON command_requests (user_id);

CREATE INDEX ix_command_requests_request_sha256 ON command_requests (request_sha256);

CREATE TABLE drones (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	project_id VARCHAR(36), 
	name VARCHAR(200) NOT NULL, 
	config_json TEXT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX ix_drones_user_id ON drones (user_id);

CREATE INDEX ix_drones_project_id ON drones (project_id);

CREATE TABLE simulations (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	data_json TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX ix_simulations_project_id ON simulations (project_id);

CREATE INDEX ix_simulations_user_id ON simulations (user_id);

CREATE TABLE reports (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	data_json TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX ix_reports_project_id ON reports (project_id);

CREATE INDEX ix_reports_user_id ON reports (user_id);

CREATE TABLE lab_sessions (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	data_json TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX ix_lab_sessions_project_id ON lab_sessions (project_id);

CREATE INDEX ix_lab_sessions_user_id ON lab_sessions (user_id);

CREATE TABLE prototype_versions (
	id VARCHAR(36) NOT NULL, 
	prototype_id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	version VARCHAR(40) NOT NULL, 
	config_json TEXT NOT NULL, 
	requirements_json TEXT NOT NULL, 
	sketch_json TEXT NOT NULL, 
	input_sha256 VARCHAR(64) NOT NULL, 
	status VARCHAR(40) NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_prototype_version UNIQUE (project_id, prototype_id, version), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_prototype_versions_user_id ON prototype_versions (user_id);

CREATE INDEX ix_prototype_versions_prototype_id ON prototype_versions (prototype_id);

CREATE INDEX ix_prototype_versions_project_id ON prototype_versions (project_id);

CREATE INDEX ix_prototype_versions_input_sha256 ON prototype_versions (input_sha256);

CREATE TABLE command_audit_events (
	id VARCHAR(36) NOT NULL, 
	request_id VARCHAR(36) NOT NULL, 
	actor_id VARCHAR(255) NOT NULL, 
	actor_role VARCHAR(40) NOT NULL, 
	event_type VARCHAR(60) NOT NULL, 
	details_json TEXT NOT NULL, 
	occurred_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(request_id) REFERENCES command_requests (id) ON DELETE CASCADE
);

CREATE INDEX ix_command_audit_events_actor_id ON command_audit_events (actor_id);

CREATE INDEX ix_command_audit_events_occurred_at ON command_audit_events (occurred_at);

CREATE INDEX ix_command_audit_events_request_id ON command_audit_events (request_id);

CREATE TABLE workflow_runs (
	id VARCHAR(36) NOT NULL, 
	prototype_version_id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	scenario_json TEXT NOT NULL, 
	result_json TEXT, 
	engine_version VARCHAR(80) NOT NULL, 
	status VARCHAR(40) NOT NULL, 
	report_id VARCHAR(36), 
	replay_of VARCHAR(36), 
	created_at DATETIME NOT NULL, 
	completed_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(prototype_version_id) REFERENCES prototype_versions (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_workflow_runs_project_id ON workflow_runs (project_id);

CREATE INDEX ix_workflow_runs_user_id ON workflow_runs (user_id);

CREATE INDEX ix_workflow_runs_prototype_version_id ON workflow_runs (prototype_version_id);

CREATE TABLE engineering_documents (
	id VARCHAR(36) NOT NULL, 
	prototype_version_id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(255) NOT NULL, 
	schema_version INTEGER NOT NULL, 
	document_json TEXT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(prototype_version_id) REFERENCES prototype_versions (id) ON DELETE CASCADE, 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_engineering_documents_project_id ON engineering_documents (project_id);

CREATE INDEX ix_engineering_documents_user_id ON engineering_documents (user_id);

CREATE UNIQUE INDEX ix_engineering_documents_prototype_version_id ON engineering_documents (prototype_version_id);

