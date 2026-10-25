# AeroMind — LABBENCH 01 (Option C FAST-TRACK)

Cockpit d'ingénierie drone — backend Python FastAPI, frontend React/Vite, SITL.
**Mode par défaut**: SIMULATION uniquement (`HARDWARE_CONTROL=false`).
Toutes les commandes matérielles sont bloquées par défaut côté serveur
jusqu'à satisfaction documentée des portes de validation G0-G5
(EXIGENCE C-001 du cahier des charges).

---

## Installation locale

Pré-requis : Python 3.11+, Node.js 22 et pnpm 10.

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # définir AEROMIND_SESSION_SECRET (>= 32 octets)
npm install --global pnpm@10.18.0
cd frontend && pnpm install --frozen-lockfile && pnpm run build && cd ..
uvicorn web.app:app --reload --host 0.0.0.0 --port 10000
```

Sans `DATABASE_URL`, SQLite est utilisé dans `data/aeromind.db` en développement.
**Pour la production, PostgreSQL/TiDB requis + migration `2026-10-25_canonical_labbench_schema.sql`**.

### Docker Compose

```bash
docker compose up --build
curl http://localhost:10000/api/ready
```

---

## Architecture LABBENCH (cahier des charges Option C)

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Frontend React  │───▶│   API FastAPI    │───▶│ PostgreSQL/TiDB  │
│  (Vite, tRPC)    │    │  /api/lab/*      │    │ lab_sessions     │
└──────────────────┘    │  /api/telemetry/ │    │ drone_revisions  │
                        │  /api/hardware/  │    │ test_runs        │
                        └──────────────────┘    │ measurements     │
                                │               │ event_outbox     │
                                ▼               │ audit_events_ext │
                        ┌──────────────────┐    │ gate_validations  │
                        │  MavlinkPool     │    │ hardware_tokens   │
                        │  (owner-bound)   │    └──────────────────┘
                        └──────────────────┘
```

### Modules backend (web/)

