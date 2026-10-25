#!/usr/bin/env python3
"""V6 LOT B runner — bootstrap a real PostgreSQL 16.x cluster, apply the
canonical migration, then run all 12 pg_only tests against the real PG.

This script is invoked by tests/test_v6_real_postgresql.py::test_R11_*
and can also be run standalone for reproduction:

    python3 tests/run_pg_tests.py

The script:
  1. Boots a real PostgreSQL cluster via pgserver (portable PG binary).
  2. Bootstraps legacy tables (users, projects, drones, missions, etc.).
  3. Applies the canonical migration (migrations/2026-10-25_canonical_labbench_schema.sql).
  4. Sets DATABASE_URL=postgresql://... so the pg_only skipif condition
     evaluates to False (the tests actually run).
  5. Runs pytest on tests/test_labbench_reception.py with -k filter for
     the pg_only tests.
  6. Captures the pytest output to validation/postgresql-tests.log.
"""
from __future__ import annotations

import os
import sys
import subprocess
import tempfile
from pathlib import Path

# Force env before importing pgserver / psycopg
os.environ.setdefault("AEROMIND_SESSION_SECRET", "a" * 48)
os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_AUTO_CREATE_SCHEMA", "true")

import pgserver
import psycopg
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MIGRATION = REPO_ROOT / "migrations" / "2026-10-25_canonical_labbench_schema.sql"
VALIDATION_LOG = REPO_ROOT / "validation" / "postgresql-tests.log"
VALIDATION_LOG.parent.mkdir(parents=True, exist_ok=True)


def _bootstrap_pg_cluster():
    pgdata = Path(tempfile.mkdtemp(prefix='pg-v6-real-'))
    srv = pgserver.get_server(pgdata, cleanup_mode='delete')
    return srv, srv.get_uri()


def _bootstrap_legacy_tables(uri: str) -> None:
    """Create the legacy tables that the canonical migration ALTERs.

    The schemas MUST match the ORM models in web/models.py exactly so
    SQLAlchemy inserts succeed (PostgreSQL enforces NOT NULL strictly).
    """
    with psycopg.connect(uri) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for stmt in [
                # User ORM: id, email, created_at (NO name, role, data_json)
                "CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, email VARCHAR(320) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                # Project ORM: id, user_id, project_id (nullable), name, config_json (legacy has data_json), created_at, updated_at, active_drone_id
                "CREATE TABLE IF NOT EXISTS projects (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(200) NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', active_drone_id VARCHAR(36) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                # Drone ORM: id, user_id, project_id (nullable), name, config_json, active_revision_id (V5 SYNC-02)
                "CREATE TABLE IF NOT EXISTS drones (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE, name VARCHAR(200) NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', active_revision_id VARCHAR(36) NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                # Mission ORM (V5 P0-04): id, user_id, project_id (nullable), name, description, created_at, uploaded_at, uploaded_to_drone_id, upload_state, upload_started_at, upload_error, upload_protocol, upload_idempotency_key
                "CREATE TABLE IF NOT EXISTS missions (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE, name VARCHAR(200) NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), uploaded_at TIMESTAMPTZ NULL, uploaded_to_drone_id VARCHAR(36) NULL, upload_state VARCHAR(20) NOT NULL DEFAULT 'pending', upload_started_at TIMESTAMPTZ NULL, upload_error TEXT NULL, upload_protocol VARCHAR(60) NULL, upload_idempotency_key VARCHAR(120) NULL)",
                "CREATE TABLE IF NOT EXISTS admin_accounts (id VARCHAR(36) PRIMARY KEY, email VARCHAR(320) NOT NULL UNIQUE, data_json TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE TABLE IF NOT EXISTS admin_account_events (id VARCHAR(36) PRIMARY KEY, account_id VARCHAR(36) NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE, event_type VARCHAR(80) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), actor_id VARCHAR(255), payload_json TEXT NOT NULL DEFAULT '{}')",
                "CREATE TABLE IF NOT EXISTS audit_events (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36), user_id VARCHAR(255), actor_role VARCHAR(50), event_type VARCHAR(120), message TEXT, payload_json TEXT, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE TABLE IF NOT EXISTS simulations (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE TABLE IF NOT EXISTS reports (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE, name VARCHAR(200), data_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                # NOTE: do NOT pre-create lab_sessions, anonymous_workspaces,
                # drone_revisions, test_runs, measurements, geofence_records,
                # hardware_tokens, event_outbox, audit_events_ext, gate_validations
                # — the canonical migration creates them from scratch with
                # the canonical schema (state, expires_at, idempotency_key, etc.).
                "CREATE TABLE IF NOT EXISTS waypoints (id VARCHAR(36) PRIMARY KEY, mission_id VARCHAR(36) NOT NULL REFERENCES missions(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, command VARCHAR(60) NOT NULL DEFAULT 'NAV_WAYPOINT', latitude DOUBLE PRECISION NULL, longitude DOUBLE PRECISION NULL, altitude_m DOUBLE PRECISION NULL, param1 DOUBLE PRECISION NULL, param2 DOUBLE PRECISION NULL, param3 DOUBLE PRECISION NULL, param4 DOUBLE PRECISION NULL)",
                "CREATE TABLE IF NOT EXISTS user_settings (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, key VARCHAR(120) NOT NULL, value_json TEXT NOT NULL, UNIQUE (user_id, key))",
                "CREATE TABLE IF NOT EXISTS hardware_logs (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36), drone_id VARCHAR(36), event_type VARCHAR(80) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), details_json TEXT NOT NULL DEFAULT '{}')",
                "CREATE TABLE IF NOT EXISTS battery_cycles (id SERIAL PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36), drone_id VARCHAR(36), battery_label VARCHAR(120) NOT NULL, event_type VARCHAR(20) NOT NULL, voltage_v DOUBLE PRECISION NULL, capacity_mah_used DOUBLE PRECISION NULL, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notes TEXT NULL)",
                "CREATE TABLE IF NOT EXISTS preflight_checklists (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36), drone_id VARCHAR(36), name VARCHAR(200) NOT NULL, items_json TEXT NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
                "CREATE TABLE IF NOT EXISTS maintenance_records (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36), drone_id VARCHAR(36), title VARCHAR(200) NOT NULL, description TEXT NOT NULL DEFAULT '', status VARCHAR(50) NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ NULL)",
                "CREATE TABLE IF NOT EXISTS fleet_telemetry_samples (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36), drone_id VARCHAR(36) NOT NULL, drone_name VARCHAR(200), sample_time TIMESTAMPTZ NOT NULL, latitude_deg DOUBLE PRECISION NULL, longitude_deg DOUBLE PRECISION NULL, altitude_m DOUBLE PRECISION NULL, relative_altitude_m DOUBLE PRECISION NULL, x_m DOUBLE PRECISION NULL, y_m DOUBLE PRECISION NULL, heading_deg DOUBLE PRECISION NULL, battery_remaining_pct DOUBLE PRECISION NULL, voltage_v DOUBLE PRECISION NULL, current_a DOUBLE PRECISION NULL, armed BOOLEAN NOT NULL DEFAULT FALSE, connected BOOLEAN NOT NULL DEFAULT FALSE, inside_geofence BOOLEAN NOT NULL DEFAULT TRUE, altitude_ok BOOLEAN NOT NULL DEFAULT TRUE, payload_json TEXT NOT NULL DEFAULT '{}')",
                "CREATE TABLE IF NOT EXISTS alert_events (id VARCHAR(36) PRIMARY KEY, project_id VARCHAR(36), drone_id VARCHAR(36), drone_name VARCHAR(200), alert_type VARCHAR(80) NOT NULL, severity VARCHAR(20) NOT NULL, message TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), acknowledged_at TIMESTAMPTZ NULL, acknowledged_by VARCHAR(255) NULL)",
            ]:
                cur.execute(stmt)


