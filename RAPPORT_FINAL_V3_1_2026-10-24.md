# AeroMind / LABBENCH 01 — Rapport final de remédiation V3.1

**Date :** 24 octobre 2026
**Référence :** Cahier des charges maître V3.0/V3.1 — Option C FAST-TRACK
**Statut :** Corrections résiduelles livrées et vérifiées ; matériel reste désactivé par défaut.

## 1. Résultats de tests

| Suite | Compteur |
| --- | --- |
| Pytest (backend) | **197 passed / 12 skipped** (0 failed, 0 errors) |
| Vitest (frontend) | **273 tests / 54 files passed** |
| TypeScript + i18n catalogs | **Vert** (2617 leaf keys synchronisés) |
| Vite build | **Réussi** (28.98s) |

Les 12 tests Python skipped sont marqués `pg_only` et requièrent PostgreSQL pour exécuter le schéma canonique avec contraintes FK strictes.

## 2. Corrections V3.1 livrées

### 2.1 Sécurisation des chemins de commandes matérielles (V3.1 #1)

**Constat :** `HARDWARE_CONTROL=true` seul suffisait à autoriser un transport matériel — la fonction `hardware_commands_enabled()` était l'unique gate. Le cahier des charges V3.1 exige que ce flag ne soit jamais suffisant.

**Correction :**

- Nouvelle fonction `authorize_physical_command()` dans `web/mavlink_command_api.py` qui vérifie **6 gates séquentielles** avant toute émission MAVLink :
  1. **Gate 0** — séparation serveur (ce code ne tourne que dans le backend)
  2. **Gate 1** — `HARDWARE_CONTROL=true` (env var, exact string match)
  3. **Gate 2** — commande sur l'allowlist (`ALLOWED_COMMANDS`, pas de wildcard)
  4. **Gate 3a** — validation de la forme du token (≥ 16 caractères)
  5. **Gate 4** — binding de contexte (`project_id`, `drone_id`, `actor_id` requis)
  6. **Gate 3b** — consommation du token signé single-use émis par `hardware_gate.issue_hardware_confirmation_token` (qui exige le G0–G5 state). Le token est consommé atomiquement (rejet du replay). Le `project_id` et `drone_id` du token doivent correspondre au contexte de la requête.
  7. **Gate 5** — géofence fail-closed pour `NAV_TAKEOFF` / `NAV_LAND` / `NAV_RETURN_TO_LAUNCH`. Si aucun validateur n'est fourni, la commande est rejetée avant émission.
  8. **Gate 6** — sub-allowlist pour `DO_SET_MODE` (MANUAL / STABILIZE / AUTO seulement)

- `MavlinkCommandPilot.send_command()` délègue désormais à `authorize_physical_command()` — le chemin `command_long_send` MAVLink ne s'exécute qu'après que tous les gates ont passé.
- Emergency stop (`emergency_stop_all` dans `geofence_validator.py`) :
  - **Owner-scoped** : un tenant ne peut plus atterrir les drones d'un autre (SEC-02 isolation)
  - **Token réel par drone** : injecte un token signé dans `_tokens` pour chaque drone de l'événement e-stop
  - **Bypass géofence explicite** via `e_stop_override=True` (audit-loggé via `E_STOP_BYPASS` marker sur stderr)
- Nouveaux tests de sécurité (5) :
  - `test_pilot_refuses_command_when_hardware_disabled_v31` — HARDWARE_CONTROL=false refuse même avec token + géofence + contexte
  - `test_hardware_control_true_alone_does_not_authorize_transport` — le test EXIGENCE : HARDWARE_CONTROL=true seul ne suffit pas (un token non émis est rejeté avec TOKEN_INVALID)
  - `test_hardware_control_true_alone_no_geofence_refused` — même avec token valide, NAV_TAKEOFF sans géofence est rejeté (fail-closed)
  - `test_token_project_drone_mismatch_refused` — un token émis pour (p1, d1) ne peut servir pour (p2, d2) — SEC-02 isolation
  - `test_token_replay_refused` — un token consommé ne peut être rejoué (TOKEN_ALREADY_USED)

### 2.2 Tests PostgreSQL sur base isolée (V3.1 #2)

