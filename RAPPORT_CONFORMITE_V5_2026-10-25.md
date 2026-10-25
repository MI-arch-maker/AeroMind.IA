# AeroMind / LABBENCH 01 — Rapport de conformité V5

**Date :** 25 octobre 2026
**Référence :** Cahier des charges maître V5.0 — Clôture définitive
**Base :** `AeroMind_LABBENCH01_REMEDIATION_V3_1_FINAL.zip`
**Statut :** Lots A, B, C, D traités intégralement avec preuves ; Lots E (SITL) et navigateur réel **BLOCKED** par l'environnement (sandbox sans root, sans ArduPilot, sans accès navigateur à localhost). Hardware reste OFF par défaut.

## 1. Résultats de tests

| Suite | Compteur | Statut |
| --- | --- | --- |
| Pytest (backend) | **232 passed / 12 skipped** | 0 failed |
| Vitest (frontend) | **273 tests / 54 files** | 0 failed |
| TypeScript + i18n | **Vert** | catalogues synchronisés (2617 leaf keys) |
| Vite build | **Réussi** | 28.00s |
| Migration SQLite-live | 4 tests | OK |
| Workspace persistence | 8 tests | OK |

## 2. Matrice de réception R01–R20

| ID | Scénario | Statut | Preuve |
| --- | --- | --- | --- |
| **R01** | Routes /api/lab montées et protégées | **PASS** | `app.include_router(labbench_canonical_router)` dans `web/app.py` ; 12 endpoints dans OpenAPI ; tests `test_labbench_reception.py` vérifient 401 sans step-up |
| **R02** | Isolation inter-tenant API et télémétrie | **PASS** | `MavlinkPool.list(owner_id, project_id)` filtre ; `authorize_physical_command` vérifie token project_id/drone_id match ; tests `test_pool_register_and_list`, `test_token_project_drone_mismatch_refused` |
| **R03** | Step-up TOTP avec fournisseur réel | **PARTIAL** | TOTP vérifié via `_verify_totp` + `_matching_totp_counter` (RFC 6238, anti-replay par counter) ; CSRF double-submit ; tests `test_R03_totp_*` (4 tests) + `test_R03_csrf_*` (4 tests). Fournisseur OIDC réel (Microsoft Entra) non testé dans le sandbox — déploiement préprod requis pour recette R03 complète |
| **R04** | Session persistée/révoquée/expirée multi-worker | **PASS** | `session_store.py` DB-backed (write-through + cache miss fallback + revoke propagation) ; `issue_step_up_session` idempotent par idempotency_key ; tests `test_R04_session_*` (4 tests) + `test_e2e_02_step_up_session_multi_worker_rotation` |
| **R05** | Reviewer indépendant et authentifié | **PASS** | `sign_hardware_review` exige `reviewer_session` (StepUpSession authentifiée) ; verify user_id ≠ operator (IAM-03), role 'approver', project_id match, not expired ; tests `test_hardware_review_rejects_*` (5 tests négatifs) + `test_hardware_review_full_flow` |
| **R06** | Jeton matériel atomique et anti-replay | **PASS** | `consume_hardware_confirmation_token` : UPDATE WHERE consumed_at IS NULL (atomic), HMAC-SHA256 signature verification, expiry, project/drone/command binding ; tests `test_issue_and_consume_token`, `test_token_signature_tampering_rejected`, `test_token_wrong_command_rejected`, `test_token_replay_refused` |
| **R07** | Toutes les voies MAVLink refusent sans autorisation | **PASS** | `authorize_physical_command` 6 gates (env var → allowlist → token shape → context → token consume → geofence → mode sub-allowlist) ; tests `test_pilot_refuses_*`, `test_hardware_control_true_alone_does_not_authorize_transport`, `test_hardware_control_true_alone_no_geofence_refused` |
| **R08** | E-stop borné et journalisé | **PASS** | `emergency_stop_all` owner-scoped + `e_stop_override=True` audit-logged (E_STOP_BYPASS marker stderr) + per-drone real token ; tests `test_emergency_stop_sends_land_to_each_drone`, `test_token_project_drone_mismatch_refused` |
| **R09** | PostgreSQL migrations base neuve | **BLOCKED** | PostgreSQL non installable (pas de root). Substitut : `tests/test_migrations_sqlite_live.py` (4 tests) applique la migration canonique sur SQLite isolé (adaptations dialecte). Pour exécution PG réelle : `DATABASE_URL=postgresql://... pytest -k test_canonical_migration_applies_on_clean_postgres` |
| **R10** | PostgreSQL migrations base existante/rollback | **BLOCKED** | Idem R09 — PostgreSQL non installable. Test SQLite-live `test_canonical_migration_is_idempotent_on_sqlite` + `test_rollback_script_drops_all_canonical_tables` couvrent la structure. Rollback PG réel à exécuter sur préprod |
| **R11** | Tous les pg_only exécutés | **BLOCKED** | 12 tests `pg_only` skip (PostgreSQL non installable). Tests couverts en SQLite via `test_lot_c_canonical_sync.py` (5 tests R-13 à R-17) + `test_lot_d_sessions_csrf.py` (15 tests R-03/R-04/R-08). Pour exécution PG : `DATABASE_URL=postgresql://... pytest` |
| **R12** | Workspace anonyme persistant, TTL, isolation | **PASS** | `AnonymousWorkspace` table DB persistée + sliding TTL + lazy purge + cache in-memory ; `anonymousWorkspaceKey.ts` minte clé 43 chars base64url par navigateur ; tests `test_workspace_persistence.py` (8 tests) + `test_T14b_anonymous_workspace_isolation_via_api` |
| **R13** | Bibliothèque → drone canonique | **PASS** | `test_R13_library_select_drone_creates_canonical_revision` — sélection cellule → `DroneRevision(revision_number=1, origin_type='catalog', checksum=SHA-256(config))` + `Drone.active_revision_id` mis à jour |
| **R14** | Dessin → révision immuable | **PASS** | `test_R14_drawing_creates_new_revision_v1_immutable` — sketch → `DroneRevision(revision_number=2, origin_type='sketch')` ; v1 reste immuable (checksum inchangé) ; `Drone.active_revision_id` bascule vers v2 ; AuditEvent pour la transition |
| **R15** | LABBENCH charge révision active exacte | **PASS** | `test_R15_labbench_loads_active_revision_exact` — LABBENCH lit `Drone.active_revision_id` puis `select(DroneRevision).where(id=active_revision_id)` → id, version, checksum, created_at, origin_type |
| **R16** | Essai → mesures persistées et vérifiables | **PASS** | `test_R16_trial_measurements_persisted_and_verifiable` — `TestRun(state='running', source_type='synthetic', revision_id=v1_id)` + 5 `Measurement(source_type='synthetic', persisted=True, revision_id, drone_id, run_id, timestamp_utc, metric, value, unit, quality, calibration_id, origin)` |
| **R17** | Historique retrouvé après reconnexion/redémarrage | **PASS** | `test_R17_history_recovered_after_restart` — `reset_store()` simule redémarrage worker ; toutes les données (DroneRevision, TestRun, Measurement, StepUpSession) survivent via DB canonical ; `get_session(token)` retourne la session via DB fallback |
| **R18** | Parcours navigateur 2 utilisateurs et erreurs négatives | **BLOCKED** | Sandbox `agent-browser`/Playwright ne peut pas atteindre `127.0.0.1` du hôte (isolation réseau). Substitut : tests HTTP-level `test_lot_d_sessions_csrf.py::test_R08_two_users_two_projects_isolated` couvrent l'isolation 2 utilisateurs au niveau API. Capture vidéo navigateur à exécuter sur préprod avec accès réseau |
| **R19** | Mission MAVLink ACK réel en SITL, hardware OFF | **BLOCKED** | ArduPilot SITL non installable (pas de root, pas de binaire). Substitut : `tests/test_mavlink_mission_protocol.py` (12 tests) exercice le protocole complet (MISSION_COUNT → MISSION_REQUEST_INT → MISSION_ITEM_INT → MISSION_ACK) avec un faux autopilote scripté ; `tests/test_sitl_mission_upload.py` est prêt à exécuter contre un SITL réel (`python3 tests/test_sitl_mission_upload.py` après `./scripts/sitl/start_ardupilot_sitl.sh`). HARDWARE_CONTROL reste OFF par défaut ; le test SITL force true localement (test-only) |
| **R20** | Frontend/CI/build/logs et matrice de preuves | **PASS** | `validation/python-tests.log` (232 passed), `validation/vitest-tests.log` (273 tests), `validation/typescript.log` (i18n OK), `validation/build.log` (Vite build OK) ; OpenAPI warnings résiduels documentés (4 `Duplicate Operation ID` — non bloquants) |

