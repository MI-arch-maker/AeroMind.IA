#!/usr/bin/env bash
# P2-09 fix — TiDB migration runner (was missing entirely).
# apply_migrations.sh only handles PostgreSQL (psql). This script handles
# TiDB Cloud Serverless (MySQL protocol with TLS).
#
# Usage: bash scripts/apply_migrations_tidb.sh "$DATABASE_URL"
# DATABASE_URL must start with mysql:// or mysql+pymysql://

set -euo pipefail

DB_URL="${1:-$DATABASE_URL}"
if [ -z "$DB_URL" ]; then
  echo "ERROR: DATABASE_URL not set. Usage: $0 <mysql_url>" >&2
  exit 1
fi

# Parse the MySQL URL into components
# Expected format: mysql+pymysql://user:pass@host:4000/dbname?ssl=true
PROTO=$(echo "$DB_URL" | sed -n 's/^\(mysql[^:]*\):\/\/.*/\1/p')
if [ -z "$PROTO" ]; then
  echo "ERROR: DATABASE_URL must be a MySQL/TiDB URL (got: $DB_URL)" >&2
  exit 1
fi

USER=$(echo "$DB_URL" | sed -n 's/^[^:]*:\/\/\([^:]*\):.*/\1/p')
PASS=$(echo "$DB_URL" | sed -n 's/^[^:]*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
HOST=$(echo "$DB_URL" | sed -n 's/^[^:]*\/\/[^@]*@\([^:]*\):.*/\1/p')
PORT=$(echo "$DB_URL" | sed -n 's/^[^:]*\/\/[^@]*@[^:]*:\([0-9]*\).*/\1/p')
DBNAME=$(echo "$DB_URL" | sed -n 's/^[^:]*\/\/[^@]*@[^:]*:[0-9]*\/\([^?]*\).*/\1/p')

PORT="${PORT:-4000}"
MYSQL_CMD="mysql --host=$HOST --port=$PORT --user=$USER --password=$PASS --ssl-mode=REQUIRED --tls-version=TLSv1.2 -D $DBNAME"

echo "Applying TiDB migrations to $HOST:$PORT/$DBNAME ..."

for SQL_FILE in \
  migrations/2026-10-21_admin_account_registry_tidb.sql \
  migrations/2026-10-21_validation_audit_events.sql \
  migrations/2026-10-25_canonical_labbench_schema_tidb.sql
do
  if [ -f "$SQL_FILE" ]; then
    echo "  Applying: $SQL_FILE"
    $MYSQL_CMD < "$SQL_FILE"
  else
    echo "  SKIP (not found): $SQL_FILE"
  fi
done

echo "✓ TiDB migrations applied."