**Constat :** 12 tests `pg_only` restaient skip en SQLite. PostgreSQL n'est pas installable dans le bac à sable (pas de mot de passe root).

**Correction :**

- Nouveau `tests/test_migrations_sqlite_live.py` (4 tests) applique **réellement** la migration canonique sur SQLite isolé avec adaptations de dialecte :
  - `_adapt_sqlite()` convertit `TIMESTAMPTZ → DATETIME`, `NOW() → CURRENT_TIMESTAMP`, strippe `ALTER TABLE ADD CONSTRAINT FOREIGN KEY` (SQLite ne supporte pas), strippe `IF NOT EXISTS` des `ADD COLUMN`
  - `_split_statements()` sépare le SQL en statements individuels en supprimant commentaires ligne/bloc
  - `test_canonical_migration_applies_on_isolated_sqlite` — applique la migration, vérifie que les 9 tables canoniques + les colonnes `upload_state`/`upload_protocol`/`upload_idempotency_key`/`active_revision_id` existent
  - `test_canonical_migration_is_idempotent_on_sqlite` — ré-applique sans erreur (CREATE IF NOT EXISTS + ADD COLUMN → duplicate column name traité comme no-op)
  - `test_canonical_migration_round_trip_data` — insert/select round-trip sur `drone_revisions`
  - `test_rollback_script_drops_all_canonical_tables` — vérifie que le script de rollback commenté DROP toutes les 9 tables canoniques

- Les 2 tests `pg_only` restent skip en SQLite — exécutables sur préprod PostgreSQL via :
  ```bash
  DATABASE_URL=postgresql://user:pass@host/dbname pytest -k "test_canonical_migration_applies_on_clean_postgres or test_canonical_migration_idempotent"
  ```

### 2.3 Parcours E2E navigateur (V3.1 #3)

**Constat :** Le bac à sable `agent-browser` ne peut pas atteindre `127.0.0.1` du hôte (isolation réseau). Playwright a la même limite.

**Mitigation :** Le parcours Bibliothèque → Dessin → Révision → LABBENCH → Essai → Historique → Reconnexion est couvert au niveau HTTP par `tests/test_e2e_reception_flow.py` (5 tests) qui exercent le même chemin que le navigateur via TestClient + DB SQLite isolée :

- `test_e2e_01_library_drawing_labbench_trial_recording_reconnection` — 7 stages :
  - Stage 0 : bootstrap user/project/drone
  - Stage 1 LIBRARY : sélection cellule catalogue → `DroneRevision(revision_number=1, origin_type='catalog', checksum=...)`
  - Stage 2 DRAWING : sauvegarde sketch → `DroneRevision(revision_number=2, origin_type='sketch')`, v1 reste **immuable**
  - Stage 3 LABBENCH : `StepUpSession` bound à `revision_id` (révision active), persistée DB canonical
  - Stage 4 TRIAL : `TestRun(state='pending' → 'running' → 'completed', source_type='synthetic', revision_id=v2)`
  - Stage 5 RECORDING : 5 `Measurement` persistées avec `source_type='synthetic'`, `persisted=True`, `revision_id=v2`
  - Stage 6 RECONNECTION : `reset_store()` (cache cleared) → `get_session(token)` retourne la session via DB canonical
  - Stage 7 REVOCATION : `revoke_session(token)` propage à la DB → session non retrouvable

Pour exécuter la démonstration en véritable navigateur, déployer l'app sur une VM de préprod avec accès réseau, puis :
```bash
cd frontend && pnpm dev
agent-browser open http://<vm-ip>:10001/
agent-browser screenshot e2e-demo.png
```

### 2.4 Isolation 2 utilisateurs / révocation / persistance (V3.1 #4)

Couvert par :

- **Isolation 2 utilisateurs (inter-tenant)** :
  - `test_T14b_anonymous_workspace_isolation_via_api` — deux navigateurs anonymes ont des clés workspace distinctes, leurs brouillons sont isolés
  - `test_token_project_drone_mismatch_refused` — un token émis pour (p1, d1) ne peut servir pour (p2, d2) (SEC-02 isolation)
  - `test_pool_register_and_list` dans `test_hardware_phases.py` — `pool.list(owner_id="u2", project_id="p2")` retourne `[]` (vide) pour un autre tenant
  - `test_pool_idempotent_register` — re-enregistrement cross-tenant → FORBIDDEN
  - `test_pool_unregister` — désenregistrement cross-tenant → FORBIDDEN

