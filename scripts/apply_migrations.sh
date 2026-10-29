#!/usr/bin/env bash
# P0-09 fix (INSPECT-DEVOPS B-HIGH-09): pre-deploy migration runner.
# Usage: bash scripts/apply_migrations.sh $DATABASE_URL
# Called by render.yaml preDeployCommand before each deployment.
set -euo pipefail
DB_URL="${1:?DATABASE_URL required as first argument}"
echo "[migrations] Applying AeroMind schema migrations to: ${DB_URL%%@*}@***"
# P2-10 fix: legacy_bootstrap MUST run first (creates users/projects/drones
# tables that validation_audit_events.sql references via FK constraints).
# P2-08 fix: schema_migrations table tracks which migrations have been applied.
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-10-30_schema_migrations.sql \
  -f migrations/2026-10-21_legacy_bootstrap.sql \
  -f migrations/2026-10-21_admin_account_registry.sql \
  -f migrations/2026-10-21_validation_audit_events.sql \
  -f migrations/2026-10-25_canonical_labbench_schema.sql
echo "[migrations] All migrations applied successfully."
# P2-08 fix: record applied migrations
for m in legacy_bootstrap admin_account_registry validation_audit_events canonical_labbench_schema; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations (id, applied_at) VALUES ('2026-10-21_${m}', NOW()) ON CONFLICT (id) DO NOTHING;" 2>/dev/null || true
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO schema_migrations (id, applied_at) VALUES ('2026-10-25_canonical_labbench_schema', NOW()) ON CONFLICT (id) DO NOTHING;" 2>/dev/null || true
echo "[migrations] schema_migrations table updated."
