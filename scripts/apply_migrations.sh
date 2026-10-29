#!/usr/bin/env bash
# P0-09 fix (INSPECT-DEVOPS B-HIGH-09): pre-deploy migration runner.
# Usage: bash scripts/apply_migrations.sh $DATABASE_URL
# Called by render.yaml preDeployCommand before each deployment.
set -euo pipefail
DB_URL="${1:?DATABASE_URL required as first argument}"
echo "[migrations] Applying AeroMind schema migrations to: ${DB_URL%%@*}@***"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f migrations/2026-10-21_admin_account_registry.sql \
  -f migrations/2026-10-21_validation_audit_events.sql \
  -f migrations/2026-10-25_canonical_labbench_schema.sql
echo "[migrations] All migrations applied successfully."