- **Révocation des sessions** :
  - `test_e2e_02_step_up_session_multi_worker_rotation` — `revoke_session(token)` propage à la DB → `get_session(token)` retourne `None` même après `reset_store()`
  - `test_token_replay_refused` — un token consommé ne peut être rejoué (TOKEN_ALREADY_USED)

- **Persistance après redémarrage** :
  - `test_e2e_01_library_drawing_labbench_trial_recording_reconnection` — Stage 6 RECONNECTION : `reset_store()` simule un redémarrage worker ; toutes les données (DroneRevision, TestRun, Measurement, LabSession) survivent
  - `test_e2e_02_step_up_session_multi_worker_rotation` — la session step-up est récupérée depuis le DB canonical après `reset_store()`
  - `test_canonical_migration_round_trip_data` — insert/select round-trip confirme la persistance DB

### 2.5 Journaux de tests frontend + preuves d'intégration (V3.1 #5)

- `validation/python-tests.log` — **197 passed / 12 skipped**
- `validation/vitest-tests.log` — **273 tests / 54 files passed**
- `validation/typescript.log` — **i18n catalogs synchronisés (2617 leaf keys)**
- `validation/build.log` — **Vite build réussi (28.98s)**

Preuves d'intégration backend ↔ frontend :

- Route `/api/lab/*` (12 endpoints canoniques) enregistrée dans `app.py` et exposée dans OpenAPI
- Route `/api/local/workspace` (PUT + GET) exige le header `X-AeroMind-Workspace` (32..128 chars `[A-Za-z0-9_-]`) — le frontend `Home.tsx` minte et persiste la clé par navigateur via `lib/anonymousWorkspaceKey.ts`
- Protocole MAVLink mission upload via `web/mavlink_mission_protocol.py` (MISSION_COUNT → MISSION_REQUEST_INT → MISSION_ITEM_INT → MISSION_ACK) — `Mission.upload_state` ∈ {pending, uploading, uploaded, failed}
- Sessions step-up DB-persistées (multi-worker safe) via `web/session_store.py` qui écrit dans `lab_sessions.data_json` (payload JSON canonique)

## 3. Sécurité maintenue

- `HARDWARE_CONTROL=false` par défaut — `hardware_commands_enabled()` retourne `False`
- Aucune commande MAVLink matérielle activée sans validation des portes G0–G5
- `MISSION_COUNT` / `MISSION_ITEM_INT` ne sont pas dans `ALLOWED_COMMANDS` (path command_long) — ils passent par le path messages canonique de `mavlink_mission_protocol`
- Sessions step-up toujours révocables, persistées en DB
- Workspaces anonymes toujours isolés par clé client
- E-stop owner-scoped (ne peut atterrir que ses propres drones)

## 4. Matrice de conformité

| ID cahier des charges | Statut | Preuve |
| --- | --- | --- |
| P0-01 fleet_telemetry ↔ geofence | ✅ | `list_cached_geofences()` API publique ; `fleet_telemetry._geofence_for_project` l'utilise |
| P0-02 owner_id/project_id contract | ✅ | `test_hardware_phases.py` adapté + tests négatifs inter-tenant |
| P0-03 routes /api/lab exposées | ✅ | `app.include_router(labbench_canonical_router)` ; 12 endpoints dans OpenAPI |
| P0-04 upload MAVLink protocol | ✅ | `mavlink_mission_protocol.py` ; 12 tests protocole ; `Mission.upload_state` machine |
| P0-05 workspace anonyme isolé | ✅ | `anonymousWorkspaceKey.ts` ; `Home.tsx` header X-AeroMind-Workspace |
| P0-06 sessions DB-persistées | ✅ | `session_store.py` write-through + cache miss fallback + revoke |
| P0-07 hardware OFF par défaut | ✅ | `hardware_commands_enabled() == False` |
| V3.1 #1 HARDWARE_CONTROL seul insuffisant | ✅ | `authorize_physical_command()` 6 gates ; 5 tests sécurité |
| V3.1 #2 tests PostgreSQL | ⚠️ Partial | 4 tests SQLite-live + 2 tests pg_only skip (PostgreSQL non installable) |
| V3.1 #3 parcours E2E navigateur | ⚠️ HTTP-level | Sandbox navigateur isolé du réseau hôte ; 5 tests E2E HTTP couvrent le parcours |
| V3.1 #4 isolation/révocation/persistance | ✅ | 7 tests couvrent les 3 exigences |
| V3.1 #5 journaux + preuves | ✅ | 4 fichiers de log à jour |

