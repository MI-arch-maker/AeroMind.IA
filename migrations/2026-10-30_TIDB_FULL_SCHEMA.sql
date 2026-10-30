-- =============================================================================
-- AeroMind — Schéma TiDB complet (MySQL 8 compatible)
-- =============================================================================
-- Fichier       : 2026-10-30_TIDB_FULL_SCHEMA.sql
-- Cible         : TiDB Cloud Serverless (MySQL 8 dialect, protocol MySQL sur 4000)
-- But           : Créer en une seule passe idempotente toutes les tables
--                 nécessaires au fonctionnement d'AeroMind en production.
-- Contexte      : Sur Render, l'utilisateur applicatif (DATABASE_URL) n'a PAS
--                 les privilèges DDL (CREATE/ALTER/INDEX). L'option
--                 AEROMIND_AUTO_CREATE_SCHEMA=false désactive create_all() et
--                 le schéma DOIT être posé manuellement par un compte
--                 administrateur avant le premier déploiement.
-- Idempotence   : Toutes les tables sont créées via CREATE TABLE IF NOT EXISTS.
--                 Tous les index sont déclarés INLINE dans le CREATE TABLE
--                 (TiDB ne supporte pas CREATE INDEX IF NOT EXISTS).
-- Exécution     :
--   mysql -h <host> -P 4000 -u <admin_user> -p --ssl-mode=REQUIRED <db> \
--        < 2026-10-30_TIDB_FULL_SCHEMA.sql
-- =============================================================================
-- Tables créées (33 + 1 table de suivi = 34 CREATE TABLE au total) :
--   1.  schema_migrations           (suivi des migrations appliquées)
--   2.  users                       (Web User — auth locale / Entra OIDC)
--   3.  admin_accounts              (allowlist administrateurs Entra/MFA)
--   4.  admin_account_events        (audit trail des changements de compte)
--   5.  projects                    (projet utilisateur — agrège drones/sim/...)
--   6.  drones                      (drone utilisateur lié à un projet)
--   7.  prototype_versions          (configuration drone immuable et versionnée)
--   8.  simulations                 (résultat de simulation)
--   9.  reports                     (rapport utilisateur)
--  10.  missions                    (plan de vol — way points + state machine)
--  11.  waypoints                   (waypoint d'une mission)
--  12.  audit_events                (journal d'audit legacy, project-scoped)
--  13.  audit_events_ext            (journal d'audit canonique hash-chained IAM-05)
--  14.  lab_sessions                (session step-up — schéma canonique complet)
--  15.  user_settings               (préférences utilisateur clé/valeur)
--  16.  hardware_logs               (log des commandes matérielles)
--  17.  engineering_documents       (document design/assembly immuable)
--  18.  workflow_runs               (exécution reproductible liée à un prototype)
--  19.  command_requests            (demande d'approbation humaine simulation-only)
--  20.  command_audit_events        (audit des événements de commande)
--  21.  fleet_telemetry_samples     (échantillons télémétrie par drone / 2 s)
--  22.  alert_events                (alertes serveur télémétrie)
--  23.  material_items              (catalogue matériel non-armé)
--  24.  preflight_checklists         (check-list pré-vol)
--  25.  maintenance_records          (registre maintenance drone / pièce)
--  26.  battery_cycles               (cycles charge/décharge batterie)
--  27.  anonymous_workspaces         (brouillons navigateur anonymes persistants)
--  28.  drone_revisions              (configuration drone versionnée + checksum)
--  29.  test_runs                    (exécution d'essai avec state machine)
--  30.  measurements                 (métrique échantillonnée d'un test_run)
--  31.  geofence_records             (geofence persistante fail-closed)
--  32.  hardware_tokens              (jeton d'autorisation matériel signé mon_USAGE)
--  33.  event_outbox                 (transactional outbox SYNC-04)
--  34.  gate_validations              (approbation portes G0..G5)
-- =============================================================================
-- Notes d'adaptation TiDB / MySQL 8 :
--   * TIMESTAMPTZ  →  TIMESTAMP   (TiDB stocke tous les TIMESTAMP en UTC)
--   * NOW()        →  CURRENT_TIMESTAMP
--   * BOOLEAN      →  TINYINT(1)
--   * DOUBLE PRECISION → DOUBLE
--   * GEN_RANDOM_UUID() → fonction UUID() de TiDB (renvoie un VARCHAR(36) dashé)
--   * md5('x')     →  MD5('x')    (TiDB supporte nativement)
--   * ON CONFLICT (id) DO NOTHING → INSERT IGNORE
--   * CREATE INDEX IF NOT EXISTS → INTERDIT en TiDB ; les index sont déclarés
--                                  INLINE (KEY/INDEX dans le CREATE TABLE)
--   * CHECK constraints : supportés depuis TiDB v6.2.0 ; un commentaire indique
--                          la version minimale requise pour chaque contrainte.
--   * FOREIGN KEY    : acceptés syntaxiquement mais NON EXÉFORCÉS par TiDB
--                      (cf. https://docs.pingcap.com/tidb/stable/foreign-key).
--                      L'application DOIT effectuer les contrôles d'ownership
--                      (déjà implémentés dans web/labbench_auth.py).
--                      Les FK sont inclus ici uniquement à titre documentaire.
--   * Triggers      : TiDB ne supporte PAS les triggers de façon fiable.
--                     L'append-only sur audit_events_ext est garanti par la
--                     couche application (web/validation_audit.py) et non par
--                     un trigger PostgreSQL. Voir commentaire en section 13.
-- =============================================================================

-- =============================================================================
-- SECTION 1 — Table de suivi des migrations
-- =============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    id           VARCHAR(128) NOT NULL PRIMARY KEY,
    applied_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checksum     VARCHAR(64)  NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 2 — users (web/models.py:User)
--    Clé primaire VARCHAR(255) car l'ID peut venir de Microsoft Entra OIDC
--    (object ID 36 chars) ou d'un email local (jusqu'à 320 chars).
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id          VARCHAR(255) NOT NULL PRIMARY KEY,
    email       VARCHAR(320) NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ix_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 3 — admin_accounts + admin_account_events
--    Allowlist durable pour Entra OIDC ou identités MFA locales pré-provisionnées.
-- =============================================================================
CREATE TABLE IF NOT EXISTS admin_accounts (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    email       VARCHAR(320) NOT NULL,
    data_json   TEXT         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY ix_admin_accounts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_account_events (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    event_type      VARCHAR(80)  NOT NULL,
    actor_id        VARCHAR(255) NOT NULL,
    actor_email     VARCHAR(320) NOT NULL,
    target_user_id  VARCHAR(255) NULL,
    payload_json    TEXT         NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_admin_account_events_event_type (event_type),
    KEY ix_admin_account_events_actor_id (actor_id),
    KEY ix_admin_account_events_target_user_id (target_user_id),
    KEY ix_admin_account_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 4 — projects (web/models.py:Project)
--    FK user_id → users(id) — TiDB ne force pas la FK ; l'app gère le ownership.
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id         VARCHAR(255) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    data_json       TEXT         NOT NULL,
    active_drone_id VARCHAR(36)  NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY ix_projects_user_id (user_id),
    -- FK documentation only (TiDB does not enforce FOREIGN KEY constraints)
    CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 5 — drones + prototype_versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS drones (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL,
    project_id  VARCHAR(36)  NULL,
    name        VARCHAR(200) NOT NULL,
    config_json TEXT         NOT NULL,
    KEY ix_drones_user_id (user_id),
    KEY ix_drones_project_id (project_id),
    CONSTRAINT fk_drones_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_drones_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS prototype_versions (
    id                VARCHAR(36)  NOT NULL PRIMARY KEY,
    prototype_id      VARCHAR(36)  NOT NULL,
    project_id        VARCHAR(36)  NOT NULL,
    user_id           VARCHAR(255) NOT NULL,
    name              VARCHAR(200) NOT NULL,
    version           VARCHAR(40)  NOT NULL,
    config_json       TEXT         NOT NULL,
    requirements_json TEXT         NOT NULL,
    sketch_json       TEXT         NOT NULL,
    input_sha256      VARCHAR(64)  NOT NULL,
    status            VARCHAR(40)  NOT NULL DEFAULT 'ready_to_simulate',
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_prototype_version (project_id, prototype_id, version),
    KEY ix_prototype_versions_prototype_id (prototype_id),
    KEY ix_prototype_versions_project_id (project_id),
    KEY ix_prototype_versions_user_id (user_id),
    KEY ix_prototype_versions_input_sha256 (input_sha256),
    CONSTRAINT fk_prototype_versions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_prototype_versions_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 6 — simulations + reports
-- =============================================================================
CREATE TABLE IF NOT EXISTS simulations (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL,
    project_id  VARCHAR(36)  NOT NULL,
    data_json   TEXT         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_simulations_user_id (user_id),
    KEY ix_simulations_project_id (project_id),
    CONSTRAINT fk_simulations_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_simulations_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL,
    project_id  VARCHAR(36)  NOT NULL,
    data_json   TEXT         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_reports_user_id (user_id),
    KEY ix_reports_project_id (project_id),
    CONSTRAINT fk_reports_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_reports_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 7 — missions + waypoints
--    missions.upload_state machine ∈ {pending, uploading, uploaded, failed}
--    (EXIGENCE FUNC-05 / R10). upload_idempotency_key pour la détection de
--    doublons après redémarrage worker (P0-04 fix).
-- =============================================================================
CREATE TABLE IF NOT EXISTS missions (
    id                       VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id                  VARCHAR(255) NOT NULL,
    project_id               VARCHAR(36)  NULL,
    name                     VARCHAR(200) NOT NULL,
    description              TEXT         NOT NULL,
    created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_at              TIMESTAMP    NULL,
    uploaded_to_drone_id     VARCHAR(36)  NULL,
    upload_state             VARCHAR(20)  NOT NULL DEFAULT 'pending',
    upload_started_at        TIMESTAMP    NULL,
    upload_error             TEXT         NULL,
    upload_protocol          VARCHAR(60)  NULL,
    upload_idempotency_key   VARCHAR(120) NULL,
    KEY ix_missions_user_id (user_id),
    KEY ix_missions_project_id (project_id),
    KEY ix_missions_upload_idempotency_key (upload_idempotency_key),
    CONSTRAINT fk_missions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS waypoints (
    id          VARCHAR(36)  NOT NULL PRIMARY KEY,
    mission_id  VARCHAR(36)  NOT NULL,
    sequence    INT          NOT NULL,
    command     VARCHAR(60)  NOT NULL DEFAULT 'NAV_WAYPOINT',
    latitude    DOUBLE       NULL,
    longitude   DOUBLE       NULL,
    altitude_m  DOUBLE       NULL,
    param1      DOUBLE       NULL,
    param2      DOUBLE       NULL,
    param3      DOUBLE       NULL,
    param4      DOUBLE       NULL,
    KEY ix_waypoints_mission_id (mission_id),
    CONSTRAINT fk_waypoints_mission FOREIGN KEY (mission_id) REFERENCES missions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 8 — audit_events (legacy) + audit_events_ext (canonical hash-chained)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id    VARCHAR(36)  NULL,
    user_id       VARCHAR(255) NULL,
    actor_role    VARCHAR(40)  NOT NULL,
    event_type    VARCHAR(80)  NOT NULL,
    message       TEXT         NOT NULL,
    payload_json TEXT         NOT NULL,
    occurred_at   TIMESTAMP    NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_audit_events_project_id (project_id),
    KEY ix_audit_events_user_id (user_id),
    KEY ix_audit_events_project_created (project_id, created_at),
    CONSTRAINT fk_audit_events_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_events_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- audit_events_ext — journal d'audit inviolable (EXIGENCE IAM-05)
-- P0-07 fix: prev_hash + chain_hash pour la chaîne de hachage anti-falsification.
-- NOTE TRIGGER : la version PostgreSQL crée un trigger `audit_ext_no_update_delete`
-- qui lève une exception sur UPDATE/DELETE. TiDB ne supporte PAS les triggers
-- de façon fiable. L'append-only est donc garanti uniquement par la couche
-- applicative (web/validation_audit.py — append-only enforced in Python).
CREATE TABLE IF NOT EXISTS audit_events_ext (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    actor_id       VARCHAR(255) NOT NULL,
    actor_role     VARCHAR(40)  NOT NULL,
    action         VARCHAR(80)  NOT NULL,
    resource_id    VARCHAR(255) NULL,
    decision       VARCHAR(20)  NOT NULL,
    project_id     VARCHAR(36)  NULL,
    drone_id       VARCHAR(36)  NULL,
    correlation_id VARCHAR(36)  NOT NULL,
    message        TEXT         NOT NULL,
    payload_json  TEXT         NOT NULL,
    occurred_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prev_hash      VARCHAR(64)  NULL,
    chain_hash     VARCHAR(64)  NULL,
    -- CHECK constraints require TiDB >= 6.2.0
    CONSTRAINT ck_audit_events_ext_decision CHECK (decision IN ('allow', 'deny', 'error')),
    KEY ix_audit_events_ext_action (action),
    KEY ix_audit_events_ext_actor (actor_id),
    KEY ix_audit_events_ext_resource (resource_id),
    KEY ix_audit_events_ext_corr (correlation_id),
    KEY ix_audit_events_ext_occurred (occurred_at),
    KEY ix_audit_events_ext_project_time (project_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 9 — lab_sessions (schéma canonique complet)
--    L'ORM web.models.LabSession ne connaît que id/user_id/project_id/data_json/
--    created_at. Le schéma canonique (canonical_models.py + migration
--    2026-10-25_canonical_labbench_schema_tidb.sql) ajoute drone_id, revision_id,
--    assurance_level, state, step_up_at, expires_at, revoked_at, scope_json et
--    idempotency_key. Les colonnes canoniques supplémentaires sont conservées
--    ici pour compatibilité avec les futurs usages canonicals ; elles sont
--    NULL-ables ou ont une DEFAULT pour ne pas casser les INSERTs ORM legacy.
--    data_json est LONGTEXT NOT NULL (MySQL strict interdit DEFAULT sur LONGTEXT ;
--    l'ORM fournit toujours une valeur via session_store._db_persist_session).
-- =============================================================================
CREATE TABLE IF NOT EXISTS lab_sessions (
    id               VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id          VARCHAR(255) NOT NULL,
    project_id       VARCHAR(36)  NOT NULL,
    drone_id         VARCHAR(36)  NULL,
    revision_id      VARCHAR(36)  NULL,
    assurance_level  VARCHAR(20)  NOT NULL DEFAULT 'step-up',
    state            VARCHAR(20)  NOT NULL DEFAULT 'active',
    step_up_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at       TIMESTAMP    NOT NULL DEFAULT DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE),
    revoked_at       TIMESTAMP    NULL,
    scope_json       TEXT         NOT NULL,
    idempotency_key  VARCHAR(64)  NULL,
    data_json        LONGTEXT     NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- CHECK constraints require TiDB >= 6.2.0
    CONSTRAINT ck_lab_sessions_state     CHECK (state IN ('active', 'expired', 'revoked')),
    CONSTRAINT ck_lab_sessions_assurance CHECK (assurance_level IN ('aeromind', 'step-up', 'mfa')),
    KEY ix_lab_sessions_user (user_id),
    KEY ix_lab_sessions_project (project_id),
    KEY ix_lab_sessions_idem (idempotency_key),
    CONSTRAINT fk_lab_sessions_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE,
    CONSTRAINT fk_lab_sessions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 10 — user_settings + hardware_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL,
    `key`       VARCHAR(120) NOT NULL,
    value_json  TEXT         NOT NULL,
    UNIQUE KEY uq_user_setting (user_id, `key`),
    KEY ix_user_settings_user_id (user_id),
    CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hardware_logs (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       VARCHAR(255) NOT NULL,
    command       VARCHAR(80)  NOT NULL,
    payload_json  TEXT         NOT NULL,
    status        VARCHAR(40)  NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_hardware_logs_user_id (user_id),
    KEY ix_hardware_logs_created_at (created_at),
    CONSTRAINT fk_hardware_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 11 — engineering_documents + workflow_runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS engineering_documents (
    id                   VARCHAR(36)  NOT NULL PRIMARY KEY,
    prototype_version_id VARCHAR(36)  NOT NULL,
    project_id           VARCHAR(36)  NOT NULL,
    user_id              VARCHAR(255) NOT NULL,
    schema_version       INT          NOT NULL DEFAULT 1,
    document_json        TEXT         NOT NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ix_engineering_documents_prototype_version_id (prototype_version_id),
    KEY ix_engineering_documents_project_id (project_id),
    KEY ix_engineering_documents_user_id (user_id),
    CONSTRAINT fk_eng_docs_prototype FOREIGN KEY (prototype_version_id) REFERENCES prototype_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_eng_docs_project   FOREIGN KEY (project_id)          REFERENCES projects (id)          ON DELETE CASCADE,
    CONSTRAINT fk_eng_docs_user      FOREIGN KEY (user_id)             REFERENCES users (id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workflow_runs (
    id                   VARCHAR(36)  NOT NULL PRIMARY KEY,
    prototype_version_id VARCHAR(36)  NOT NULL,
    project_id           VARCHAR(36)  NOT NULL,
    user_id              VARCHAR(255) NOT NULL,
    scenario_json        TEXT         NOT NULL,
    result_json          TEXT         NULL,
    engine_version       VARCHAR(80)  NOT NULL,
    status               VARCHAR(40)  NOT NULL DEFAULT 'running',
    report_id            VARCHAR(36)  NULL,
    replay_of            VARCHAR(36)  NULL,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at         TIMESTAMP    NULL,
    KEY ix_workflow_runs_prototype_version_id (prototype_version_id),
    KEY ix_workflow_runs_project_id (project_id),
    KEY ix_workflow_runs_user_id (user_id),
    CONSTRAINT fk_workflow_runs_prototype FOREIGN KEY (prototype_version_id) REFERENCES prototype_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_workflow_runs_project   FOREIGN KEY (project_id)          REFERENCES projects (id)          ON DELETE CASCADE,
    CONSTRAINT fk_workflow_runs_user       FOREIGN KEY (user_id)             REFERENCES users (id)             ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 12 — command_requests + command_audit_events
-- =============================================================================
CREATE TABLE IF NOT EXISTS command_requests (
    id               VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id          VARCHAR(255) NOT NULL,
    target_id        VARCHAR(120) NOT NULL,
    target_name      VARCHAR(240) NOT NULL,
    command          VARCHAR(60)  NOT NULL,
    objective        VARCHAR(500) NOT NULL,
    parameters_json  TEXT         NOT NULL,
    checks_json      TEXT         NOT NULL,
    request_sha256    VARCHAR(64)  NOT NULL,
    status           VARCHAR(40)  NOT NULL,
    prepared_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    presented_at     TIMESTAMP    NULL,
    expires_at       TIMESTAMP    NOT NULL,
    decided_by       VARCHAR(255) NULL,
    decided_at       TIMESTAMP    NULL,
    result_json      TEXT         NULL,
    completed_at     TIMESTAMP    NULL,
    KEY ix_command_requests_user_id (user_id),
    KEY ix_command_requests_request_sha256 (request_sha256),
    KEY ix_command_requests_status (status),
    KEY ix_command_requests_expires_at (expires_at),
    CONSTRAINT fk_command_requests_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS command_audit_events (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    request_id    VARCHAR(36)  NOT NULL,
    actor_id      VARCHAR(255) NOT NULL,
    actor_role     VARCHAR(40)  NOT NULL,
    event_type    VARCHAR(60)  NOT NULL,
    details_json  TEXT         NOT NULL,
    occurred_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_command_audit_events_request_id (request_id),
    KEY ix_command_audit_events_actor_id (actor_id),
    KEY ix_command_audit_events_occurred_at (occurred_at),
    CONSTRAINT fk_command_audit_events_request FOREIGN KEY (request_id) REFERENCES command_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 13 — fleet_telemetry_samples + alert_events
-- =============================================================================
CREATE TABLE IF NOT EXISTS fleet_telemetry_samples (
    id                    BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id            VARCHAR(36)  NULL,
    drone_id              VARCHAR(36)  NOT NULL,
    drone_name            VARCHAR(200) NOT NULL DEFAULT '',
    sample_time           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude_deg          DOUBLE       NULL,
    longitude_deg         DOUBLE       NULL,
    altitude_m            DOUBLE       NULL,
    relative_altitude_m   DOUBLE       NULL,
    x_m                   DOUBLE       NULL,
    y_m                   DOUBLE       NULL,
    heading_deg           DOUBLE       NULL,
    battery_remaining_pct DOUBLE       NULL,
    voltage_v             DOUBLE       NULL,
    current_a             DOUBLE       NULL,
    armed                 TINYINT(1)   NOT NULL DEFAULT 0,
    connected             TINYINT(1)   NOT NULL DEFAULT 0,
    inside_geofence       TINYINT(1)   NOT NULL DEFAULT 1,
    altitude_ok           TINYINT(1)   NOT NULL DEFAULT 1,
    payload_json          TEXT         NOT NULL,
    KEY ix_fleet_telemetry_samples_project_id (project_id),
    KEY ix_fleet_telemetry_samples_drone_id (drone_id),
    KEY ix_fleet_telemetry_samples_sample_time (sample_time),
    KEY ix_fleet_telemetry_drone_time (drone_id, sample_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alert_events (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id      VARCHAR(36)  NULL,
    drone_id        VARCHAR(36)  NULL,
    drone_name      VARCHAR(200) NOT NULL DEFAULT '',
    alert_type      VARCHAR(60)  NOT NULL,
    severity        VARCHAR(20)  NOT NULL DEFAULT 'warning',
    message         TEXT         NOT NULL,
    payload_json    TEXT         NOT NULL,
    acknowledged    TINYINT(1)   NOT NULL DEFAULT 0,
    acknowledged_by VARCHAR(255) NULL,
    acknowledged_at TIMESTAMP    NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_alert_events_project_id (project_id),
    KEY ix_alert_events_drone_id (drone_id),
    KEY ix_alert_events_alert_type (alert_type),
    KEY ix_alert_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 14 — material_items
--    Catalogue matériel non-armé (EXIGENCE — aucune entrée ne peut être
--    classifiée comme armement). La colonne weaponized est toujours FALSE
--    et vérifiée côté application.
-- =============================================================================
CREATE TABLE IF NOT EXISTS material_items (
    id                          VARCHAR(80)  NOT NULL PRIMARY KEY,
    category                    VARCHAR(60)  NOT NULL,
    label                       VARCHAR(240) NOT NULL,
    manufacturer                VARCHAR(120) NULL,
    part_number                 VARCHAR(120) NULL,
    mass_kg                     DOUBLE       NULL,
    dimensions                  TEXT         NULL,
    electrical                  TEXT         NULL,
    interfaces                  TEXT         NULL,
    `use`                       TEXT         NULL,
    compatible_airframes_json   TEXT         NOT NULL,
    catalog_source              VARCHAR(20)  NOT NULL DEFAULT 'user',
    weaponized                  TINYINT(1)   NOT NULL DEFAULT 0,
    notes                       TEXT         NULL,
    created_at                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_material_items_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 15 — preflight_checklists + maintenance_records + battery_cycles
-- =============================================================================
CREATE TABLE IF NOT EXISTS preflight_checklists (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id       VARCHAR(255) NOT NULL,
    project_id    VARCHAR(36)  NULL,
    drone_id      VARCHAR(36)  NULL,
    name          VARCHAR(200) NOT NULL,
    items_json    TEXT         NOT NULL,
    executed_at   TIMESTAMP    NULL,
    passed        TINYINT(1)   NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_preflight_checklists_user_id (user_id),
    KEY ix_preflight_checklists_project_id (project_id),
    KEY ix_preflight_checklists_drone_id (drone_id),
    CONSTRAINT fk_preflight_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS maintenance_records (
    id                          VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id                     VARCHAR(255) NOT NULL,
    project_id                  VARCHAR(36)  NULL,
    drone_id                    VARCHAR(36)  NULL,
    material_item_id            VARCHAR(80)  NULL,
    maintenance_type            VARCHAR(60)  NOT NULL,
    description                 TEXT         NOT NULL,
    performed_at                TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_due_at                 TIMESTAMP    NULL,
    flight_hours_at_maintenance DOUBLE       NULL,
    notes                       TEXT         NULL,
    created_at                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY ix_maintenance_records_user_id (user_id),
    KEY ix_maintenance_records_project_id (project_id),
    KEY ix_maintenance_records_drone_id (drone_id),
    KEY ix_maintenance_records_material_item_id (material_item_id),
    CONSTRAINT fk_maintenance_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS battery_cycles (
    id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id             VARCHAR(255) NOT NULL,
    project_id          VARCHAR(36)  NULL,
    drone_id            VARCHAR(36)  NULL,
    battery_label       VARCHAR(120) NOT NULL,
    event_type          VARCHAR(20)  NOT NULL,
    voltage_v           DOUBLE       NULL,
    capacity_mah_used    DOUBLE       NULL,
    occurred_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes               TEXT         NULL,
    KEY ix_battery_cycles_user_id (user_id),
    KEY ix_battery_cycles_project_id (project_id),
    KEY ix_battery_cycles_drone_id (drone_id),
    CONSTRAINT fk_battery_cycles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 16 — anonymous_workspaces (V5 LOT B / R-04)
--    workspace_key = 43-char base64url opaque (≥ 122 bits d'entropie).
--    TTL glissant via expires_at ; les lignes expirées sont purgées à l'accès.
--    origin_ip est pour quota/anti-abus — PAS pour l'autorisation.
-- =============================================================================
CREATE TABLE IF NOT EXISTS anonymous_workspaces (
    id          VARCHAR(43) NOT NULL PRIMARY KEY,
    data_json   LONGTEXT    NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at  TIMESTAMP   NOT NULL,
    origin_ip   VARCHAR(64) NULL,
    KEY ix_anonymous_workspaces_expires (expires_at),
    KEY ix_anonymous_workspaces_origin_ip (origin_ip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 17 — Schéma canonique LABBENCH-01 (cahier des charges §3.1, §18-22)
--    DroneRevision, TestRun, Measurement, GeofenceRecord, HardwareToken,
--    EventOutbox, GateValidation
-- =============================================================================

-- 17.1 — drone_revisions (immuable, versionnée, checksum pour concurrence optimiste)
CREATE TABLE IF NOT EXISTS drone_revisions (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    drone_id        VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    owner_id        VARCHAR(255) NOT NULL,
    revision_number INT          NOT NULL DEFAULT 1,
    schema_version  VARCHAR(20)  NOT NULL DEFAULT '1.0',
    checksum        VARCHAR(64)  NOT NULL,
    config_json     TEXT         NOT NULL,
    geometry_json   TEXT         NOT NULL,
    mass_json       TEXT         NOT NULL,
    inertia_json    TEXT         NOT NULL,
    propulsion_json TEXT         NOT NULL,
    units_json      TEXT         NOT NULL,
    origin_type     VARCHAR(20)  NOT NULL,
    source_id       VARCHAR(255) NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at    TIMESTAMP    NULL,
    UNIQUE KEY uq_drone_revision_number (drone_id, revision_number),
    -- CHECK constraint requires TiDB >= 6.2.0
    CONSTRAINT ck_drone_revisions_origin CHECK (origin_type IN ('catalog', 'sketch', 'imported')),
    KEY ix_drone_revisions_drone_id (drone_id),
    KEY ix_drone_revisions_project_id (project_id),
    KEY ix_drone_revisions_owner_id (owner_id),
    KEY ix_drone_revisions_project_drone (project_id, drone_id),
    CONSTRAINT fk_drone_revisions_drone   FOREIGN KEY (drone_id)   REFERENCES drones (id)   ON DELETE CASCADE,
    CONSTRAINT fk_drone_revisions_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_drone_revisions_owner   FOREIGN KEY (owner_id)   REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.2 — test_runs (une exécution d'essai avec state machine)
CREATE TABLE IF NOT EXISTS test_runs (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    session_id      VARCHAR(128) NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    scenario_id     VARCHAR(100) NOT NULL,
    engine_version  VARCHAR(60)  NOT NULL DEFAULT 'aeromind-1.0',
    state           VARCHAR(20)  NOT NULL DEFAULT 'pending',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       TINYINT(1)   NOT NULL DEFAULT 0,
    started_at      TIMESTAMP    NULL,
    completed_at    TIMESTAMP    NULL,
    error_message   TEXT         NULL,
    summary_json    TEXT         NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- CHECK constraints require TiDB >= 6.2.0
    CONSTRAINT ck_test_runs_state       CHECK (state IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT ck_test_runs_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical')),
    KEY ix_test_runs_session_id (session_id),
    KEY ix_test_runs_project_id (project_id),
    KEY ix_test_runs_drone_id (drone_id),
    KEY ix_test_runs_revision_id (revision_id),
    CONSTRAINT fk_test_runs_session  FOREIGN KEY (session_id)  REFERENCES lab_sessions (id)    ON DELETE CASCADE,
    CONSTRAINT fk_test_runs_project  FOREIGN KEY (project_id) REFERENCES projects (id)        ON DELETE CASCADE,
    CONSTRAINT fk_test_runs_drone    FOREIGN KEY (drone_id)   REFERENCES drones (id)         ON DELETE CASCADE,
    CONSTRAINT fk_test_runs_revision FOREIGN KEY (revision_id) REFERENCES drone_revisions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.3 — measurements (métrique échantillonnée d'un test_run, EXIGENCE SYNC-07)
CREATE TABLE IF NOT EXISTS measurements (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    run_id          VARCHAR(36)  NOT NULL,
    project_id      VARCHAR(36)  NOT NULL,
    drone_id        VARCHAR(36)  NOT NULL,
    revision_id     VARCHAR(36)  NOT NULL,
    timestamp_utc   TIMESTAMP    NOT NULL,
    metric          VARCHAR(100) NOT NULL,
    value           DOUBLE       NOT NULL,
    unit            VARCHAR(40)  NOT NULL,
    quality         VARCHAR(20)  NOT NULL DEFAULT 'unknown',
    source_type     VARCHAR(20)  NOT NULL DEFAULT 'synthetic',
    persisted       TINYINT(1)   NOT NULL DEFAULT 0,
    calibration_id  VARCHAR(100) NULL,
    origin          VARCHAR(100) NOT NULL DEFAULT 'local',
    -- CHECK constraint requires TiDB >= 6.2.0
    CONSTRAINT ck_measurements_source_type CHECK (source_type IN ('synthetic', 'sitl', 'hil', 'physical')),
    KEY ix_measurements_run_id (run_id),
    KEY ix_measurements_project_id (project_id),
    KEY ix_measurements_drone_id (drone_id),
    KEY ix_measurements_run_timestamp (run_id, timestamp_utc),
    CONSTRAINT fk_measurements_run       FOREIGN KEY (run_id)      REFERENCES test_runs (id)       ON DELETE CASCADE,
    CONSTRAINT fk_measurements_project   FOREIGN KEY (project_id)  REFERENCES projects (id)       ON DELETE CASCADE,
    CONSTRAINT fk_measurements_drone     FOREIGN KEY (drone_id)    REFERENCES drones (id)         ON DELETE CASCADE,
    CONSTRAINT fk_measurements_revision  FOREIGN KEY (revision_id) REFERENCES drone_revisions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.4 — geofence_records (geofence persistante fail-closed, SEC-04 fix)
CREATE TABLE IF NOT EXISTS geofence_records (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id     VARCHAR(36)  NOT NULL,
    owner_id       VARCHAR(255) NOT NULL,
    polygon_json   TEXT         NOT NULL,
    max_altitude_m DOUBLE       NOT NULL,
    min_altitude_m DOUBLE       NOT NULL DEFAULT 0.0,
    notes          TEXT         NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_geofence_project (project_id),
    -- CHECK constraint requires TiDB >= 6.2.0
    CONSTRAINT ck_geofence_altitude_range CHECK (max_altitude_m > min_altitude_m),
    KEY ix_geofence_records_owner (owner_id),
    CONSTRAINT fk_geofence_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_geofence_owner  FOREIGN KEY (owner_id)   REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.5 — hardware_tokens (jeton signé mon-usage expirant, SEC-03)
CREATE TABLE IF NOT EXISTS hardware_tokens (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id   VARCHAR(36)  NOT NULL,
    drone_id     VARCHAR(36)  NOT NULL,
    actor_id     VARCHAR(255) NOT NULL,
    reviewer_id  VARCHAR(255) NOT NULL,
    command      VARCHAR(80)  NOT NULL,
    params_hash  VARCHAR(64)  NOT NULL,
    signature    VARCHAR(128) NOT NULL,
    kind         VARCHAR(40)  NOT NULL DEFAULT 'command',
    issued_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at   TIMESTAMP    NOT NULL,
    consumed_at  TIMESTAMP    NULL,
    -- CHECK constraint requires TiDB >= 6.2.0
    CONSTRAINT ck_hardware_tokens_kind CHECK (kind IN ('command', 'mission_upload', 'arm', 'actuator', 'geofence_update')),
    KEY ix_hardware_tokens_project_id (project_id),
    KEY ix_hardware_tokens_drone_id (drone_id),
    KEY ix_hardware_tokens_actor_id (actor_id),
    KEY ix_hardware_tokens_reviewer_id (reviewer_id),
    KEY ix_hardware_tokens_drone_expires (drone_id, expires_at),
    CONSTRAINT fk_hwtoken_project  FOREIGN KEY (project_id)  REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_hwtoken_drone    FOREIGN KEY (drone_id)    REFERENCES drones (id)  ON DELETE CASCADE,
    CONSTRAINT fk_hwtoken_actor    FOREIGN KEY (actor_id)    REFERENCES users (id)   ON DELETE CASCADE,
    CONSTRAINT fk_hwtoken_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.6 — event_outbox (transactional outbox SYNC-04)
CREATE TABLE IF NOT EXISTS event_outbox (
    id                VARCHAR(36)  NOT NULL PRIMARY KEY,
    event_id          VARCHAR(36)  NOT NULL,
    event_type        VARCHAR(60)  NOT NULL,
    schema_version    VARCHAR(20)  NOT NULL DEFAULT '1.0',
    correlation_id    VARCHAR(36)  NOT NULL,
    project_id        VARCHAR(36)  NULL,
    drone_id          VARCHAR(36)  NULL,
    revision_id       VARCHAR(36)  NULL,
    actor_id          VARCHAR(255) NULL,
    payload_json      TEXT         NOT NULL,
    occurred_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at      TIMESTAMP    NULL,
    delivery_attempts INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_event_outbox_event_id (event_id),
    KEY ix_event_outbox_event_type (event_type),
    KEY ix_event_outbox_correlation_id (correlation_id),
    KEY ix_event_outbox_project_id (project_id),
    KEY ix_event_outbox_drone_id (drone_id),
    KEY ix_event_outbox_actor_id (actor_id),
    KEY ix_event_outbox_unpublished (published_at, occurred_at),
    CONSTRAINT fk_event_outbox_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17.7 — gate_validations (approbation portes G0..G5, EXIGENCE C-001)
CREATE TABLE IF NOT EXISTS gate_validations (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id     VARCHAR(36)  NOT NULL,
    gate           VARCHAR(20)  NOT NULL,
    state          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    reviewer_id    VARCHAR(255) NOT NULL,
    operator_id    VARCHAR(255) NULL,
    evidence_json  TEXT         NOT NULL,
    approved_at    TIMESTAMP    NULL,
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gate_per_project (project_id, gate),
    -- CHECK constraints require TiDB >= 6.2.0
    CONSTRAINT ck_gate_validations_gate  CHECK (gate IN ('G0_gel', 'G1_securite', 'G2_fiabilite', 'G3_banc', 'G4_qualification', 'G5_exploitation')),
    CONSTRAINT ck_gate_validations_state CHECK (state IN ('pending', 'approved', 'rejected', 'revoked')),
    KEY ix_gate_validations_project_id (project_id),
    KEY ix_gate_validations_reviewer_id (reviewer_id),
    KEY ix_gate_validations_operator_id (operator_id),
    CONSTRAINT fk_gate_project  FOREIGN KEY (project_id)  REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_gate_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- SECTION 18 — Enregistrement des migrations dans schema_migrations
--    (INSERT IGNORE pour idempotence — équivalent TiDB de ON CONFLICT DO NOTHING)
-- =============================================================================
INSERT IGNORE INTO schema_migrations (id, checksum)
VALUES ('2026-10-25_canonical_labbench_schema', MD5('2026-10-25_canonical_labbench_schema_v1'));

INSERT IGNORE INTO schema_migrations (id, checksum)
VALUES ('2026-10-21_admin_account_registry', MD5('2026-10-21_admin_account_registry_v1'));

INSERT IGNORE INTO schema_migrations (id, checksum)
VALUES ('2026-10-21_validation_audit_events', MD5('2026-10-21_validation_audit_events_v1'));

INSERT IGNORE INTO schema_migrations (id, checksum)
VALUES ('2026-10-21_legacy_bootstrap', MD5('2026-10-21_legacy_bootstrap_v1'));

INSERT IGNORE INTO schema_migrations (id, checksum)
VALUES ('2026-10-30_TIDB_FULL_SCHEMA', MD5('2026-10-30_TIDB_FULL_SCHEMA_v1'));

-- =============================================================================
-- SECTION 19 — Bootstrap du compte super-admin primaire
--    Identité Microsoft Entra pré-provisionnée. L'application refusera toute
--    action admin tant que cette ligne n'existe pas dans admin_accounts.
-- =============================================================================
INSERT IGNORE INTO admin_accounts (id, email, data_json, created_at, updated_at)
VALUES (
    'primary-super-admin',
    'mcgregoralvin14@gmail.com',
    '{"email":"mcgregoralvin14@gmail.com","role":"super_admin","level":"L4","accountStatus":"active","name":"Administrateur principal","loginMethod":"microsoft-entra"}',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================================
-- SECTION 20 — Vérification finale : compte des tables créées dans cette base
-- =============================================================================
SELECT CONCAT('Total tables: ', COUNT(*)) AS verification
FROM information_schema.tables
WHERE table_schema = DATABASE();

-- =============================================================================
-- FIN DU SCRIPT — 2026-10-30_TIDB_FULL_SCHEMA.sql
-- =============================================================================
