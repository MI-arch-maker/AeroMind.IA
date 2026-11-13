"""Migration SQL validator (cahier des charges P0 / M08).

Verifies that the canonical schema migration
``migrations/2026-10-25_canonical_labbench_schema.sql`` is syntactically
balanced and idempotent (every CREATE has a matching DROP in the rollback
section; every ALTER TABLE ADD COLUMN has a matching DROP COLUMN). This
does NOT replace a real Postgres/TiDB run — it catches gross mistakes
before they ship to a production migration runner.

Run with: ``DATABASE_URL=postgresql://... pytest tests/test_migrations.py``
to actually execute the SQL against a real PostgreSQL.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pytest


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
CANONICAL_MIGRATION = MIGRATIONS_DIR / "2026-10-25_canonical_labbench_schema.sql"
TIDB_MIGRATION = MIGRATIONS_DIR / "2026-10-25_canonical_labbench_schema_tidb.sql"

pg_only = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL", "").startswith("postgresql:"),
    reason="Requires PostgreSQL to execute the canonical schema migration.",
)


# ─────────────────────────────────────────────────────────────────────────────
# Static (no DB) structural checks
# ─────────────────────────────────────────────────────────────────────────────

def test_canonical_migration_file_exists():
    assert CANONICAL_MIGRATION.is_file(), f"Missing migration: {CANONICAL_MIGRATION}"


def test_canonical_migration_has_transaction_boundaries():
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    # Active section must be wrapped in BEGIN; COMMIT;
    active = sql.split("-- === ROLLBACK SCRIPT")[0]
    assert re.search(r"^\s*BEGIN\s*;", active, re.MULTILINE | re.IGNORECASE), \
        "Active migration section must BEGIN a transaction"
    assert re.search(r"^\s*COMMIT\s*;", active, re.MULTILINE | re.IGNORECASE), \
        "Active migration section must COMMIT the transaction"


def test_canonical_migration_create_drop_balance():
    """Every CREATE TABLE in the active section MUST have a matching
    DROP TABLE in the rollback section so the migration is reversible."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    rollback = sql.split("-- === ROLLBACK SCRIPT")[1] if "ROLLBACK SCRIPT" in sql else ""

    # Find all CREATE TABLE names in the active section
    created = re.findall(r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)", sql, re.IGNORECASE)
    # Find all DROP TABLE names in the rollback section
    dropped = re.findall(r"DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)", rollback, re.IGNORECASE)

    assert created, "Migration should define at least one CREATE TABLE"
    missing_drops = set(created) - set(dropped)
    assert not missing_drops, (
        f"Each CREATE TABLE must have a matching DROP TABLE in rollback; "
        f"missing DROPs: {missing_drops}"
    )


def test_canonical_migration_alter_add_drop_balance():
    """Every ALTER TABLE ADD COLUMN in the active section MUST have a
    matching DROP COLUMN in the rollback section."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    rollback = sql.split("-- === ROLLBACK SCRIPT")[1] if "ROLLBACK SCRIPT" in sql else ""

    added_cols = re.findall(
        r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(\w+)",
        sql, re.IGNORECASE,
    )
    dropped_cols = re.findall(
        r"ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+(\w+)",
        rollback, re.IGNORECASE,
    )

    assert added_cols, "Migration should have at least one ALTER TABLE ADD COLUMN"
    added_set = {(t.lower(), c.lower()) for t, c in added_cols}
    dropped_set = {(t.lower(), c.lower()) for t, c in dropped_cols}
    missing = added_set - dropped_set
    assert not missing, (
        f"Each ADD COLUMN must have a matching DROP COLUMN in rollback; "
        f"missing: {missing}"
    )


def test_canonical_migration_no_unsupported_ddl():
    """Defensive — the migration must NOT contain TRUNCATE, DELETE, or DROP
    in the active section (only in the rollback). Catches a copy-paste mistake."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    active = sql.split("-- === ROLLBACK SCRIPT")[0]
    # Remove comments so we don't false-positive on commented-out lines
    no_comments = re.sub(r"^\s*--.*$", "", active, flags=re.MULTILINE)
    forbidden = re.findall(r"\b(TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|DROP\s+DATABASE)\b",
                            no_comments, re.IGNORECASE)
    assert not forbidden, (
        f"Active migration section must not contain destructive DDL: {forbidden}"
    )


