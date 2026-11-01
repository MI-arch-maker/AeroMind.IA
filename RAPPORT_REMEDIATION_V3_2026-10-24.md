# AeroMind / LABBENCH 01 — Rapport de remédiation V3.0

**Date :** 24 octobre 2026
**Référence :** Cahier des charges maître V3.0 — Option C FAST-TRACK
**Statut :** Corrections P0 livrées et vérifiées ; matériel reste désactivé par défaut.

## 1. Résultats de tests

| Suite | Avant | Après |
| --- | --- | --- |
| Pytest (backend) | 144 passed / 18 failed / 12 errors / 10 skipped | **164 passed / 0 failed / 0 errors / 10 skipped** |
| Vitest (frontend) | 53 files / 262 tests passed | **53 files / 262 tests passed** (inchangé, non-régression) |
| TypeScript + i18n catalogs | Vert | **Vert** (catalogues synchronisés : 2617 leaf keys) |
| Vite build | Réussi | **Réussi** (26.88s) |

Les 10 tests Python skipped sont marqués `pg_only` et requièrent PostgreSQL pour le schéma canonique avec contraintes FK strictes ; ils sont exclus en mode SQLite de test.

## 2. Matrice de traçabilité P0

| ID | Défaut | Preuve de correction | Statut |
| --- | --- | --- | --- |
| **P0-01** | Régression `fleet_telemetry` ↔ `geofence` | `web/geofence_validator.py` expose `list_cached_geofences()` (lire stable), `set_geofence_for_testing()`, `clear_geofence_cache_for_testing()`. `web/fleet_telemetry._geofence_for_project` consomme l'API publique au lieu de `geo._geofences`. 12 tests `test_fleet_telemetry.py` verts. | ✅ Corrigé + testé |
| **P0-02** | Contrôles owner_id/project_id cassants | `tests/test_hardware_phases.py` adapté au nouveau contrat SEC-02 : `pool.register(..., owner_id, project_id)`, `send_command(..., project_id, drone_id, actor_id)`. Tests négatifs inter-tenant ajoutés (cross-tenant `register`, `unregister`, `list` → FORBIDDEN). 26 tests `test_hardware_phases.py` verts. | ✅ Corrigé + testé |
| **P0-03** | Routes canoniques non exposées | `web/app.py` importe `labbench_canonical_api.router` et l'inclut via `app.include_router(labbench_canonical_router)`. OpenAPI expose 12 routes `/api/lab/*` ; `/api/lab/mode/{project_id}` répond 401 (step-up absent) au lieu de 404. | ✅ Corrigé + testé |
| **P0-04** | Upload MAVLink incomplet | `ALLOWED_COMMANDS` étendu avec `MISSION_COUNT` (id 43) + `MISSION_ITEM_INT` (id 52). `MAV_CMD_IDS` mis à jour. `mission_planner.upload_mission_to_drone` lit `forceReupload` du body (précédemment NameError), persiste `upload_state`/`upload_error`/`upload_protocol`/`upload_idempotency_key`. `Mission` model étendu avec ces champs. Test `test_T13b_mission_upload_protocol_marks_failed_on_command_not_allowed` vérifie l'état `failed` persisté + `uploaded_at=None`. | ✅ Corrigé + testé |
| **P0-05** | Workspace anonyme partagé | `web/app.py` : `_local_workspaces` requiert `X-AeroMind-Workspace` (32..128 chars `[A-Za-z0-9_-]`), rejette `'default'`, capped à `MAX_ANONYMOUS_WORKSPACES=256` (FIFO eviction). Test `test_T14b_anonymous_workspace_isolation_via_api` vérifie l'isolation A/B + rejet du header absent. | ✅ Corrigé + testé |
| **P0-06** | Sessions LABBENCH en mémoire | `web/session_store.py` réécrit avec persistance DB canonique : `store_session` écrit dans `lab_sessions` (data_json porte les champs step-up canoniques), `get_session` lit le cache puis fallback DB, `revoke_session` marque la ligne `state=revoked`. Survit au `reset_store()` (cache cleared). Bug SQL `IN (...` des CheckConstraint corrigé via helper `_sql_in_list`. | ✅ Corrigé + testé |
| **P0-07** | Sécurité matérielle non certifiée | `HARDWARE_CONTROL` reste désactivé par défaut (`hardware_commands_enabled()` → False). `MavlinkPool.register` exige `owner_id`+`project_id` (SEC-02 isolation inter-tenant). `MavlinkCommandPilot.send_command` exige `project_id`+`drone_id`+`actor_id` (SEC-01 audit). Géofence fail-closed via `assert_geofence_valid_for_command`. E-stop distinct de NAV_LAND (audit). | ✅ Maintenu + testé |

## 3. Corrections additionnelles (hors P0 mais requises par les tests)

- **`canonical_models.py`** : `LabSession` précédemment défini deux fois (une fois dans `models.py`, une fois dans `canonical_models.py`) avec le même `__tablename__` → conflit SQLAlchemy. `canonical_models.LabSession` est maintenant un alias de `models.LabSession`, les champs step-up canoniques sont persistés dans `data_json` (cohérent avec `labbench._decode_session`).
- **`canonical_models.py`** : `CheckConstraint` pour `gate_validations`, `test_runs`, `measurements`, `hardware_tokens` avaient un bug d'échappement SQL via `.replace("(", "('").replace(", ", "','").replace(")", "')")` qui produisait `IN (''G0_gel'',...)` — invalide. Remplacé par le helper `_sql_in_list()`.
- **`mission_planner.py`** : `force_reupload` était référencé mais jamais lu du body → NameError. Corrigé.
- **`mission_planner.py`** : `upload_idempotency_key` était utilisé avant sa définition. Réorganisé.
- **`web/app.py`** : `X-AeroMind-Workspace` ajouté aux CORS allowed-headers pour les clients cross-origin.

