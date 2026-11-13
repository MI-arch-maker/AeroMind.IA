# AeroMind / LABBENCH 01 — Rapport de corrections résiduelles V3

**Date :** 24 octobre 2026
**Référence :** Cahier des charges maître V3.0 — Option C FAST-TRACK
**Objet :** Corrections résiduelles obligatoires (MAVLink protocol, sync workspace, validations E2E)

## 1. Résultats de tests

| Suite | Avant corrections résiduelles | Après corrections résiduelles |
| --- | --- | --- |
| Pytest (backend) | 164 passed / 10 skipped | **189 passed / 12 skipped** (+25 tests : 12 MAVLink mission protocol + 5 E2E + 8 migration validators) |
| Vitest (frontend) | 262 tests / 53 files | **273 tests / 54 files** (+11 tests anonymousWorkspaceKey) |
| TypeScript + i18n | Vert | **Vert** (catalogues synchronisés : 2617 leaf keys) |
| Vite build | Réussi | **Réussi** (28.98s) |

Les 12 tests Python skipped sont marqués `pg_only` et requièrent PostgreSQL pour exécuter le schéma canonique avec contraintes FK strictes et la migration live ; ils sont exclus en mode SQLite de test.

## 2. Corrections résiduelles

### 2.1 Protocole MAVLink de téléversement des missions

