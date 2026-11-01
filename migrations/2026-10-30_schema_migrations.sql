-- P2-08 fix — schema_migrations table for tracking applied migrations.
-- Without this, a partially-applied schema is indistinguishable from a fully-
-- applied one. apply_migrations.sh inserts one row per applied migration.

CREATE TABLE IF NOT EXISTS schema_migrations (
    id              VARCHAR(128) NOT NULL PRIMARY KEY,
    applied_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    checksum        VARCHAR(64)  NULL
);

-- Record the canonical migration as applied
INSERT INTO schema_migrations (id, checksum)
VALUES (
    '2026-10-25_canonical_labbench_schema',
    md5('2026-10-25_canonical_labbench_schema_v1')
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (id, checksum)
VALUES (
    '2026-10-21_admin_account_registry',
    md5('2026-10-21_admin_account_registry_v1')
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (id, checksum)
VALUES (
    '2026-10-21_validation_audit_events',
    md5('2026-10-21_validation_audit_events_v1')
)
ON CONFLICT (id) DO NOTHING;
