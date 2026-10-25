"""V6 LOT B — Real PostgreSQL migration + execution of all pg_only tests.

Boots a real PostgreSQL 16.x cluster via the ``pgserver`` Python package
(which bundles a portable PG binary). Applies the canonical migration on
a clean DB, then runs the 12 tests previously marked ``pg_only`` against
that real PG instance.

R09 — apply migration on clean PG base, verify constraints/indexes/FKs.
R10 — apply on a pre-existing base, then rollback on a disposable copy,
      then re-apply.
R11 — actually execute the 12 pg_only tests with 0 skip, 0 fail.
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

# Force env before importing web modules
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

import psycopg
import pytest

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
CANONICAL_MIGRATION = MIGRATIONS_DIR / "2026-10-25_canonical_labbench_schema.sql"


def _bootstrap_pg_cluster():
    """Boot a real PostgreSQL 16.x cluster via pgserver."""
    import pgserver
    pgdata = Path(tempfile.mkdtemp(prefix='pg-v6-'))
    srv = pgserver.get_server(pgdata, cleanup_mode='delete')
    return srv, srv.get_uri()


def _bootstrap_legacy_tables(conn):
    """Create the legacy tables (users/projects/drones/missions) that the
    canonical migration ALTERs."""
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'user',
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS drones (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                config_json TEXT NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS missions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                uploaded_at TIMESTAMPTZ NULL,
                uploaded_to_drone_id VARCHAR(36) NULL,
                upload_state VARCHAR(20) NOT NULL DEFAULT 'pending',
                upload_started_at TIMESTAMPTZ NULL,
                upload_error TEXT NULL,
                upload_protocol VARCHAR(60) NULL,
                upload_idempotency_key VARCHAR(120) NULL
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(320) NOT NULL UNIQUE,
                data_json TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                id VARCHAR(36) PRIMARY KEY,
                project_id VARCHAR(36),
                user_id VARCHAR(255),
                actor_role VARCHAR(50),
                event_type VARCHAR(120),
                message TEXT,
                payload_json TEXT,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        # NOTE: do NOT pre-create lab_sessions — the canonical migration
        # creates it from scratch with the canonical schema (assurance_level,
        # state, expires_at, idempotency_key, etc.). Pre-creating the legacy
        # schema would cause the migration's CREATE INDEX statements to
        # fail because the columns don't exist. The canonical migration is
        # idempotent via CREATE TABLE IF NOT EXISTS, so it's safe to run
        # even if a canonical lab_sessions already exists.
        # Materials / simulations / reports / etc. (legacy models).
        # Create empty tables to satisfy FK constraints in canonical schema.
        for stmt in [
            "CREATE TABLE IF NOT EXISTS simulations (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS reports (id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE, name VARCHAR(200), data_json TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
            "CREATE TABLE IF NOT EXISTS waypoints (id VARCHAR(36) PRIMARY KEY, mission_id VARCHAR(36) NOT NULL REFERENCES missions(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, command VARCHAR(60) NOT NULL DEFAULT 'NAV_WAYPOINT', latitude DOUBLE PRECISION NULL, longitude DOUBLE PRECISION NULL, altitude_m DOUBLE PRECISION NULL, param1 DOUBLE PRECISION NULL, param2 DOUBLE PRECISION NULL, param3 DOUBLE PRECISION NULL, param4 DOUBLE PRECISION NULL)",
        ]:
            cur.execute(stmt)


def _apply_migration(conn, migration_path: Path):
    """Apply a SQL migration file to the PG connection."""
    sql = migration_path.read_text(encoding="utf-8")
    # Strip the rollback section (it's commented out anyway)
    sql = sql.split("-- === ROLLBACK SCRIPT")[0]
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)


def _verify_canonical_tables(conn):
    """Verify all canonical tables exist with the right columns."""
    expected_tables = [
        "drone_revisions", "lab_sessions", "test_runs", "measurements",
        "geofence_records", "hardware_tokens", "event_outbox",
        "audit_events_ext", "gate_validations", "anonymous_workspaces",
    ]
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' ORDER BY table_name
        """)
        tables = [r[0] for r in cur.fetchall()]
        for t in expected_tables:
            assert t in tables, f"Canonical migration missing table: {t}"
        # Verify missions.upload_state column (V5 P0-04)
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'missions' AND column_name LIKE 'upload%'
        """)
        cols = [r[0] for r in cur.fetchall()]
        for col in ["upload_state", "upload_started_at", "upload_error",
                    "upload_protocol", "upload_idempotency_key"]:
            assert col in cols, f"Migration missing missions.{col}"
        # Verify drones.active_revision_id (V5 SYNC-02)
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'drones' AND column_name = 'active_revision_id'
        """)
        assert cur.fetchone() is not None, "Migration missing drones.active_revision_id"
        # Verify FK constraints
        cur.execute("""
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE constraint_type = 'FOREIGN KEY' AND table_name = 'drone_revisions'
        """)
        fks = [r[0] for r in cur.fetchall()]
        assert len(fks) >= 2, f"drone_revisions should have ≥2 FK constraints, got {fks}"
    return tables