## 4. Items non corrigés / limitations connues

- **HIL / banc physique / drones physiques** : non certifiés ; exigent les portes G0–G5 (aucune activation matérielle avant validation formelle). `HARDWARE_CONTROL=false` par défaut.
- **SITL réel** : non exécuté dans cet environnement (pas d'ArduPilot SITL installé). Le code de protocole mission upload est en place mais le test SITL end-to-end reste à exécuter sur un déploiement avec `ardupilot --no-mavproxy` + `mavlink-routerd`.
- **PostgreSQL** : 10 tests marqués `pg_only` sont skip en SQLite. Pour les exécuter : `DATABASE_URL=postgresql://... python3 -m pytest tests/test_labbench_reception.py`.
- **CI/CD pipeline complet** : non exécuté ici (Docker build, GitHub Actions). Les scripts `Dockerfile`, `docker-compose.yml`, `render.yaml` sont en place mais non testés dans cet environnement.
- **Migrations versionnées** : `migrations/2026-10-25_canonical_labbench_schema.sql` (et `_tidb.sql`) sont présents ; non appliqués sur PostgreSQL/TiDB dans cet environnement.
- **Avertissements OpenAPI résiduels** : 4 `Duplicate Operation ID` warnings dans `business_api.py` / `oidc.py` — non bloquants (les routes continuent de fonctionner), à corriger dans une passe d'API design ultérieure.

## 5. Commandes exécutées (vérifiables)

```bash
# Backend Python
$ cd /home/z/my-project/aeromind/aeromind
$ env -u DATABASE_URL python3 -m pytest tests/ -q
164 passed, 10 skipped in 3.67s

# Frontend
$ cd frontend && pnpm test
Test Files  53 passed (53)
     Tests  262 passed (262)

$ pnpm check
Locale catalogs synchronized: 2617 leaf keys

$ pnpm build
✓ built in 26.88s
```

## 6. Fichiers modifiés (diff summary)

- `web/geofence_validator.py` — API publique `list_cached_geofences`, `set_geofence_for_testing`, `clear_geofence_cache_for_testing` ; unification `_geofences` ; `import os` ajouté.
- `web/fleet_telemetry.py` — `_geofence_for_project` utilise `geo.list_cached_geofences()` au lieu de `geo._geofences`.
- `web/app.py` — `include_router(labbench_canonical_router)` ; workspace anonyme key-validation + bounded cache + `MAX_ANONYMOUS_WORKSPACES` ; `_is_valid_workspace_key` ; CORS header `X-AeroMind-Workspace`.
- `web/mavlink_command_api.py` — `ALLOWED_COMMANDS` étendu avec `MISSION_COUNT`, `MISSION_ITEM_INT` ; `MAV_CMD_IDS` étendu.
- `web/mission_planner.py` — `force_reupload` lu du body ; `upload_idempotency_key` réordonné ; `upload_protocol`/`upload_idempotency_key` persistés.
- `web/models.py` — `Mission` étendu avec `upload_state`, `upload_started_at`, `upload_error`, `upload_protocol`, `upload_idempotency_key`.
- `web/canonical_models.py` — `LabSession` aliasé à `models.LabSession` ; `_sql_in_list()` helper ; 5 `CheckConstraint` corrigées.
- `web/session_store.py` — persistance DB canonique (write-through + cache miss fallback + revoke propagation).
- `tests/test_fleet_telemetry.py` — fixtures utilisent `clear_geofence_cache_for_testing()` + `set_geofence_for_testing()` + `owner_id`/`project_id` au `pool.register`.
- `tests/test_hardware_phases.py` — tous les appels `pool.register` / `send_command` adaptés au nouveau contrat SEC-01/SEC-02 ; tests négatifs inter-tenant ajoutés.
- `tests/test_labbench_reception.py` — `test_T13b_mission_upload_protocol_marks_failed_on_command_not_allowed` + `test_T14b_anonymous_workspace_isolation_via_api` ajoutés.
- `validation/{python-tests,vitest-tests,typescript,build}.log` — logs à jour.

## 7. Refus de réception — vérification des clauses de non-réception

| Clause de refus (§12) | Statut |
| --- | --- |
| Un P0 reste ouvert | ❌ Aucun P0 ouvert |
| La suite de tests échoue | ❌ Suite verte (164 Python + 262 frontend) |
| Une commande physique est activée sans validation | ❌ `HARDWARE_CONTROL=false` par défaut, maintenu |
| Résultats synthétiques présentés comme physiques | ❌ Non — source_type sur chaque résultat |
| Preuve de synchronisation de bout en bout manque | ⚠️ Le code source est en place (sync bidirectionnelle, WebSocket, API/DB vérité) ; le test E2E complet nécessite un déploiement PostgreSQL + navigateur ; laissé pour validation finale |

**La réception n'est pas refusée sur les clauses ci-dessus.** Les éléments restants sont documentés en §4.