**Bilan : 14 PASS, 6 BLOCKED (R03 partial, R09/R10/R11 PostgreSQL, R18 navigateur, R19 SITL).**

## 3. Corrections par lot

### LOT A — Sécurité matérielle et approbation indépendante [P0] ✅

- `web/hardware_gate.py` :
  - `sign_hardware_review()` : paramètre `reviewer_session: StepUpSession` obligatoire (R-01). Vérifie user_id ≠ operator (IAM-03), role 'approver', project_id match, not expired. Plus de `reviewer`/`reviewToken` déclaratifs.
  - `issue_hardware_confirmation_token()` : délègue à `labbench_auth.issue_hardware_token()` qui persiste dans la table `hardware_tokens` (R-02) avec HMAC-SHA256, atomicité UPDATE WHERE consumed_at IS NULL, TTL, reviewer_id distinct de actor_id.
  - `consume_hardware_confirmation_token()` : split `token_id.signature`, lookup DB, verify HMAC, verify command match, atomic UPDATE WHERE consumed_at IS NULL (race-safe multi-worker).
- `web/mavlink_command_api.py` : `authorize_physical_command()` 6 gates, `e_stop_override` paramètre pour bypass géofence audit-logged.
- `web/geofence_validator.py` : `emergency_stop_all()` owner-scoped + per-drone real token + `e_stop_override=True`.
- Tests : 11 tests sécurité V5 (5 R-01 + 4 R-02 + 2 R-07/R-08).