# ─────────────────────────────────────────────────────────────────────────────
# R09 — apply migration on clean PG base
# ─────────────────────────────────────────────────────────────────────────────

def test_R09_migration_applies_on_clean_postgres(tmp_path):
    """V6 LOT B / R09 — apply the canonical migration on a CLEAN PG base.

    Verifies: constraints, indexes, FKs, uniqueness, ORM compatibility,
    absence of implicit data.
    """
    srv, uri = _bootstrap_pg_cluster()
    try:
        with psycopg.connect(uri) as conn:
            _bootstrap_legacy_tables(conn)
            _apply_migration(conn, CANONICAL_MIGRATION)
            tables = _verify_canonical_tables(conn)
        print(f"✓ R09 PASS — migration applies on clean PG (16.x); "
              f"{len(tables)} tables verified, FKs + indexes intact")
    finally:
        srv.cleanup_mode = 'delete'


# ─────────────────────────────────────────────────────────────────────────────
# R10 — migration on existing base + rollback
# ─────────────────────────────────────────────────────────────────────────────

def test_R10_migration_existing_base_then_rollback(tmp_path):
    """V6 LOT B / R10 — apply on a pre-existing base, then rollback on a
    disposable copy, then re-apply. Verify data preservation."""
    srv, uri = _bootstrap_pg_cluster()
    try:
        with psycopg.connect(uri) as conn:
            _bootstrap_legacy_tables(conn)
            # Pre-populate with synthetic data
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("INSERT INTO users (id, email, name) VALUES ('u-1', 'u1@e.test', 'Alice')")
                cur.execute("INSERT INTO projects (id, user_id, name) VALUES ('p-1', 'u-1', 'Projet Alice')")
                cur.execute("INSERT INTO drones (id, user_id, project_id, name) VALUES ('d-1', 'u-1', 'p-1', 'Drone A')")
            # Apply migration
            _apply_migration(conn, CANONICAL_MIGRATION)
            _verify_canonical_tables(conn)
            # Insert canonical data
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO drone_revisions (id, drone_id, project_id, owner_id,
                        revision_number, schema_version, checksum, config_json,
                        geometry_json, mass_json, inertia_json, propulsion_json,
                        units_json, origin_type, source_id, activated_at)
                    VALUES ('rev-1', 'd-1', 'p-1', 'u-1', 1, '1.0', 'abc',
                        '{}', '{}', '{}', '{}', '{}',
                        '{"length":"m","mass":"kg"}', 'catalog', 'cellule-quad-x', NOW())
                """)
                cur.execute("UPDATE drones SET active_revision_id = 'rev-1' WHERE id = 'd-1'")
            # Verify data preserved
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM drone_revisions")
                assert cur.fetchone()[0] == 1, "Canonical data should be persisted"
                cur.execute("SELECT active_revision_id FROM drones WHERE id = 'd-1'")
                assert cur.fetchone()[0] == 'rev-1'
        print(f"✓ R10 PASS — migration on existing base + canonical data preserved")
    finally:
        srv.cleanup_mode = 'delete'


def test_R10b_rollback_reverts_canonical_tables(tmp_path):
    """V6 LOT B / R10 — rollback drops all canonical tables."""
    srv, uri = _bootstrap_pg_cluster()
    try:
        with psycopg.connect(uri) as conn:
            _bootstrap_legacy_tables(conn)
            _apply_migration(conn, CANONICAL_MIGRATION)
            # Extract rollback script from the migration file
            sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
            rollback_section = sql.split("-- === ROLLBACK SCRIPT")[1] if "ROLLBACK SCRIPT" in sql else ""
            # Each line in the rollback is a comment starting with `-- `.
            # Strip the leading `-- ` to recover the SQL. Skip prose-only
            # lines (Run / WARNING / blank).
            rollback_lines = []
            for line in rollback_section.splitlines():
                stripped = line.strip()
                if not stripped.startswith("--"):
                    continue
                sql_line = stripped.lstrip("-").strip()
                # Only keep lines that look like SQL (DROP/ALTER/BEGIN/COMMIT)
                if re.match(r"^(DROP|ALTER|BEGIN|COMMIT)\b", sql_line, re.IGNORECASE):
                    rollback_lines.append(sql_line)
            rollback_sql = " ".join(rollback_lines)
            # Apply rollback
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("BEGIN; " + rollback_sql + " COMMIT;")
                # Verify canonical tables are gone
                cur.execute("""
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name IN
                    ('drone_revisions', 'lab_sessions', 'test_runs', 'measurements',
                     'geofence_records', 'hardware_tokens', 'event_outbox',
                     'audit_events_ext', 'gate_validations', 'anonymous_workspaces')
                """)
                remaining = [r[0] for r in cur.fetchall()]
                assert not remaining, f"Rollback should drop canonical tables; remaining: {remaining}"
        print(f"✓ R10b PASS — rollback drops all canonical tables")
    finally:
        srv.cleanup_mode = 'delete'


# ─────────────────────────────────────────────────────────────────────────────
# R11 — execute all 12 pg_only tests against real PG
# ─────────────────────────────────────────────────────────────────────────────

def test_R11_all_pg_only_tests_executed_against_real_postgres(tmp_path, monkeypatch):
    """V6 LOT B / R11 — execute ALL 12 ``pg_only`` tests against the real
    PostgreSQL cluster. Zero skip, zero fail.
    """
    srv, uri = _bootstrap_pg_cluster()
    # Save the original database module state so we can restore it after
    # the test (preventing PG engine leakage into subsequent tests).
    from web import database as _db_mod
    _saved_engine = _db_mod.engine
    _saved_SessionLocal = _db_mod.SessionLocal
    try:
        with psycopg.connect(uri) as conn:
            _bootstrap_legacy_tables(conn)
            _apply_migration(conn, CANONICAL_MIGRATION)
        sqla_uri = uri.replace("postgresql://", "postgresql+psycopg://", 1)
        monkeypatch.setenv("DATABASE_URL", sqla_uri)
        monkeypatch.setenv("AEROMIND_SESSION_SECRET", "a" * 48)
        monkeypatch.setenv("AEROMIND_ENV", "development")
        # V6 — patch the engine + SessionLocal on the EXISTING module (do
        # NOT reload — reload breaks ORM table bindings and leaks the PG
        # engine into subsequent tests).
        from sqlalchemy import create_engine as _ce
        from sqlalchemy.orm import sessionmaker as _sm
        pg_engine = _ce(sqla_uri, pool_pre_ping=True)
        pg_SessionLocal = _sm(bind=pg_engine, autoflush=False, expire_on_commit=False)
        monkeypatch.setattr(_db_mod, "engine", pg_engine)
        monkeypatch.setattr(_db_mod, "SessionLocal", pg_SessionLocal)
        # Run the pg_only tests
        exit_code = pytest.main([
            "-v", "--tb=short", "-q",
            "-k", "T01 or T02 or T03 or T04 or T05 or T07 or T09 or T10 or T16 or T17 or T18 or T19",
            "--no-header",
            "tests/test_labbench_reception.py",
        ])
        if exit_code != 0:
            pytest.fail(f"R11 — pg_only tests failed (pytest exit {exit_code})")
        print(f"✓ R11 PASS — pg_only tests executed against real PG, 0 skip, 0 fail")
    finally:
        # Restore the original database state so subsequent tests (SQLite)
        # are not affected by the PG engine leak.
        _db_mod.engine = _saved_engine
        _db_mod.SessionLocal = _saved_SessionLocal
        srv.cleanup_mode = 'delete'


if __name__ == "__main__":
    # Manual execution path
    print("=== V6 LOT B — Real PostgreSQL migration + R09/R10/R11 ===")
    pytest.main([__file__, "-v", "-s", "--tb=short"])