**Constat :** Le code utilisait `pilot.send_command("MISSION_COUNT", ...)` et `pilot.send_command("MISSION_ITEM_INT", ...)`, c'est-à-dire des frames `COMMAND_LONG` (id 76) pour transmettre des items de mission. C'est une **violation du protocole MAVLink** : `MISSION_COUNT` (msg id 21) et `MISSION_ITEM_INT` (msg id 52) sont des **messages** autonomes, pas des paramètres d'une commande générique. L'autopilote ne demandait jamais les items (il n'a jamais reçu un vrai MISSION_COUNT), puis le code déclarait "uploaded" sans ACK final.

**Correction :**

- Nouveau module : `web/mavlink_mission_protocol.py`
  - `upload_mission(connection, waypoints, ...)` implémente le protocole canonique :
    1. Envoi `MISSION_COUNT` via `connection.mission_count_send(target_system, target_component, count)`
    2. Attente `MISSION_REQUEST_INT` (id 51) ou `MISSION_REQUEST` legacy (id 40) via `recv_match(type=..., blocking=True, timeout=REQUEST_TIMEOUT_S)`
    3. Pour chaque séquence demandée, envoi `MISSION_ITEM_INT` via `connection.mission_item_int_send(...)` avec les champs MAV (frame, command, current, autocontinue, param1..4, x/y/z en int1e7)
    4. Attente `MISSION_ACK` (id 44) final via `recv_match(type="MISSION_ACK", timeout=ACK_TIMEOUT_S)`
    5. Vérification `ack_type == MAV_MISSION_ACCEPTED` (0) ; sinon `state='failed'`
  - Gestion des requêtes dupliquées (retry ArduPilot), séquences hors plage, ACK précoce (rejet), flood de requêtes (limite `MAX_TOTAL_REQUESTS=1024`), timeout borné (`REQUEST_TIMEOUT_S=5s`, `ACK_TIMEOUT_S=10s`).
  - Hard-failure sur tout échec — jamais d'annonce 'uploaded' sans ACK valide.

- `web/mission_planner.py` :
  - `upload_mission_to_drone` délègue maintenant à `web.mavlink_mission_protocol.upload_mission` au lieu d'appeler `pilot.send_command` en boucle.
  - Persiste `Mission.upload_state` ∈ {pending, uploading, uploaded, failed}, `upload_error`, `upload_protocol="MISSION_COUNT+MISSION_REQUEST_INT+MISSION_ITEM_INT+MISSION_ACK"`, `upload_idempotency_key`.
  - Plus de `_issue_mission_item_token` (n'était pas un vrai protocole MAVLink).

- Nouveaux tests : `tests/test_mavlink_mission_protocol.py` (12 tests)
  - `test_upload_mission_full_success` — happy path 3 waypoints, ACK accepté
  - `test_upload_mission_handles_out_of_order_requests` — requêtes ArduPilot dans le désordre + retry dupliqué
  - `test_upload_mission_handles_legacy_mission_request` — autopilote ancien (MISSION_REQUEST au lieu de MISSION_REQUEST_INT)
  - `test_upload_mission_no_ack_returns_failed` — timeout ACK → failed
  - `test_upload_mission_no_requests_returns_failed` — autopilote muet → failed
  - `test_upload_mission_rejected_ack_returns_failed` — ACK type=DENIED → failed avec label
  - `test_upload_mission_early_ack_rejected_returns_failed` — ACK précoce type=INVALID → failed
  - `test_upload_mission_no_waypoints_returns_failed` — 0 waypoints → failed
  - `test_upload_mission_out_of_range_seq_recorded_as_failure` — séquence hors plage enregistrée
  - `test_upload_mission_hardware_disabled_returns_failed` — HARDWARE_CONTROL=false → refused
  - `test_upload_mission_transport_missing_methods_returns_failed` — transport incohérent → failed
  - `test_waypoint_item_default_values` — valeurs par défaut (MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, MAV_CMD_NAV_WAYPOINT)

### 2.2 Synchronisation des brouillons anonymes

**Constat :** Le frontend `Home.tsx` appelait `PUT /api/local/workspace` **sans** le header `X-AeroMind-Workspace`. Après la correction P0-05 (qui exige ce header), l'appel échouait en 400. Deux navigateurs anonymes ne pouvaient plus du tout sauvegarder leurs brouillons côté serveur.

**Correction :**

- Nouveau module frontend : `frontend/client/src/lib/anonymousWorkspaceKey.ts`
  - `getOrCreateWorkspaceKey(storage)` minte une clé opaque de 43 chars base64url (≥ 122 bits d'entropie via `crypto.getRandomValues`) sur la première visite, la persiste dans `localStorage`, et la réutilise sur les visites suivantes du même navigateur.
  - `isValidWorkspaceKey(key)` valide contre le regex backend `^[A-Za-z0-9_-]{32,128}$`.
  - `anonymousWorkspaceHeaders(storage)` retourne `{ "X-AeroMind-Workspace": key }` ou `null` (SSR / no-storage).
  - `readWorkspaceKey(storage)` — read-only, ne minte pas.

- Nouveaux tests : `frontend/client/src/lib/anonymousWorkspaceKey.test.ts` (11 tests)
  - Validation de la forme de clé (rejet 'default', short, forbidden chars)
  - Mintage + persistance + idempotence (même clé au 2e appel)
  - Overwrite d'une clé legacy invalide
  - Null en contexte non-navigateur
  - Isolation de deux navigateurs (clés distinctes)

- `Home.tsx` (PUT /api/local/workspace) :
  - Ajoute `X-AeroMind-Workspace: <key>` au header via `anonymousWorkspaceHeaders()`
  - Si pas de header possible (SSR), saute l'appel réseau et garde `localStorage` comme source de vérité
  - Credentials `include` pour cookie de session

- `Home.tsx` (GET au montage) :
  - Nouvel effet qui récupère le brouillon serveur au montage (premier effet `localServerHydrated`), avec le header `X-AeroMind-Workspace`
  - Hydrate l'état React (`projects`, `activeProjectId`, `project`, `requirements`, `config`, `runId`) depuis le payload serveur
  - Échec réseau non-fatal — `localStorage` reste la source de vérité du navigateur

### 2.3 Validations de réception E2E

**Constat :** Les tests T01–T05 existants étaient marqués `pg_only` et skip en SQLite. Aucun test ne couvrait le flux complet Library → Drawing → LABBENCH → Trial → Recording → Reconnection en mode exécutable sans PostgreSQL.

**Correction :**

- Nouveaux tests E2E : `tests/test_e2e_reception_flow.py` (5 tests)
  - `test_e2e_01_library_drawing_labbench_trial_recording_reconnection` — flux complet 6 stages :
    - Stage 0 : bootstrap user/project/drone
    - Stage 1 LIBRARY : sélection cellule catalogue → `DroneRevision(revision_number=1, origin_type='catalog', checksum=...)`
    - Stage 2 DRAWING : sauvegarde sketch → `DroneRevision(revision_number=2, origin_type='sketch')`, v1 reste **immuable**
    - Stage 3 LABBENCH : `StepUpSession` bound à `revision_id` (révision active), persistée via `store_session` (DB canonical)
    - Stage 4 TRIAL : `TestRun(state='pending' → 'running' → 'completed', source_type='synthetic', revision_id=v2)`
    - Stage 5 RECORDING : 5 `Measurement` persistées avec `source_type='synthetic'`, `persisted=True`, `revision_id=v2`
    - Stage 6 RECONNECTION : `reset_store()` (cache cleared) → `get_session(token)` doit toujours retourner la session via DB canonical
    - Stage 7 REVOCATION : `revoke_session(token)` propage à la DB → session non retrouvable
  - `test_e2e_02_step_up_session_multi_worker_rotation` — `issue_step_up_session` + `reset_store()` + `get_session` retourne la session via DB ; `revoke_session` propage cross-worker
  - `test_e2e_03_drone_version_immutability_past_runs_preserved` — EXIGENCE SYNC-07 : publier une révision v2 ne rétroaltère pas un `TestRun` lié à v1 ; `revision_id` du run reste v1
  - `test_e2e_04_anonymous_workspace_isolation_via_api` — smoke check de l'isolation par header `X-AeroMind-Workspace`
  - `test_e2e_05_mission_upload_protocol_rejects_no_ack` — smoke check du protocole MAVLink : pas d'ACK → `state='failed'`

- Nouveaux tests de migration : `tests/test_migrations.py` (10 tests, 8 statiques + 2 PostgreSQL)
  - Validation structurelle (sans DB) :
    - Fichier de migration existe
    - Bornes de transaction (`BEGIN`/`COMMIT`) présentes
    - Équilibre CREATE TABLE / DROP TABLE (rollback réversible)
    - Équilibre ALTER TABLE ADD COLUMN / DROP COLUMN (rollback réversible)
    - Pas de DDL destructif dans la section active (TRUNCATE, DELETE FROM, DROP TABLE)
    - Colonnes `upload_state`/`upload_started_at`/`upload_error`/`upload_protocol`/`upload_idempotency_key` présentes sur `missions`
    - Colonne `active_revision_id` présente sur `drones`
    - Table `lab_sessions` créée
  - Exécution live PostgreSQL (skip si `DATABASE_URL` n'est pas PostgreSQL) :
    - `test_canonical_migration_applies_on_clean_postgres` — crée users/projects/drones/missions puis applique la migration
    - `test_canonical_migration_idempotent` — ré-applique la migration sans erreur

### 2.4 Migration canonical schema étendue

`migrations/2026-10-25_canonical_labbench_schema.sql` :
- Ajoute `ALTER TABLE missions ADD COLUMN upload_protocol` + `upload_idempotency_key` + index (P0-04)
- Ajoute `ALTER TABLE drones ADD COLUMN active_revision_id` + index (SYNC-02)
- Rollback script étendu pour dropper ces colonnes/index en ordre inverse

## 3. Corrections additionnelles

- `web/canonical_models.py` : `LabSession` déjà aliasé à `models.LabSession` (V3.0) — confirmé stable.
- `web/session_store.py` : `_row_payload` convertit `frozenset` → `list` pour sérialisation JSON ; `_session_from_payload` reconstruit `frozenset` depuis la liste.
- `web/models.py` : `Drone.active_revision_id` (String(36), nullable, indexé) ajouté au modèle legacy.
- `frontend/client/src/pages/Home.tsx` : types cast (ProjectRecord, Requirement, ConceptConfig) alignés avec le schéma workspace.

## 4. Verrouillage de sécurité maintenu

- `HARDWARE_CONTROL=false` par défaut (P0-07) — vérifié par `hardware_commands_enabled()` qui retourne `False`.
- Aucune commande MAVLink matérielle activée sans validation des portes G0–G5.
- `MISSION_COUNT`/`MISSION_ITEM_INT` ne sont pas ajoutés à `ALLOWED_COMMANDS` (command_long allowlist) — ils passent par le path message-canonique de `mavlink_mission_protocol`, séparé du path command_long.
- Sessions step-up toujours révocables, persistées en DB (multi-worker safe).
- Workspaces anonymes toujours isolés par clé client (rejet `default` + borne 256).

## 5. Commandes exécutées (vérifiables)

```bash
# Backend Python
$ cd /home/z/my-project/aeromind/aeromind
$ env -u DATABASE_URL python3 -m pytest tests/ -q
189 passed, 12 skipped in 18.71s

# Frontend
$ cd frontend && pnpm test
Test Files  54 passed (54)
     Tests  273 passed (273)

$ pnpm check
Locale catalogs synchronized: 2617 leaf keys

$ pnpm build
✓ built in 28.98s
```

## 6. Items non couverts dans cet environnement

- **PostgreSQL live migration** : 2 tests skip en SQLite ; pour les exécuter : `DATABASE_URL=postgresql://user:pass@host/dbname pytest -k test_canonical_migration_applies_on_clean_postgres`.
- **SITL end-to-end** : pas d'ArduPilot SITL dans l'environnement. Le code du protocole MAVLink est en place et testé avec un faux autopilote ; le test SITL complet (avec ACK réel d'un ArduPilot) reste à exécuter sur un déploiement avec `ardupilot --no-mavproxy` + `mavlink-routerd`.
- **HIL / banc physique / drones physiques** : exigent portes G3–G5 ; non certifiés.
- **Avertissement résiduel** : `PytestCollectionWarning: cannot collect test class 'TestRun'` — inoffensif (l'alias `_TestRunORM` contourne déjà la collection par pytest).

## 7. Fichiers modifiés (diff summary)

- **Backend** :
  - `web/mavlink_mission_protocol.py` — **nouveau** : protocole MAVLink mission upload (MISSION_COUNT → MISSION_REQUEST_INT → MISSION_ITEM_INT → MISSION_ACK)
  - `web/mission_planner.py` — délègue à `upload_mission` au lieu de `pilot.send_command` en boucle
  - `web/session_store.py` — `_row_payload` gère `frozenset` → list ; `_session_from_payload` reconstruit `frozenset`
  - `web/models.py` — `Drone.active_revision_id` ajouté
  - `migrations/2026-10-25_canonical_labbench_schema.sql` — colonnes mission_upload_protocol/idempotency_key + drone.active_revision_id + rollback étendu

- **Frontend** :
  - `frontend/client/src/lib/anonymousWorkspaceKey.ts` — **nouveau** : mintage + persistance clé workspace par navigateur
  - `frontend/client/src/lib/anonymousWorkspaceKey.test.ts` — **nouveau** : 11 tests d'isolation
  - `frontend/client/src/pages/Home.tsx` — PUT /api/local/workspace inclut le header ; GET au montage hydrate le state

- **Tests backend** :
  - `tests/test_mavlink_mission_protocol.py` — **nouveau** : 12 tests protocole MAVLink
  - `tests/test_e2e_reception_flow.py` — **nouveau** : 5 tests E2E Library→Drawing→LABBENCH→Trial→Recording→Reconnection
  - `tests/test_migrations.py` — **nouveau** : 8 validateurs statiques + 2 PostgreSQL live

- **Validation logs** :
  - `validation/python-tests.log` — 189 passed / 12 skipped
  - `validation/vitest-tests.log` — 273 tests / 54 files
  - `validation/typescript.log` — i18n catalogs synchronisés
  - `validation/build.log` — build Vite ✓

## 8. Refus de réception — vérification

| Clause de refus (§12) | Statut |
| --- | --- |
| Un P0 reste ouvert | ❌ Aucun P0 ouvert |
| La suite de tests échoue | ❌ Suite verte (189 Python + 273 frontend) |
| Commande physique activée sans validation | ❌ `HARDWARE_CONTROL=false` par défaut |
| Résultats synthétiques présentés comme physiques | ❌ `source_type='synthetic'` sur chaque mesure/run |
| Preuve de synchronisation bout en bout | ✅ `test_e2e_01_library_drawing_labbench_trial_recording_reconnection` couvre le flux 6 stages + reconnexion |

**La réception n'est pas refusée sur les clauses ci-dessus.**