def _apply_canonical_migration(uri: str) -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    sql = sql.split("-- === ROLLBACK SCRIPT")[0]
    with psycopg.connect(uri) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)


def main() -> int:
    print("=== V6 LOT B — Real PostgreSQL pg_only tests ===", flush=True)
    srv, uri = _bootstrap_pg_cluster()
    # V6 — SQLAlchemy defaults to psycopg2 for postgresql:// URLs, but we
    # have psycopg3 installed. Rewrite to postgresql+psycopg:// so SQLAlchemy
    # uses the psycopg3 driver.
    sqla_uri = uri.replace("postgresql://", "postgresql+psycopg://", 1)
    print(f"PG URI (psycopg): {sqla_uri}", flush=True)
    try:
        print("Bootstrapping legacy tables...", flush=True)
        _bootstrap_legacy_tables(uri)
        print("Applying canonical migration...", flush=True)
        _apply_canonical_migration(uri)
        # Verify migration applied
        with psycopg.connect(uri) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT count(*) FROM information_schema.tables
                    WHERE table_schema='public' AND table_name IN
                    ('drone_revisions', 'lab_sessions', 'test_runs',
                     'measurements', 'hardware_tokens', 'anonymous_workspaces')
                """)
                count = cur.fetchone()[0]
                print(f"Canonical tables present: {count} (expected ≥ 6)", flush=True)
                assert count >= 6, f"Migration did not apply correctly; only {count} canonical tables"

        # Set env for pytest subprocess
        env = os.environ.copy()
        env["DATABASE_URL"] = sqla_uri
        env['AEROMIND_SESSION_SECRET'] = 'a' * 48
        env['AEROMIND_ENV'] = 'development'
        env['AEROMIND_AUTO_CREATE_SCHEMA'] = 'true'

        # Run the pg_only tests
        print("Running pg_only tests against real PG...", flush=True)
        cmd = [
            'python3', '-m', 'pytest',
            '-v', '--tb=short',
            '--no-header',
            '-k', 'T01 or T02 or T03 or T04 or T05 or T07 or T09 or T10 or T16 or T17 or T18 or T19',
            'tests/test_labbench_reception.py',
        ]
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=str(REPO_ROOT))
        # Write log
        log_lines = [
            "=== V6 LOT B — Real PostgreSQL pg_only tests ===",
            f"PG URI: {uri}",
            f"PG version: PostgreSQL 16.x (pgserver bundled)",
            f"Command: {' '.join(cmd)}",
            f"Exit code: {r.returncode}",
            "",
            "=== STDOUT ===",
            r.stdout,
            "",
            "=== STDERR ===",
            r.stderr,
        ]
        VALIDATION_LOG.write_text("\n".join(log_lines), encoding='utf-8')
        print(f"Log written to: {VALIDATION_LOG}", flush=True)
        print(r.stdout[-1500:], flush=True)
        if r.returncode == 0:
            print("✓ ALL pg_only tests PASS against real PostgreSQL", flush=True)
        else:
            print(f"✗ pg_only tests had failures (exit {r.returncode}) — see {VALIDATION_LOG}", flush=True)
        return r.returncode
    finally:
        srv.cleanup_mode = 'delete'


if __name__ == "__main__":
    sys.exit(main())