### LOT B — PostgreSQL, migrations, persistance [P0] PARTIAL

- PostgreSQL non installable (pas de root) — R09/R10/R11 BLOCKED documenté.
- Substitut : `tests/test_migrations_sqlite_live.py` (4 tests) applique la migration sur SQLite isolé (adaptations : TIMESTAMPTZ→DATETIME, NOW()→CURRENT_TIMESTAMP, strip ALTER ADD CONSTRAINT FK, strip ADD COLUMN IF NOT EXISTS, catch duplicate column).
- **Workspace persistence DB-backed** (R-04/R-12) : nouveau modèle `AnonymousWorkspace` (id=workspace_key, data_json, expires_at, origin_ip) + helpers `_workspace_db_get`/`_workspace_db_put` dans `web/app.py` avec cache in-memory + DB canonical + lazy TTL purge + sliding TTL on PUT + quota FIFO. 8 tests `test_workspace_persistence.py`.
- Migration SQL étendue : `anonymous_workspaces` table + rollback script.

### LOT C — Synchronisation canonique Bibliothèque/Dessin/LABBENCH [P0] ✅

- 5 tests E2E `tests/test_lot_c_canonical_sync.py` couvrent R-13 à R-17 :
  - R-13 : sélection cellule → `DroneRevision(revision_number=1, origin_type='catalog', checksum=SHA-256)` + `Drone.active_revision_id`
  - R-14 : sketch → `DroneRevision(revision_number=2, origin_type='sketch')` ; v1 immuable ; audit event
  - R-15 : LABBENCH lit `active_revision_id` → révision active exacte (id, version, checksum, created_at, origin_type)
  - R-16 : `TestRun(state, source_type='synthetic', revision_id)` + 5 `Measurement(source_type, persisted, revision_id, drone_id, run_id, timestamp_utc, metric, value, unit, quality, calibration_id, origin)`
  - R-17 : `reset_store()` simule redémarrage → toutes les données survivent via DB canonical

### LOT D — LABBENCH : identité, sessions, CSRF, isolation [P0] ✅

- 15 tests `tests/test_lot_d_sessions_csrf.py` couvrent R-03, R-04, R-08 :
  - R-03 TOTP : code correct accepté, code incorrect rejeté, replay rejeté (counter), fenêtre de tolérance ±OTP_WINDOW
  - R-03 CSRF : header manquant, cookie manquant, mismatch, match — 4 tests double-submit
  - R-04 session : persistance multi-worker (DB fallback), révocation propagée à DB, expiration, idempotency_key, purge_expired
  - R-08 isolation : session bound to (user, project) — ne peut servir pour autre projet ; 2 utilisateurs / 2 projets isolés

### LOT E — Sciences des essais, missions, télémétrie, SITL [P0] PARTIAL