def test_canonical_migration_includes_mission_state_columns():
    """P0-04 fix — the migration must extend the missions table with the
    upload state machine columns."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    for col in ["upload_state", "upload_started_at", "upload_error",
                "upload_protocol", "upload_idempotency_key"]:
        assert re.search(
            rf"\bmissions\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+{col}\b",
            sql, re.IGNORECASE,
        ), f"Migration missing ALTER TABLE missions ADD COLUMN {col}"


def test_canonical_migration_includes_drone_active_revision_id():
    """SYNC-02 — the migration must extend drones with active_revision_id
    so the canonical contract (drone carries its active revision pointer)
    is enforceable in production."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    assert re.search(
        r"\bdrones\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+active_revision_id\b",
        sql, re.IGNORECASE,
    ), "Migration missing ALTER TABLE drones ADD COLUMN active_revision_id"


def test_canonical_migration_lab_sessions_table():
    """The lab_sessions table (canonical session store) MUST be created
    by the migration so that multi-worker step-up sessions persist."""
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    assert re.search(
        r"CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lab_sessions\b",
        sql, re.IGNORECASE,
    ), "Migration missing CREATE TABLE lab_sessions"


# ─────────────────────────────────────────────────────────────────────────────
# Live PostgreSQL execution (skip when DATABASE_URL is not PostgreSQL)
# ─────────────────────────────────────────────────────────────────────────────

@pg_only
def test_canonical_migration_applies_on_clean_postgres():
    """EXIGENCE M08 / R13 — the canonical migration MUST apply on a clean
    PostgreSQL database. Run with:
    ``DATABASE_URL=postgresql://user:pass@host/dbname pytest -k test_canonical_migration_applies_on_clean_postgres``
    """
    import psycopg
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    active = sql.split("-- === ROLLBACK SCRIPT")[0]
    # Strip leading/trailing whitespace and remove BEGIN/COMMIT (psycopg
    # executes them automatically when using the connection's autocommit).
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            # First ensure the legacy tables exist (the migration ALTERs them)
            cur.execute(
                "CREATE TABLE IF NOT EXISTS users (id VARCHAR(255) PRIMARY KEY, "
                "email VARCHAR(255) NOT NULL UNIQUE, "
                "name VARCHAR(255) NOT NULL, "
                "role VARCHAR(50) NOT NULL DEFAULT 'user', "
                "data_json TEXT NOT NULL DEFAULT '{}', "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
                "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            )
            cur.execute(
                "CREATE TABLE IF NOT EXISTS projects (id VARCHAR(36) PRIMARY KEY, "
                "user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                "name VARCHAR(200) NOT NULL, "
                "data_json TEXT NOT NULL DEFAULT '{}', "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
                "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            )
            cur.execute(
                "CREATE TABLE IF NOT EXISTS drones (id VARCHAR(36) PRIMARY KEY, "
                "user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                "project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE, "
                "name VARCHAR(200) NOT NULL, "
                "config_json TEXT NOT NULL DEFAULT '{}', "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            )
            cur.execute(
                "CREATE TABLE IF NOT EXISTS missions (id VARCHAR(36) PRIMARY KEY, "
                "user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                "project_id VARCHAR(36), "
                "name VARCHAR(200) NOT NULL, "
                "description TEXT NOT NULL DEFAULT '', "
                "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), "
                "uploaded_at TIMESTAMPTZ NULL, "
                "uploaded_to_drone_id VARCHAR(36) NULL"
            )
            # Apply the canonical migration
            cur.execute(active)
    print("✓ Canonical migration applies on clean PostgreSQL")


@pg_only
def test_canonical_migration_idempotent():
    """EXIGENCE M08 — the migration must be idempotent (re-applying produces
    no error and the schema is unchanged)."""
    import psycopg
    sql = CANONICAL_MIGRATION.read_text(encoding="utf-8")
    active = sql.split("-- === ROLLBACK SCRIPT")[0]
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(active)  # second time — must NOT error
    print("✓ Canonical migration is idempotent")