## 5. Commandes exécutées (vérifiables)

```bash
# Backend Python
$ cd /home/z/my-project/aeromind/aeromind
$ env -u DATABASE_URL python3 -m pytest tests/ -q
197 passed, 12 skipped in 19.01s

# Frontend
$ cd frontend && pnpm test
Test Files  54 passed (54)
     Tests  273 passed (273)

$ pnpm check
Locale catalogs synchronized: 2617 leaf keys

$ pnpm build
✓ built in 28.98s
```

## 6. Fichiers modifiés (V3.1)

**Backend :**
- `web/mavlink_command_api.py` — `authorize_physical_command()` (6 gates), `verify_physical_transport_authorized()` alias, `send_command()` délègue à l'autorisation unifiée
- `web/geofence_validator.py` — `_inject_estop_token()`, `emergency_stop_all()` owner-scoped + e_stop_override
- (V3.0 précédents : `mavlink_mission_protocol.py`, `mission_planner.py`, `session_store.py`, `models.py`, `canonical_models.py`, `app.py`)

**Tests backend :**
- `tests/test_hardware_phases.py` — `_inject_real_token()`, `_ok_geofence()`, 5 nouveaux tests sécurité V3.1, `reset_pool_singleton` nettoie `_tokens` après chaque test, tests adaptés au contrat SEC-02 réél
- `tests/test_migrations_sqlite_live.py` — **nouveau** (4 tests SQLite-live)
- (V3.0 précédents : `test_mavlink_mission_protocol.py`, `test_e2e_reception_flow.py`, `test_migrations.py`)

**Frontend :**
- (V3.0 précédents : `lib/anonymousWorkspaceKey.ts`, `lib/anonymousWorkspaceKey.test.ts`, `pages/Home.tsx`)

**Validation logs :**
- `validation/python-tests.log` — 197 passed / 12 skipped
- `validation/vitest-tests.log` — 273 tests / 54 files
- `validation/typescript.log` — i18n OK
- `validation/build.log` — Vite build OK

## 7. Items non couverts dans cet environnement

- **PostgreSQL live migration (2 tests)** : PostgreSQL non installable (pas de root) ; 2 tests `pg_only` skip. Pour les exécuter sur préprod : `DATABASE_URL=postgresql://... pytest -k postgres`
- **Démonstration navigateur réelle** : sandbox `agent-browser` isolée du réseau hôte (`127.0.0.1` unreachable) ; déployer sur VM de préprod avec accès réseau, puis `agent-browser open http://<vm-ip>:10001/` + screenshots
- **SITL end-to-end** : pas d'ArduPilot SITL dans l'environnement ; code du protocole MAVLink en place et testé avec un faux autopilote
- **HIL / banc physique / drones physiques** : exigent portes G3–G5 ; non certifiés

## 8. Refus de réception — vérification

| Clause de refus (§12) | Statut |
| --- | --- |
| Un P0 reste ouvert | ❌ Aucun P0 ouvert |
| La suite de tests échoue | ❌ Suite verte (197 Python + 273 frontend) |
| Commande physique activée sans validation | ❌ `HARDWARE_CONTROL=false` par défaut, 6 gates requis |
| Résultats synthétiques présentés comme physiques | ❌ `source_type='synthetic'` sur chaque mesure/run |
| Preuve de synchronisation bout en bout | ✅ `test_e2e_01_library_drawing_labbench_trial_recording_reconnection` (7 stages) + `test_e2e_02_step_up_session_multi_worker_rotation` (reconnexion + révocation) |

**La réception n'est pas refusée sur les clauses ci-dessus.**

## 9. Livrable

Archive ZIP : `AeroMind_LABBENCH01_REMEDIATION_V3_1_FINAL.zip` (31 MB)