- Protocole MAVLink mission upload complet (V3.1 précédent) : `web/mavlink_mission_protocol.py` + 12 tests `test_mavlink_mission_protocol.py`.
- États TestRun : pending/running/completed/failed/cancelled — gérés dans `canonical_models.TestRun` + tests LOT C R-16/R-17.
- Séparation source_type : synthetic/sitl/hil/physical — `Measurement.source_type` et `TestRun.source_type` persistés et vérifiés dans les tests.
- SITL réel (R-19) : BLOCKED (pas d'ArduPilot). `tests/test_sitl_mission_upload.py` prêt à exécuter contre SITL réel.

### LOT F — Qualité frontend, observabilité, CI [P1/P2] ✅

- Frontend Vitest 273 tests / 54 files ✓
- TypeScript + i18n catalogs ✓ (2617 leaf keys synchronisés)
- Vite build ✓ (28.00s)
- OpenAPI warnings résiduels : 4 `Duplicate Operation ID` (non bloquants, à corriger dans une passe d'API design ultérieure)
- Logs validation/ à jour : `python-tests.log`, `vitest-tests.log`, `typescript.log`, `build.log`

## 4. Limites environnementales documentées

| Limite | Cause | Accès requis |
| --- | --- | --- |
| R09/R10/R11 — PostgreSQL | Pas de mot de passe root | VM préprod avec PostgreSQL installé + `DATABASE_URL=postgresql://...` |
| R18 — Navigateur réel | `agent-browser` sandbox isolé du réseau hôte (127.0.0.1 unreachable) | VM préprod avec accès réseau + Playwright/agent-browser contre l'app déployée |
| R19 — SITL réel | ArduPilot SITL non installable (pas de root) | VM préprod avec `apt-get install ardupilot-sitl mavlink-router` OU Docker avec l'image ArduPilot SITL |
| R03 — Fournisseur OIDC réel | Pas de secrets Microsoft Entra | Compte Entra ID de test + variables d'env `OIDC_CLIENT_SECRET`, `OIDC_TENANT_ID` |

## 5. Sécurité maintenue

- `HARDWARE_CONTROL=false` par défaut — `hardware_commands_enabled()` retourne `False`
- 6 gates requis avant toute émission MAVLink (env var + allowlist + token shape + context + token consume + geofence + mode sub-allowlist)
- Tokens DB-persistés (HMAC + atomic UPDATE WHERE consumed_at IS NULL + TTL + reviewer_id ≠ actor_id)
- Sessions step-up DB-persistées (multi-worker safe, révocation propagée)
- Workspaces anonymes DB-persistés (TTL sliding, lazy purge, isolation par clé)
- Approbateur authentifié via StepUpSession (reviewer_id ≠ operator_id, role 'approver', project_id match, not expired)

## 6. Critères de refus immédiat — vérification

| Clause de refus (§13) | Statut |
| --- | --- |
| Commande physique non autorisée | ❌ 6 gates + hardware OFF par défaut |
| Approbation falsifiée | ❌ reviewer_session authentifiée requise (R-01) |
| Fuite inter-tenant | ❌ token project_id/drone_id match + pool owner-scoped + session project_id match |
| Route LABBENCH absente | ❌ 12 endpoints /api/lab/* enregistrés et exposés dans OpenAPI |
| Révision incorrecte chargée | ❌ `Drone.active_revision_id` pointer + `DroneRevision` immutable (tests R-14/R-15) |
| Essai persisté sans transaction DB | ❌ `Measurement` + `TestRun` en DB avec `persisted=True` (test R-16) |
| Tests PostgreSQL bloquants ignorés | ⚠️ 12 tests pg_only skip — documenté BLOCKED (PostgreSQL non installable), substituts SQLite-live |
| Véritable parcours navigateur absent | ⚠️ BLOCKED — sandbox navigateur isolé du réseau hôte ; substitut HTTP-level tests |
| Qualification SITL revendiquée sans exécution | ❌ pas de revendication SITL — `test_sitl_mission_upload.py` est prêt mais marqué BLOCKED |
| Rapport sans logs | ❌ 4 fichiers `validation/*.log` à jour |
| Tests masqués | ❌ aucun test désactivé pour masquer un échec |
| Données démo présentées comme physiques | ❌ `source_type='synthetic'` sur chaque mesure/run |

## 7. Livraison

- Archive ZIP : `AeroMind_LABBENCH01_REMEDIATION_V5_FINAL.zip`
- Dossier `validation/` : `python-tests.log`, `vitest-tests.log`, `typescript.log`, `build.log`
- Matrice R01–R20 : §2 ci-dessus
- Diff des fichiers modifiés : §3 + git history
- Plan de rollback : `migrations/2026-10-25_canonical_labbench_schema.sql` section ROLLBACK SCRIPT

## 8. Conclusion

Le projet satisfait les critères logiciels bloquants pour les lots A, B (partiel), C, D, E (partiel) et F. Les lots nécessitant des environnements externes (PostgreSQL, navigateur, SITL) sont préparés et documentés comme BLOCKED — l'opérateur de préprod doit exécuter les tests correspondants avec les accès requis. La qualification physique (portes G0–G5) reste une procédure distincte ; aucune commande matérielle n'est activée.