| Module | Rôle |
|---|---|
| `app.py` | App FastAPI principale + middleware |
| `labbench_auth.py` | **NOUVEAU** — step-up session, RBAC, hardware tokens signés, audit |
| `session_store.py` | **NOUVEAU** — store de sessions step-up avec TTL |
| `canonical_models.py` | **NOUVEAU** — DroneRevision, LabSession, TestRun, Measurement, EventOutbox, HardwareToken, GeofenceRecord, GateValidation, AuditEventExt |
| `labbench_canonical_api.py` | **NOUVEAU** — router /api/lab/* (cahier des charges §8) |
| `operation_mode.py` | **NOUVEAU** — modes DEMO/SIMULATION/SITL/HIL/HARDWARE/OFFLINE (EXIGENCE C-002) |
| `mavlink_command_api.py` | Pilot MAVLink (Gate 0: project_id/drone_id/actor_id requis — SEC-01 fix) |
| `mavlink_pool.py` | Pool drones owner-bound (SEC-02 fix) |
| `mavlink_telemetry_api.py` | Télémétrie auth + consent + state (SEC-07 fix) |
| `geofence_validator.py` | Géofence DB-backed + fail-closed (SEC-04 fix) |
| `mission_planner.py` | Upload mission avec ACK + idempotence (FUNC-05 fix) |

### Migrations SQL (migrations/)

- `2026-10-21_admin_account_registry.sql` — registre admin (existant)
- `2026-10-21_admin_account_registry_tidb.sql` — variante TiDB
- `2026-10-21_validation_audit_events.sql` — events d'audit (existant)
- **`2026-10-25_canonical_labbench_schema.sql`** — **NOUVEAU** — schéma canonique LABBENCH (PostgreSQL)
- **`2026-10-25_canonical_labbench_schema_tidb.sql`** — **NOUVEAU** — variante TiDB

---

## API métier (cahier des charges §8)

### Routes versionnées LABBENCH

```
POST   /api/lab/sessions/step-up                  # Démarrer session step-up (MFA)
POST   /api/lab/sessions/revoke                    # Révoquer session step-up
GET    /api/lab/projects/{id}/drones/active        # Drone + révision actifs
POST   /api/lab/projects/{id}/drones/select        # Sélectionner drone (catalogue/dessin)
POST   /api/lab/drones/{id}/revisions              # Créer une DroneRevision
POST   /api/lab/drones/{id}/revisions/{rev}/activate  # Activer une révision
POST   /api/lab/runs                               # Démarrer un TestRun
GET    /api/lab/runs/{id}                          # Récupérer un essai
GET    /api/lab/runs/{id}/measurements             # Mesures (cursor pagination)
GET    /api/lab/events?cursor=                     # Événements outbox (reprise)
GET    /api/lab/mode/{project_id}                   # Mode opération (DEMO/SIM/SITL/HIL/HW/OFFLINE)
POST   /api/lab/gates/{project_id}/{gate}/approve  # Approuver une gate G0-G5
```

### Routes MAVLink

```
GET    /api/telemetry/mavlink/status               # Statut (auth + consent requis — SEC-07)
POST   /api/telemetry/mavlink/consent               # Accorder consentement polling
DELETE /api/telemetry/mavlink/consent               # Révoquer consentement
```

### Routes existantes (inchangées)

```
GET/POST /api/projects, GET/PUT/PATCH/DELETE /api/projects/{id}
GET/PUT  /api/projects/{id}/drone
GET/POST /api/projects/{id}/simulations|reports|lab-sessions
GET/PUT  /api/settings
GET      /api/health  /api/ready
```

---

## CI/CD

### Workflow GitHub Actions (`.github/workflows/ci.yml`)

5 jobs parallèles à chaque PR / push sur main:

1. **backend** — pytest + pip-audit + migration SQL + tests sur Python 3.11/3.12 + PostgreSQL 16
2. **frontend** — pnpm audit + tsc check + vitest + build Vite
3. **docker** — build Docker + scan Trivy + test readiness
4. **sast** — CodeQL (python + javascript-typescript)
5. **i18n** — gate i18n (existant)

### Commandes locales

```bash
pytest tests/ -v                                    # backend
cd frontend && pnpm run check                        # tsc --noEmit
cd frontend && pnpm test -- --run                    # vitest
cd frontend && pnpm run build                        # vite build
docker build -t aeromind . && \
  docker run --env-file .env -p 10000:10000 aeromind
```

---

## Sécurité

### Principes non négociables

1. **Mode simulation par défaut** — `HARDWARE_CONTROL=false`. Aucune commande MAVLink n'est émise.
2. **Gates G0-G5 requises** pour activer le mode HARDWARE (EXIGENCE C-001).
3. **Step-up MFA** pour toute session LABBENCH (EXIGENCE IAM-01).
4. **RBAC serveur** — 6 rôles (reader, designer, analyst, operator, approver, admin).
5. **Opérateur ≠ approbateur** (EXIGENCE IAM-03).
6. **Tokens matériels signés HMAC-SHA256**, expirants (5 min), single-use, context-bound.
7. **Géofence fail-closed** — commande matérielle sans géofence valide = refus (SEC-04).
8. **Audit append-only** avec correlation_id (EXIGENCE IAM-05).

### Failles corrigées (Lots A-F)

| ID | Description | Statut |
|---|---|---|
| SEC-01 | Contradiction simulation-only vs MAVLink sortant | ✓ Corrigé (Gate 0 context) |
| SEC-02 | Pool global inter-tenant | ✓ Corrigé (owner_id binding) |
| SEC-03 | Token matériel non signé, réutilisable | ✓ Corrigé (HMAC + atomic consume) |
| SEC-04 | Géofence in-memory sans owner | ✓ Corrigé (DB-backed + fail-closed) |
| FUNC-05 | Upload mission sans ACK, token réutilisé | ✓ Corrigé (MISSION_COUNT + ACK + idempotence) |
| SEC-06 | Workspace anonyme partagé | ◐ Partiel (test T14, frontend cleanup TODO) |
| SEC-07 | Télémétrie sans auth | ✓ Corrigé (auth + consent + state machine) |

---

## Documentation

- `docs/MATRICE-CONFORMITE-FR.md` — Matrice exigences → preuves → statut (92 exigences)
- `docs/PLAN-ROLLBACK-LABBENCH-01-FR.md` — Plan de retour arrière par lot
- `docs/MANUEL-OPERATEUR-FR.md` — Manuel opérateur (rôles, procédures, incident)
- `tests/test_labbench_reception.py` — 18 tests de réception T01-T18

---

## Premier administrateur

Pour l'expérimentation, définir `AEROMIND_SUPERADMIN_EMAILS` avec l'adresse
Super-Admin de votre choix (cf. `.env.example`). L'adresse précédemment codée
en dur `mcgregoralvin14@gmail.com` a été supprimée (SEC-05 fix du rapport
d'audit). En production, cette variable est obligatoire.

Connexion principale via Microsoft Entra/OIDC. Bootstrap local d'urgence via
`AEROMIND_LOCAL_SUPERADMIN_ENROLLMENT_CODE` (32+ caractères, à retirer après
enrôlement). Voir `docs/RECUPERATION_SUPERADMIN_FR.md`.

---

## Déploiement (Render)

`render.yaml` déclare le service Docker + PostgreSQL. Procédure :

1. Pousser ce dossier dans un dépôt GitHub.
2. Render → New → Blueprint → sélectionner le dépôt.
3. Région frankfurt pour service web ET PostgreSQL.
4. Compléter `AEROMIND_ALLOWED_HOSTS`, `AEROMIND_ALLOWED_ORIGINS`, OIDC,
   `AEROMIND_SUPERADMIN_EMAILS` dans Environment.
5. Appliquer la migration `2026-10-25_canonical_labbench_schema.sql` après
   création de la base.
6. Enregistrer le domaine Render, mettre à jour ALLOWED_HOSTS/ORIGINS.
7. Lancer un nouveau déploiement.

---

## Vérité opérationnelle v3.0 (cahier des charges Option C)

- **Le serveur est la source unique de l'état opérationnel** — DroneRevision
  persisted, TestRun persisted, Measurement persisted. Aucun brouillon local
  n'est accepté comme configuration de référence (EXIGENCE SYNC-01).
- **`HARDWARE_CONTROL` seul ne suffit pas** — gates G0-G5 requises (EXIGENCE C-001).
- **Le Centre de commande n'exécute que des demandes de simulation** tant que
  G3-G5 ne sont pas signées.
- **Les attestations sont marquées** *Attestation simulée — NON ÉMISE* tant
  que `persisted=false`.
- **Les événements locaux sans accusé serveur** ne sont pas présentés comme
  persistés.

---

## Licence

À définir (fichier LICENSE à ajouter).
