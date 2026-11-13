from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class EngineeringMigrationContractTests(unittest.TestCase):
    def test_postgres_migration_is_additive_and_rollback_is_manual_comment(self) -> None:
        migration = ROOT / "migrations/2026-11-01_engineering_files_connectors.sql"
        content = migration.read_text(encoding="utf-8")
        active, rollback = content.split("-- === ROLLBACK SCRIPT", 1)
        rollback_lines = ["-- === ROLLBACK SCRIPT" + rollback.splitlines()[0]] + rollback.splitlines()[1:]
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_artifacts", active)
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_jobs", active)
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_simulation_runs", active)
        self.assertIn("cell_id", active)
        self.assertNotIn("DROP TABLE", active)
        self.assertTrue(all(not line.strip() or line.lstrip().startswith("--") for line in rollback_lines))

    def test_tidb_migration_is_additive_and_rollback_is_manual_comment(self) -> None:
        migration = ROOT / "migrations/2026-11-01_engineering_files_connectors_tidb.sql"
        content = migration.read_text(encoding="utf-8")
        active, rollback = content.split("-- === ROLLBACK SCRIPT", 1)
        rollback_lines = ["-- === ROLLBACK SCRIPT" + rollback.splitlines()[0]] + rollback.splitlines()[1:]
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_artifacts", active)
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_jobs", active)
        self.assertIn("CREATE TABLE IF NOT EXISTS engineering_simulation_runs", active)
        self.assertIn("cell_id", active)
        self.assertNotIn("DROP TABLE", active)
        self.assertTrue(all(not line.strip() or line.lstrip().startswith("--") for line in rollback_lines))

    def test_migration_runners_include_the_matching_engineering_schema(self) -> None:
        postgres = (ROOT / "scripts/apply_migrations.sh").read_text(encoding="utf-8")
        tidb = (ROOT / "scripts/apply_migrations_tidb.sh").read_text(encoding="utf-8")
        self.assertIn("2026-11-01_engineering_files_connectors.sql", postgres)
        self.assertIn("2026-11-01_engineering_files_connectors_tidb.sql", tidb)


if __name__ == "__main__":
    unittest.main()
